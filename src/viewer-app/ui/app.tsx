import {
  GATEWAY_CAPABILITY_UNIVERFILE_VIEWER,
  WorktreeControlClient,
  fetchGatewayDescriptor,
  type MergePreview,
  type MergePreviewUnitResponse,
  type Worktree,
  type WorktreeLifecycleEvent,
  type UnitSummary,
} from "@univer/collab-gateway-contract";
import type { LocaleType } from "@univerjs/core";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import {
  applyDocumentAppearance,
  currentAppearance,
  persistAppearance,
  setAppearance,
  type Appearance,
} from "../appearance";
import type { AppConfig, AppContentScope, AppMode, WriteLocationOptions } from "../core/config";
import { gatewayFileEndpointFromKey, ufPrefix, writeLocation } from "../core/config";
import { type EventChannel, openEventChannel } from "../core/events";
import { loadViewerLocale } from "../core/locales/generated/load";
import { createPreviewViewer, createViewer, type ViewerHandle } from "../core/viewer";
import {
  activateLang,
  applyDocumentLang,
  currentLang,
  loadMessages,
  persistLang,
  sdkLocaleOf,
  t,
  type Lang,
} from "../i18n";
import type { Messages } from "../i18n/locales/en-US";
import { persistSidebarCollapsed, resolveSidebarCollapsed } from "../sidebar-preference";
import { AppView } from "./app-view";
import { el } from "./dom";
import { changeBadgeInfo, previewBadgeInfo, type ChangeTagVariant } from "./format";
import { confirmDialog, conflictDialog, escapeHtml, toast, type DialogChip } from "./modals";

type View = { kind: "trunk" } | { kind: "worktree"; worktreeId: string };
type ViewableWorktreeStatus = Extract<Worktree["status"], "draft" | "ready">;

function isViewableWorktreeStatus(status: Worktree["status"]): status is ViewableWorktreeStatus {
  switch (status) {
    case "draft":
    case "ready":
      return true;
    default:
      return false;
  }
}

/** What the content-pane viewer is currently showing: a live (collab) unit or a read-only preview. */
type ViewerJob =
  | { mode: "live"; view: View; unit: UnitSummary; editable: boolean }
  | { mode: "preview"; unit: UnitSummary; data: MergePreviewUnitResponse };

/** Immutable snapshot of everything the React shell renders; rebuilt on every state change. */
export interface AppSnapshot {
  view: View;
  selectedUnitId: string | undefined;
  trunkUnits: UnitSummary[];
  worktreeUnits: UnitSummary[];
  worktrees: Worktree[];
  previews: Map<string, MergePreview>;
  previewErrors: Map<string, string>;
  viewPreview: boolean;
  trunkEditingOptIn: boolean;
  flashWorktreeId: string | undefined;
  busy: boolean;
  lang: Lang;
  languageLoading: Lang | undefined;
  languageError: boolean;
  appearance: Appearance;
  sidebarCollapsed: boolean;
}

/** Manages the read-only Univer instance in the content pane; rebuilds only on context/unit change. */
class ViewerController {
  private handle: ViewerHandle | undefined = undefined;
  private content: HTMLElement | undefined = undefined;
  private host: HTMLElement | undefined = undefined;
  private key = "";
  private last: ViewerJob | undefined = undefined;
  private generation = 0;
  private pendingKey = "";
  private pending: Promise<void> | undefined = undefined;

  public constructor(
    private readonly cfg: AppConfig,
    private readonly setBusy: (on: boolean) => void,
    /** Read fresh on every rebuild — never stored on a job, so `reload()` picks up a
     * language the user changed after the job was created. */
    private readonly getLocale: () => LocaleType,
    private readonly getDarkMode: () => boolean,
  ) {}

  public setDarkMode(isDarkMode: boolean): void {
    this.handle?.setDarkMode(isDarkMode);
  }

  public prepareLocale(locale: LocaleType): Promise<unknown> {
    return loadViewerLocale(locale);
  }

  public async setLocale(locale: LocaleType, messages: Messages = t()): Promise<void> {
    await this.handle?.setLocale(locale, this.readOnlyCopy(this.last, messages));
  }

  /** The React content pane hands its host element to the viewer once mounted. */
  public bind(content: HTMLElement): void {
    this.content = content;
  }

  public async show(view: View, unit: UnitSummary, editable: boolean): Promise<void> {
    const key = `live::${view.kind === "worktree" ? view.worktreeId : "trunk"}::${unit.unitId}::${editable}`;
    if (key === this.key && this.handle) {
      return;
    }
    this.key = key;
    this.last = { mode: "live", view, unit, editable };
    await this.rebuild();
  }

  /**
   * Read-only merge-preview render of one unit, from the gateway's computed `{snapshot, changesets}`
   * (no collaboration). Always rebuilds: preview data is re-fetched on unit switch and recompute.
   */
  public async showPreview(
    worktreeId: string,
    unit: UnitSummary,
    data: MergePreviewUnitResponse,
  ): Promise<void> {
    this.key = `preview::${worktreeId}::${unit.unitId}::${Date.now()}`;
    this.last = { mode: "preview", unit, data };
    await this.rebuild();
  }

  /**
   * Full rebuild of the current context/unit — used for `reset` (true version rollback) and for
   * a language change. Unlike `show()`, this must not be coalesced into an in-flight rebuild:
   * that build captured the old data/locale, so joining it would silently drop the new one.
   */
  public async reload(): Promise<void> {
    if (this.last) {
      await this.rebuild(true);
    }
  }

  public clearView(): void {
    this.key = "";
    this.last = undefined;
    this.teardown();
  }

  /** Replace the content pane with a plain message (e.g. a unit that won't render in preview). */
  public showMessage(text: string): void {
    if (this.content === undefined) {
      return;
    }
    this.key = "";
    this.last = undefined;
    this.teardown();
    const note = el("div", {
      class:
        "flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground",
      text,
    });
    this.content.append(note);
    this.host = note;
  }

  private async rebuild(force = false): Promise<void> {
    const job = this.last;
    if (!job) {
      return;
    }
    if (this.pending && this.pendingKey === this.key) {
      await this.pending;
      if (!force) {
        return;
      }
    }

    const pending = this.performRebuild(job);
    this.pendingKey = this.key;
    this.pending = pending;
    try {
      await pending;
    } finally {
      if (this.pending === pending) {
        this.pending = undefined;
        this.pendingKey = "";
      }
    }
  }

  private async performRebuild(job: ViewerJob): Promise<void> {
    const content = this.content;
    if (content === undefined) {
      return;
    }
    this.setBusy(true);
    this.teardown();
    const generation = this.generation;
    const id = `univer-host-${Math.random().toString(36).slice(2)}`;
    const host = el("div", { class: "absolute inset-0", attrs: { id } });
    content.append(host);
    this.host = host;
    try {
      let handle: ViewerHandle;
      if (job.mode === "preview") {
        handle = await createPreviewViewer({
          container: id,
          unitType: job.unit.type,
          snapshot: job.data.snapshot,
          ...(job.data.sheetBlocks === undefined ? {} : { sheetBlocks: job.data.sheetBlocks }),
          changesets: job.data.changesets,
          locale: this.getLocale(),
          darkMode: this.getDarkMode(),
          readOnlyCopy: this.readOnlyCopy(job),
        });
      } else {
        handle = await createViewer({
          container: id,
          origin: this.cfg.origin,
          univerfile: this.cfg.univerfile,
          ...(this.cfg.gatewayFileKey === undefined
            ? {}
            : { gatewayFileKey: this.cfg.gatewayFileKey }),
          ...(job.view.kind === "worktree" ? { worktreeId: job.view.worktreeId } : {}),
          unitId: job.unit.unitId,
          unitType: job.unit.type,
          // Only trunk views can be editable; worktree views are always read-only.
          editable: job.view.kind === "trunk" && job.editable,
          locale: this.getLocale(),
          darkMode: this.getDarkMode(),
          readOnlyCopy: this.readOnlyCopy(job),
        });
      }
      if (generation !== this.generation) {
        handle.dispose();
        host.remove();
        return;
      }
      this.handle = handle;
      // Preferences may have changed while this async viewer was being created.
      handle.setDarkMode(this.getDarkMode());
      await handle.setLocale(this.getLocale(), this.readOnlyCopy(job));
    } catch (error) {
      if (generation === this.generation) {
        host.append(
          el("div", {
            class: "m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700",
            text: t().viewer.loadFailed(String(error)),
          }),
        );
      }
    } finally {
      if (generation === this.generation) {
        this.setBusy(false);
      }
    }
  }

  private readOnlyCopy(job: ViewerJob | undefined, messages: Messages = t()) {
    const message =
      job?.mode === "preview"
        ? messages.viewer.mergePreviewReadOnly
        : job?.view.kind === "worktree"
          ? messages.viewer.worktreeReadOnly
          : messages.viewer.currentVersionReadOnly;
    return { title: messages.topbar.readOnlyPreview, message };
  }

  private teardown(): void {
    this.generation += 1;
    this.handle?.dispose();
    this.handle = undefined;
    if (this.host) {
      this.host.remove();
      this.host = undefined;
    }
  }
}

/**
 * The collaboration viewer shell: owns all state and business logic, and exposes itself to the
 * React view as a store (`subscribe` / `getSnapshot` + public actions). Rendering is React-only;
 * the view never mutates state directly.
 */
export class App {
  private readonly control: WorktreeControlClient;
  private worktrees = new Map<string, Worktree>();
  /** Monotonic WebSocket generation used to reject older HTTP lifecycle snapshots. */
  private readonly worktreeEventVersions = new Map<string, number>();
  private trunkUnits: UnitSummary[] = [];
  private worktreeUnits: UnitSummary[] = [];
  private view: View = { kind: "trunk" };
  private selectedUnitId: string | undefined = undefined;
  /** User opted in to editing the current version while modifications are still pending. */
  private trunkEditingOptIn = false;
  /** Worktree whose sidebar row should flash once — set when it just turned ready. */
  private flashWorktreeId: string | undefined = undefined;
  /** Per-worktree merge-preview summary (status badges + diverged/mergeable), fetched on enter. */
  private previews = new Map<string, MergePreview>();
  /** Why a worktree's merge preview is unavailable (business error / fetch failure), by worktreeId. */
  private previewErrors = new Map<string, string>();
  /** Within a diverged worktree: showing the merge preview (true) vs the original edits (false). */
  private viewPreview = false;
  /** Keep `?lang=` in the address bar once it arrived there (deep link) or the user toggled it. */
  private langInUrl = new URLSearchParams(location.search).has("lang");
  /** Local shell preference; independent from file/worktree state. */
  private sidebarCollapsed = resolveSidebarCollapsed();
  private busy = false;
  private languageLoading: Lang | undefined = undefined;
  private languageError = false;
  private languageGeneration = 0;

  private univerfileEvents?: EventChannel;
  private worktreeEvents: EventChannel | undefined = undefined;

  private readonly listeners = new Set<() => void>();
  private snapshot: AppSnapshot;
  private reactRoot: Root | undefined = undefined;

  private readonly viewer: ViewerController;
  private readonly cfg: AppConfig;
  private readonly initWorktreeId: string | null;
  private readonly initUnitId: string | null;
  private readonly initScope: AppContentScope;
  private readonly initEditable: boolean | null;

  public constructor(
    private readonly root: HTMLElement,
    origin: string,
    univerfile: string,
    initWorktreeId: string | null,
    initUnitId: string | null,
    initScope: AppContentScope,
    initEditable: boolean | null,
    public readonly mode: AppMode,
    gatewayFileKey?: string,
  ) {
    this.cfg = {
      origin,
      univerfile,
      ...(gatewayFileKey === undefined ? {} : { gatewayFileKey }),
    };
    document.title = this.univerfileName;
    this.initWorktreeId = initWorktreeId;
    this.initUnitId = initUnitId;
    this.initScope = initScope;
    this.initEditable = initEditable;
    this.control =
      gatewayFileKey === undefined
        ? new WorktreeControlClient({ origin, univerfile })
        : new WorktreeControlClient({ origin, gatewayFileKey });
    this.viewer = new ViewerController(
      this.cfg,
      (on) => this.setBusy(on),
      () => sdkLocaleOf(currentLang()),
      () => currentAppearance() === "dark",
    );
    this.snapshot = this.collectSnapshot();
  }

  public static sameOriginGateway(
    root: HTMLElement,
    gatewayFileKey: string,
    initWorktreeId: string | null,
    initUnitId: string | null,
    initScope: AppContentScope,
    initEditable: boolean | null,
    mode: AppMode,
  ): App {
    return new App(
      root,
      location.origin,
      `/uf/${gatewayFileKey}`,
      initWorktreeId,
      initUnitId,
      initScope,
      initEditable,
      mode,
      gatewayFileKey,
    );
  }

  // ---- store bridge (React reads the shell through this) ----

  public readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public readonly getSnapshot = (): AppSnapshot => this.snapshot;

  /** Unmount the React shell (tests dispose between cases; the page itself never does). */
  public dispose(): void {
    this.univerfileEvents?.close();
    this.worktreeEvents?.close();
    this.reactRoot?.unmount();
    this.reactRoot = undefined;
  }

  /** Display label for the sidebar header (file name without the .univer suffix). */
  public get univerfileName(): string {
    return (
      this.cfg.univerfile
        .split(/[\\/]/u)
        .pop()
        ?.replace(/\.univer$/iu, "") ?? "univerfile"
    );
  }

  public get univerfilePath(): string {
    return this.cfg.univerfile;
  }

  /** The React content pane binds its host element here; the viewer renders inside it. */
  public bindContent(node: HTMLElement | null): void {
    if (node) {
      this.viewer.bind(node);
    }
  }

  /** Publish the current state to React and mirror it into the address bar. */
  private emit(): void {
    this.snapshot = this.collectSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
    this.syncUrl();
  }

  private collectSnapshot(): AppSnapshot {
    return {
      view: this.view,
      selectedUnitId: this.selectedUnitId,
      trunkUnits: this.trunkUnits,
      worktreeUnits: this.worktreeUnits,
      worktrees: [...this.worktrees.values()],
      previews: this.previews,
      previewErrors: this.previewErrors,
      viewPreview: this.viewPreview,
      trunkEditingOptIn: this.trunkEditingOptIn,
      flashWorktreeId: this.flashWorktreeId,
      busy: this.busy,
      lang: currentLang(),
      languageLoading: this.languageLoading,
      languageError: this.languageError,
      appearance: currentAppearance(),
      sidebarCollapsed: this.sidebarCollapsed,
    };
  }

  public async start(): Promise<void> {
    if (this.cfg.gatewayFileKey !== undefined) {
      await fetchGatewayDescriptor({
        endpoint: gatewayFileEndpointFromKey(this.cfg.origin, this.cfg.gatewayFileKey),
        requiredCapability: GATEWAY_CAPABILITY_UNIVERFILE_VIEWER,
      });
    }
    // Mount the React shell up-front so every state change below lands on screen.
    this.reactRoot = createRoot(this.root);
    flushSync(() => {
      this.reactRoot?.render(<AppView app={this} />);
    });

    await this.reloadAll();
    this.subscribeUniverfile();

    if (this.mode === "embedded") {
      await this.restoreEmbeddedView();
      return;
    }

    // Restore the view the address bar asked for (deep-link / refresh-stable).
    const initWorktree =
      this.initWorktreeId !== null ? this.worktrees.get(this.initWorktreeId) : undefined;
    if (initWorktree && isViewableWorktreeStatus(initWorktree.status)) {
      await this.enterWorktree(initWorktree.worktreeId, this.initUnitId ?? undefined);
    } else {
      if (this.initWorktreeId !== null && !initWorktree) {
        toast(t().toast.worktreeGone);
      }
      this.emit();
      this.autoSelectFirstTrunk(this.initUnitId ?? undefined);
    }
  }

  /** Mirror the current view (file + worktree + unit) into the address bar. */
  private syncUrl(): void {
    const loc: WriteLocationOptions = {
      univerfile: this.cfg.univerfile,
      ...(this.cfg.gatewayFileKey === undefined ? {} : { gatewayFileKey: this.cfg.gatewayFileKey }),
      mode: this.mode,
    };
    if (this.view.kind === "worktree") {
      loc.worktreeId = this.view.worktreeId;
    }
    if (this.selectedUnitId !== undefined) {
      loc.unitId = this.selectedUnitId;
    }
    if (this.mode === "embedded") {
      loc.scope = this.contentScope();
      loc.editable = this.trunkEditableNow();
    }
    if (this.langInUrl) {
      loc.lang = currentLang();
    }
    writeLocation(loc);
  }

  // ---- data ----

  private async reloadAll(): Promise<void> {
    const [units, worktrees] = await Promise.all([
      this.control.listUnits(),
      this.control.listWorktrees(),
    ]);
    this.trunkUnits = units;
    this.worktrees = new Map(worktrees.map((f) => [f.worktreeId, f]));
  }

  private async loadWorktreeUnits(worktreeId: string): Promise<void> {
    this.worktreeUnits = await this.control.listUnits(worktreeId);
  }

  /**
   * Fetch (or refresh) a worktree's merge-preview summary. Tolerant of failure: a business error
   * (HTTP 200 + error.code !== 1, e.g. a transform failure) or a fetch error clears the preview
   * and records the reason, so the UI degrades to baseline badges plus a notice instead of crashing.
   */
  private async refreshPreview(worktreeId: string): Promise<void> {
    try {
      const res = await this.control.previewMerge(worktreeId);
      if (res.error.code !== 1) {
        throw new Error(res.error.message || t().viewer.previewComputeFailed);
      }
      this.previews.set(worktreeId, res);
      this.previewErrors.delete(worktreeId);
    } catch (error) {
      this.previews.delete(worktreeId);
      this.previewErrors.set(worktreeId, error instanceof Error ? error.message : String(error));
    }
  }

  private currentUnits(): UnitSummary[] {
    return this.view.kind === "worktree" ? this.worktreeUnits : this.trunkUnits;
  }

  // ---- worktree unit change status (vs the worktree's baseline) ----

  /** A worktree unit's change vs trunk at worktree time: added (created in-worktree), modified, or unchanged. */
  private worktreeUnitChange(
    worktree: Worktree,
    u: UnitSummary,
  ): "added" | "modified" | "unchanged" {
    if (!Object.prototype.hasOwnProperty.call(worktree.baseline, u.unitId)) {
      return "added";
    }
    return u.headRev > worktree.baseline[u.unitId]! ? "modified" : "unchanged";
  }

  /** Baseline units no longer present in the worktree = deleted; name/type recovered from trunk. */
  public worktreeDeletedUnits(
    worktree: Worktree,
  ): Array<{ unitId: string; name: string; type: number }> {
    const present = new Set(this.worktreeUnits.map((u) => u.unitId));
    const out: Array<{ unitId: string; name: string; type: number }> = [];
    for (const unitId of Object.keys(worktree.baseline)) {
      if (present.has(unitId)) {
        continue;
      }
      const trunk = this.trunkUnits.find((u) => u.unitId === unitId);
      out.push({ unitId, name: trunk?.name || unitId, type: trunk?.type ?? 2 });
    }
    return out;
  }

  /** Counts for the worktree's one-line overview (modified / added / deleted). */
  public worktreeChangeSummary(worktree: Worktree): {
    modified: number;
    added: number;
    deleted: number;
  } {
    let modified = 0;
    let added = 0;
    for (const u of this.worktreeUnits) {
      const c = this.worktreeUnitChange(worktree, u);
      if (c === "added") {
        added++;
      } else if (c === "modified") {
        modified++;
      }
    }
    return { modified, added, deleted: this.worktreeDeletedUnits(worktree).length };
  }

  /**
   * A worktree unit's badge — prefers the server preview status (adds conflict / updated),
   * falls back to the baseline diff while the preview is missing or broken.
   */
  public unitBadgeInfo(
    worktree: Worktree,
    u: UnitSummary,
  ): { variant: ChangeTagVariant; text: string } | undefined {
    const p = this.previews.get(worktree.worktreeId)?.units?.find((x) => x.unitId === u.unitId);
    if (p) {
      return previewBadgeInfo(p);
    }
    return changeBadgeInfo(this.worktreeUnitChange(worktree, u));
  }

  // ---- trunk editing gate (univerfile-level) ----

  /** Number of modifications still in progress (draft) or awaiting confirmation (ready). */
  public pendingWorktreeCount(): number {
    let n = 0;
    for (const f of this.worktrees.values()) {
      if (f.status === "draft" || f.status === "ready") {
        n++;
      }
    }
    return n;
  }

  private hasPendingWorktrees(): boolean {
    return this.pendingWorktreeCount() > 0;
  }

  /**
   * Whether the current version (trunk) should be editable right now: editable when nothing is
   * pending; when modifications are pending the user must opt in first (and is warned).
   */
  private trunkEditableNow(): boolean {
    if (this.mode === "embedded" && this.initEditable !== null) {
      return this.initEditable;
    }
    return !this.hasPendingWorktrees() || this.trunkEditingOptIn;
  }

  /**
   * Re-evaluate the gate after the worktree set changed: drop the opt-in once nothing is pending, and
   * when viewing trunk re-show the unit so the viewer rebuilds read-only<->editable as it flips.
   */
  private refreshTrunkGate(): void {
    if (!this.hasPendingWorktrees()) {
      this.trunkEditingOptIn = false;
    }
    this.emit();
    if (this.view.kind === "trunk" && this.selectedUnitId !== undefined) {
      const unit = this.trunkUnits.find((u) => u.unitId === this.selectedUnitId);
      if (unit) {
        void this.viewer.show(this.view, unit, this.trunkEditableNow());
      }
    }
  }

  // ---- lifecycle events (WebSocket) ----

  private subscribeUniverfile(): void {
    this.univerfileEvents?.close();
    const url = `${ufPrefix(this.cfg)}/events`;
    this.univerfileEvents = openEventChannel(url, {
      worktree: (e) => this.onWorktreeEvent(e.worktree),
      // Trunk units must stay current regardless of the active view: the sidebar "Files"
      // section always lists trunkUnits, including while a worktree is being viewed (e.g. a worktree
      // adds/removes a file and is then merged from its own view).
      unit_added: (e) => {
        if (!this.trunkUnits.some((u) => u.unitId === e.unitId)) {
          this.trunkUnits.push({ unitId: e.unitId, type: e.unitType, name: e.name, headRev: 0 });
          this.emit();
        }
      },
      unit_updated: (e) => this.onUnitUpdated("trunk", e),
      unit_removed: (e) => {
        this.trunkUnits = this.trunkUnits.filter((u) => u.unitId !== e.unitId);
        this.emit();
      },
      open: () => {
        void this.reloadAll().then(() => this.refreshTrunkGate());
      },
    });
  }

  private subscribeWorktree(worktreeId: string): void {
    this.worktreeEvents?.close();
    const url = `${ufPrefix(this.cfg)}/worktrees/${worktreeId}/events`;
    this.worktreeEvents = openEventChannel(url, {
      reset: () => {
        toast(t().toast.agentReset);
        void this.onWorktreeReset(worktreeId);
      },
      unit_added: (e) => {
        if (!this.worktreeUnits.some((u) => u.unitId === e.unitId)) {
          this.worktreeUnits.push({ unitId: e.unitId, type: e.unitType, name: e.name, headRev: 0 });
          this.emit();
        }
      },
      unit_updated: (e) => this.onUnitUpdated("worktree", e),
      unit_removed: (e) => {
        this.worktreeUnits = this.worktreeUnits.filter((u) => u.unitId !== e.unitId);
        this.emit();
      },
      open: () => {
        void this.loadWorktreeUnits(worktreeId).then(() => this.emit());
      },
    });
  }

  private onUnitUpdated(
    scope: "trunk" | "worktree",
    event: Extract<WorktreeLifecycleEvent, { type: "unit_updated" }>,
  ): void {
    const units = scope === "trunk" ? this.trunkUnits : this.worktreeUnits;
    const index = units.findIndex((unit) => unit.unitId === event.unitId);
    if (index < 0) {
      return;
    }
    units[index] = { ...units[index]!, name: event.name, headRev: event.headRev };
    this.emit();
  }

  /** reset = true version rollback: re-pull the worktree unit list, then full-rebuild the viewer. */
  private async onWorktreeReset(worktreeId: string): Promise<void> {
    if (this.view.kind !== "worktree" || this.view.worktreeId !== worktreeId) {
      return;
    }
    await this.loadWorktreeUnits(worktreeId);
    if (!this.worktreeUnits.some((u) => u.unitId === this.selectedUnitId)) {
      this.emit();
      const first = this.worktreeUnits[0];
      if (first) {
        void this.selectWorktreeUnit(worktreeId, first.unitId);
      } else {
        this.viewer.clearView();
        this.syncUrl();
      }
      return;
    }
    this.emit();
    await this.viewer.reload();
  }

  private onWorktreeEvent(worktree: Worktree): void {
    this.worktreeEventVersions.set(
      worktree.worktreeId,
      (this.worktreeEventVersions.get(worktree.worktreeId) ?? 0) + 1,
    );
    this.applyWorktreeSnapshot(worktree);
  }

  private applyWorktreeSnapshot(worktree: Worktree): void {
    const prev = this.worktrees.get(worktree.worktreeId);
    this.worktrees.set(worktree.worktreeId, worktree);
    // If the worktree being viewed reached a terminal state, drop back to the current version.
    if (this.view.kind === "worktree" && this.view.worktreeId === worktree.worktreeId) {
      if (worktree.status === "merged") {
        toast(t().toast.mergedElsewhere);
        this.exitToHome();
        return;
      }
      if (worktree.status === "discarded") {
        toast(t().toast.discardedElsewhere);
        this.exitToHome();
        return;
      }
      if (
        prev !== undefined &&
        prev.status !== worktree.status &&
        isViewableWorktreeStatus(prev.status) &&
        isViewableWorktreeStatus(worktree.status)
      ) {
        // draft <-> ready changes the server-side write policy. Replace the collaboration
        // session so an old tab cannot retain an in-flight/local queue against stale permissions.
        this.viewer.reload();
      }
    }
    // draft -> ready: the agent just finished; nudge the user and flash that row once.
    if (prev?.status === "draft" && worktree.status === "ready") {
      toast(t().toast.workDone(worktree.name || worktree.worktreeId));
      this.flashWorktreeId = worktree.worktreeId;
      window.setTimeout(() => {
        if (this.flashWorktreeId === worktree.worktreeId) {
          this.flashWorktreeId = undefined;
        }
      }, 2500);
    }
    // Another worktree merging means the latest version may have advanced — recompute the preview
    // of the worktree currently being viewed so "what you'll get" stays honest.
    if (
      worktree.status === "merged" &&
      this.view.kind === "worktree" &&
      this.view.worktreeId !== worktree.worktreeId
    ) {
      this.recomputeOpenPreview(this.view.worktreeId);
    }
    this.refreshTrunkGate();
  }

  /** Re-fetch a viewed worktree's preview after the latest version advanced, and re-render it. */
  private recomputeOpenPreview(worktreeId: string): void {
    void this.refreshPreview(worktreeId).then(() => {
      if (this.view.kind !== "worktree" || this.view.worktreeId !== worktreeId) {
        return;
      }
      toast(t().toast.previewRefreshed);
      this.emit();
      const unitId = this.selectedUnitId;
      const unit =
        unitId === undefined ? undefined : this.worktreeUnits.find((u) => u.unitId === unitId);
      if (this.viewPreview && unit) {
        void this.showUnitPreview(worktreeId, unit);
      }
    });
  }

  // ---- navigation ----

  private async restoreEmbeddedView(): Promise<void> {
    if (this.initScope === "trunk" || this.initWorktreeId === null) {
      this.emit();
      this.autoSelectFirstTrunk(this.initUnitId ?? undefined);
      return;
    }

    const initWorktree = this.worktrees.get(this.initWorktreeId);
    if (initWorktree && isViewableWorktreeStatus(initWorktree.status)) {
      await this.enterWorktree(
        initWorktree.worktreeId,
        this.initUnitId ?? undefined,
        this.initScope === "mergePreview" && initWorktree.status === "ready",
      );
      return;
    }

    toast(t().toast.worktreeGone);
    this.emit();
    this.autoSelectFirstTrunk(this.initUnitId ?? undefined);
  }

  private contentScope(): AppContentScope {
    if (this.view.kind === "trunk") {
      return "trunk";
    }
    return this.viewPreview ? "mergePreview" : "worktree";
  }

  /** Enter a worktree and show its first unit in the content pane. The sidebar stays put. */
  public async enterWorktree(
    worktreeId: string,
    preferUnitId?: string,
    forcePreview?: boolean,
  ): Promise<void> {
    this.view = { kind: "worktree", worktreeId };
    this.selectedUnitId = undefined;
    await this.loadWorktreeUnits(worktreeId);
    await this.refreshPreview(worktreeId);
    // Default to the merge preview when the worktree has fallen behind the latest version.
    this.viewPreview = forcePreview ?? this.previews.get(worktreeId)?.diverged ?? false;
    this.subscribeWorktree(worktreeId);
    this.emit();
    const pick =
      (preferUnitId !== undefined
        ? this.worktreeUnits.find((u) => u.unitId === preferUnitId)
        : undefined) ?? this.worktreeUnits[0];
    if (pick) {
      void this.selectWorktreeUnit(worktreeId, pick.unitId);
    } else {
      this.viewer.clearView();
      this.syncUrl();
    }
  }

  /** Back to the current version (trunk) — used after merge/discard. */
  private exitToHome(): void {
    this.view = { kind: "trunk" };
    this.selectedUnitId = undefined;
    this.viewPreview = false;
    this.worktreeEvents?.close();
    this.worktreeEvents = undefined;
    this.emit();
    this.autoSelectFirstTrunk();
  }

  private autoSelectFirstTrunk(preferUnitId?: string): void {
    const pick =
      (preferUnitId !== undefined
        ? this.trunkUnits.find((u) => u.unitId === preferUnitId)
        : undefined) ?? this.trunkUnits[0];
    if (pick) {
      void this.selectTrunkUnit(pick.unitId);
    } else {
      this.viewer.clearView();
      this.syncUrl();
    }
  }

  /** Show a trunk (current-version) unit, leaving any worktree view. */
  public async selectTrunkUnit(unitId: string): Promise<void> {
    if (this.view.kind === "worktree") {
      this.worktreeEvents?.close();
      this.worktreeEvents = undefined;
      this.view = { kind: "trunk" };
    }
    const unit = this.trunkUnits.find((u) => u.unitId === unitId);
    if (!unit) {
      return;
    }
    this.selectedUnitId = unitId;
    this.emit();
    await this.viewer.show(this.view, unit, this.trunkEditableNow());
  }

  /** Show a unit of the given worktree in the content pane (merge preview or original edits). */
  public async selectWorktreeUnit(worktreeId: string, unitId: string): Promise<void> {
    const unit = this.worktreeUnits.find((u) => u.unitId === unitId);
    if (!unit) {
      return;
    }
    this.view = { kind: "worktree", worktreeId };
    this.selectedUnitId = unitId;
    this.emit();
    if (this.viewPreview) {
      await this.showUnitPreview(worktreeId, unit);
    } else {
      await this.viewer.show(this.view, unit, false);
    }
  }

  /** Render one unit's read-only merge preview; a deleted/errored unit shows a message instead. */
  private async showUnitPreview(worktreeId: string, unit: UnitSummary): Promise<void> {
    try {
      const data = await this.control.getMergePreviewUnit(worktreeId, unit.unitId);
      if (data.error.code !== 1 || data.snapshot === undefined) {
        this.viewer.showMessage(data.error.message || t().viewer.previewUnitUnrenderable);
        return;
      }
      await this.viewer.showPreview(worktreeId, unit, data);
    } catch (error) {
      this.viewer.showMessage(t().viewer.previewLoadFailed(String(error)));
    }
  }

  /** Toggle the current worktree between merge preview and original edits, then re-render the unit. */
  public setViewPreview(preview: boolean): void {
    if (this.viewPreview === preview || this.view.kind !== "worktree") {
      return;
    }
    this.viewPreview = preview;
    const worktreeId = this.view.worktreeId;
    const unitId = this.selectedUnitId;
    this.emit();
    if (unitId !== undefined) {
      void this.selectWorktreeUnit(worktreeId, unitId);
    }
  }

  // ---- actions ----

  private actionUnitChips(worktreeId: string): DialogChip[] {
    if (this.view.kind !== "worktree" || this.view.worktreeId !== worktreeId) {
      return [];
    }
    const worktree = this.worktrees.get(worktreeId);
    if (worktree === undefined) {
      return [];
    }
    const changed = this.worktreeUnits
      .filter((unit) => this.worktreeUnitChange(worktree, unit) !== "unchanged")
      .map((unit) => ({ id: `unit:${unit.unitId}`, label: unit.name }));
    const deleted = this.worktreeDeletedUnits(worktree).map((unit) => ({
      id: `deleted:${unit.unitId}`,
      label: unit.name,
    }));
    return [...changed, ...deleted];
  }

  public async doReady(worktreeId: string): Promise<void> {
    const worktree = this.worktrees.get(worktreeId);
    const ok = await confirmDialog({
      title: t().modal.readyTitle,
      body: t().modal.readyBody(escapeHtml(worktree?.name ?? worktreeId)),
      chips: this.actionUnitChips(worktreeId),
      confirmLabel: t().modal.readyConfirm,
      icon: "check",
      tone: "info",
    });
    if (!ok) {
      return;
    }
    const eventVersion = this.worktreeEventVersions.get(worktreeId) ?? 0;
    this.setBusy(true);
    try {
      const res = await this.control.ready(worktreeId);
      if (!res.ok || res.error.code !== 1) {
        throw new Error(res.error.message || "Unknown gateway error");
      }
      // The gateway emits the lifecycle event before completing this request, but transports are
      // unordered. Never let this response replace a newer reopen/merge/discard WebSocket event.
      if ((this.worktreeEventVersions.get(worktreeId) ?? 0) === eventVersion) {
        this.applyWorktreeSnapshot(res.worktree);
      }
    } catch (error) {
      toast(t().toast.readyFailed(String(error)));
    } finally {
      this.setBusy(false);
    }
  }

  public async doMerge(worktreeId: string): Promise<void> {
    const worktree = this.worktrees.get(worktreeId);
    const ok = await confirmDialog({
      title: t().modal.mergeTitle,
      body: t().modal.mergeBody(escapeHtml(worktree?.name ?? worktreeId)),
      chips: this.actionUnitChips(worktreeId),
      confirmLabel: t().modal.mergeConfirm,
      icon: "merge",
      tone: "info",
    });
    if (!ok) {
      return;
    }
    this.setBusy(true);
    try {
      const res = await this.control.merge(worktreeId);
      if (res.error.code !== 1) {
        throw new Error(res.error.message || "Unknown gateway error");
      }
      if (res.ok) {
        toast(t().toast.merged);
        // Refresh trunk units (and worktree statuses) before returning home so the file list
        // reflects the merge even if the Univerfile WebSocket event has not arrived yet.
        await this.reloadAll();
        this.exitToHome();
      } else {
        await conflictDialog(res.failedUnit);
      }
    } catch (error) {
      toast(t().toast.mergeFailed(String(error)));
    } finally {
      this.setBusy(false);
    }
  }

  public async doDiscard(worktreeId: string): Promise<void> {
    const worktree = this.worktrees.get(worktreeId);
    const ok = await confirmDialog({
      title: t().modal.discardTitle,
      body: t().modal.discardBody(escapeHtml(worktree?.name ?? worktreeId)),
      chips: [
        { id: "discard-summary", label: t().modal.discardChip },
        ...this.actionUnitChips(worktreeId),
      ],
      confirmLabel: t().modal.discardConfirm,
      danger: true,
    });
    if (!ok) {
      return;
    }
    this.setBusy(true);
    try {
      const res = await this.control.discard(worktreeId);
      if (res.error.code !== 1) {
        throw new Error(res.error.message || "Unknown gateway error");
      }
      // The server emits a `worktree` (discarded) over the univerfile channel; onWorktreeEvent handles exit.
    } catch (error) {
      toast(t().toast.discardFailed(String(error)));
    } finally {
      this.setBusy(false);
    }
  }

  // ---- language ----

  public async chooseLang(lang: Lang): Promise<void> {
    if (lang === currentLang() && this.languageLoading === undefined) {
      return;
    }
    const generation = ++this.languageGeneration;
    const locale = sdkLocaleOf(lang);
    this.languageLoading = lang;
    this.languageError = false;
    this.emit();
    try {
      const [messages] = await Promise.all([loadMessages(lang), this.viewer.prepareLocale(locale)]);
      if (generation !== this.languageGeneration) {
        return;
      }
      await this.viewer.setLocale(locale, messages);
      if (generation !== this.languageGeneration) {
        return;
      }
      activateLang(lang, messages);
      persistLang(lang);
      this.langInUrl = true;
      applyDocumentLang();
      this.languageLoading = undefined;
      this.languageError = false;
      this.emit();
    } catch {
      if (generation !== this.languageGeneration) {
        return;
      }
      this.languageLoading = undefined;
      this.languageError = true;
      this.emit();
    }
  }

  public chooseAppearance(appearance: Appearance): void {
    if (appearance === currentAppearance()) {
      return;
    }
    setAppearance(appearance);
    persistAppearance(appearance);
    applyDocumentAppearance();
    this.viewer.setDarkMode(appearance === "dark");
    this.emit();
  }

  public setSidebarCollapsed(collapsed: boolean): void {
    if (collapsed === this.sidebarCollapsed) {
      return;
    }
    this.sidebarCollapsed = collapsed;
    persistSidebarCollapsed(collapsed);
    this.emit();
  }

  // ---- trunk editing gate actions ----

  /** Warn about pending modifications, then let the user edit the current version anyway. */
  public async startTrunkEdit(): Promise<void> {
    const n = this.pendingWorktreeCount();
    const ok = await confirmDialog({
      title: t().modal.trunkEditTitle,
      body: t().modal.trunkEditBody(n),
      chips: [{ id: "trunk-edit-warning", label: t().modal.trunkEditChip }],
      confirmLabel: t().modal.trunkEditConfirm,
      icon: "pencil",
      tone: "warn",
    });
    if (!ok) {
      return;
    }
    this.trunkEditingOptIn = true;
    this.refreshTrunkGate();
  }

  /** Stop editing the current version; back to view-only (modifications still pending). */
  public stopTrunkEdit(): void {
    this.trunkEditingOptIn = false;
    this.refreshTrunkGate();
  }

  // ---- busy overlay ----

  private setBusy(on: boolean): void {
    if (this.busy === on) {
      return;
    }
    this.busy = on;
    this.emit();
  }

  /** Units the topbar should resolve names against for the current view. */
  public topbarUnits(): UnitSummary[] {
    return this.currentUnits();
  }
}
