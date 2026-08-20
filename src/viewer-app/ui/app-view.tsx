import type { UnitSummary, Worktree } from "@univer/collab-gateway-contract";
import { UniverCliIcon } from "@univerjs/icons";
import {
  Check,
  ChevronRight,
  CircleCheck,
  Eye,
  FolderOpen,
  GitMerge,
  Lock,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Settings,
  Sun,
  Trash2,
  TriangleAlert
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler,
  type ReactElement,
  type ReactNode
} from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ChangeTag } from "../components/ui/change-tag";
import { MenuContent, MenuItem, MenuLabel, MenuRoot, MenuTrigger } from "../components/ui/menu";
import { Spinner } from "../components/ui/spinner";
import { SegmentedToggle } from "../components/ui/toggle-group";
import { LOCALE_MANIFEST, t, type Lang } from "../i18n";
import type { Appearance } from "../appearance";
import { cn } from "../lib/utils";
import type { App, AppSnapshot } from "./app";
import { relativeTime, summaryText } from "./format";
import { toast } from "./modals";
import { UnitIcon } from "./unit-icon";

const SIDEBAR_DRAWER_ID = "gateway-sidebar-hover-drawer";
const SIDEBAR_DRAWER_OPEN_DELAY_MS = 120;
const SIDEBAR_DRAWER_CLOSE_DELAY_MS = 200;

interface SidebarHoverDrawerController {
  open: boolean;
  onTriggerPointerEnter: PointerEventHandler<HTMLButtonElement>;
  onTriggerPointerLeave: PointerEventHandler<HTMLButtonElement>;
  onDrawerPointerEnter: PointerEventHandler<HTMLElement>;
  onDrawerPointerLeave: PointerEventHandler<HTMLElement>;
  onSettingsOpenChange: (open: boolean) => void;
  onSettingsOpenChangeComplete: (open: boolean) => void;
  closeImmediately: () => void;
}

/** Mouse-only peek state. The persistent Sidebar choice remains owned by App. */
function useSidebarHoverDrawer(enabled: boolean): SidebarHoverDrawerController {
  const [open, setOpen] = useState(false);
  const triggerInside = useRef(false);
  const drawerInside = useRef(false);
  const settingsOverlayOpen = useRef(false);
  const openTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);

  const cancelOpen = useCallback((): void => {
    if (openTimer.current !== undefined) {
      window.clearTimeout(openTimer.current);
      openTimer.current = undefined;
    }
  }, []);

  const cancelClose = useCallback((): void => {
    if (closeTimer.current !== undefined) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = undefined;
    }
  }, []);

  const scheduleClose = useCallback((): void => {
    cancelClose();
    if (triggerInside.current || drawerInside.current || settingsOverlayOpen.current) {
      return;
    }
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = undefined;
      if (!triggerInside.current && !drawerInside.current && !settingsOverlayOpen.current) {
        setOpen(false);
      }
    }, SIDEBAR_DRAWER_CLOSE_DELAY_MS);
  }, [cancelClose]);

  const closeImmediately = useCallback((): void => {
    cancelOpen();
    cancelClose();
    setOpen(false);
  }, [cancelClose, cancelOpen]);

  const onTriggerPointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>): void => {
      if (!enabled || event.pointerType !== "mouse") {
        return;
      }
      triggerInside.current = true;
      cancelClose();
      cancelOpen();
      openTimer.current = window.setTimeout(() => {
        openTimer.current = undefined;
        if (triggerInside.current) {
          setOpen(true);
        }
      }, SIDEBAR_DRAWER_OPEN_DELAY_MS);
    },
    [cancelClose, cancelOpen, enabled]
  );

  const onTriggerPointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>): void => {
      if (event.pointerType !== "mouse") {
        return;
      }
      triggerInside.current = false;
      cancelOpen();
      scheduleClose();
    },
    [cancelOpen, scheduleClose]
  );

  const onDrawerPointerEnter = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      if (event.pointerType !== "mouse") {
        return;
      }
      drawerInside.current = true;
      cancelClose();
    },
    [cancelClose]
  );

  const onDrawerPointerLeave = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      if (event.pointerType !== "mouse") {
        return;
      }
      drawerInside.current = false;
      scheduleClose();
    },
    [scheduleClose]
  );

  const onSettingsOpenChange = useCallback(
    (nextOpen: boolean): void => {
      if (nextOpen) {
        settingsOverlayOpen.current = true;
        cancelClose();
      }
    },
    [cancelClose]
  );

  const onSettingsOpenChangeComplete = useCallback(
    (nextOpen: boolean): void => {
      settingsOverlayOpen.current = nextOpen;
      if (!nextOpen) {
        scheduleClose();
      }
    },
    [scheduleClose]
  );

  useEffect(() => {
    if (enabled) {
      return;
    }
    triggerInside.current = false;
    drawerInside.current = false;
    settingsOverlayOpen.current = false;
    closeImmediately();
  }, [closeImmediately, enabled]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || settingsOverlayOpen.current) {
        return;
      }
      event.preventDefault();
      closeImmediately();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeImmediately, open]);

  useEffect(
    () => () => {
      cancelOpen();
      cancelClose();
    },
    [cancelClose, cancelOpen]
  );

  return {
    open,
    onTriggerPointerEnter,
    onTriggerPointerLeave,
    onDrawerPointerEnter,
    onDrawerPointerLeave,
    onSettingsOpenChange,
    onSettingsOpenChangeComplete,
    closeImmediately
  };
}

/** The whole shell: sidebar + topbar (standalone) around the content pane and busy overlay. */
export function AppView({ app }: { app: App }): ReactElement {
  const snap = useSyncExternalStore(app.subscribe, app.getSnapshot);
  const standalone = app.mode !== "embedded";
  const hoverDrawer = useSidebarHoverDrawer(standalone && snap.sidebarCollapsed);
  return (
    <div
      className={cn(
        "shell relative flex h-dvh overflow-hidden bg-background text-foreground",
        app.mode === "embedded" && "embedded"
      )}
    >
      {standalone && !snap.sidebarCollapsed && <Sidebar app={app} snap={snap} mode="docked" />}
      {standalone && snap.sidebarCollapsed && hoverDrawer.open && (
        <Sidebar
          app={app}
          snap={snap}
          mode="drawer"
          onPointerEnter={hoverDrawer.onDrawerPointerEnter}
          onPointerLeave={hoverDrawer.onDrawerPointerLeave}
          onSettingsOpenChange={hoverDrawer.onSettingsOpenChange}
          onSettingsOpenChangeComplete={hoverDrawer.onSettingsOpenChangeComplete}
        />
      )}
      {standalone && snap.sidebarCollapsed && (
        <SidebarToggleButton
          app={app}
          collapsed
          className="absolute top-1.5 left-4 z-50"
          ariaControls={SIDEBAR_DRAWER_ID}
          ariaExpanded={hoverDrawer.open}
          onPointerEnter={hoverDrawer.onTriggerPointerEnter}
          onPointerLeave={hoverDrawer.onTriggerPointerLeave}
          onToggle={() => {
            hoverDrawer.closeImmediately();
            app.setSidebarCollapsed(false);
          }}
        />
      )}
      <section className="relative flex min-w-0 flex-1 flex-col">
        {standalone && <Topbar app={app} snap={snap} />}
        <ContentPane app={app} snap={snap} />
        <LoadingOverlay busy={snap.busy} />
      </section>
    </div>
  );
}

// ---- sidebar ----

function Sidebar({
  app,
  snap,
  mode,
  onPointerEnter,
  onPointerLeave,
  onSettingsOpenChange,
  onSettingsOpenChangeComplete
}: {
  app: App;
  snap: AppSnapshot;
  mode: "docked" | "drawer";
  onPointerEnter?: PointerEventHandler<HTMLElement>;
  onPointerLeave?: PointerEventHandler<HTMLElement>;
  onSettingsOpenChange?: (open: boolean) => void;
  onSettingsOpenChangeComplete?: (open: boolean) => void;
}): ReactElement {
  const drafts = snap.worktrees.filter((f) => f.status === "draft");
  const readies = snap.worktrees.filter((f) => f.status === "ready");
  const drawer = mode === "drawer";
  return (
    <aside
      id={drawer ? SIDEBAR_DRAWER_ID : undefined}
      className={cn(
        "sidebar flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        drawer
          ? "sidebar-drawer absolute inset-y-0 left-0 z-40 shadow-xl motion-safe:animate-in motion-safe:slide-in-from-left-4 motion-safe:duration-150"
          : "shrink-0"
      )}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {drawer ? (
        <div className="sidebar-drawer-header flex h-11 items-center border-b border-sidebar-border py-1 pr-3 pl-14">
          <span className="truncate text-[13px] font-semibold" title={app.univerfilePath}>
            {app.univerfileName}
          </span>
        </div>
      ) : (
        <div className="flex h-11 items-center gap-2 border-b border-sidebar-border py-1 pr-1 pl-4">
          <UniverCliIcon
            aria-hidden="true"
            className="univer-logo size-4 shrink-0 text-foreground"
          />
          <span className="truncate text-[13px] font-semibold" title={app.univerfilePath}>
            {app.univerfileName}
          </span>
          <SidebarToggleButton app={app} collapsed={false} className="ml-auto" />
        </div>
      )}
      <div className="sidebar-body flex flex-1 flex-col gap-5 overflow-y-auto border-b border-sidebar-border px-3 py-4">
        <SidebarSection label={t().sidebar.files}>
          {snap.trunkUnits.length === 0 ? (
            <SidebarEmpty text={t().sidebar.noFiles} />
          ) : (
            snap.trunkUnits.map((u) => (
              <TrunkUnitRow
                key={u.unitId}
                app={app}
                unit={u}
                active={snap.view.kind === "trunk" && snap.selectedUnitId === u.unitId}
              />
            ))
          )}
        </SidebarSection>
        <SidebarSection label={t().sidebar.inProgress}>
          {drafts.length === 0 ? (
            <SidebarEmpty text={t().sidebar.none} />
          ) : (
            drafts.map((f) => <WorktreeRow key={f.worktreeId} app={app} snap={snap} worktree={f} />)
          )}
        </SidebarSection>
        <SidebarSection label={t().sidebar.awaitingConfirm}>
          {readies.length === 0 ? (
            <SidebarEmpty text={t().sidebar.none} />
          ) : (
            readies.map((f) => (
              <WorktreeRow key={f.worktreeId} app={app} snap={snap} worktree={f} />
            ))
          )}
        </SidebarSection>
      </div>
      <div className="sidebar-footer flex h-9 shrink-0 items-center px-2">
        <SettingsMenu
          app={app}
          lang={snap.lang}
          languageLoading={snap.languageLoading}
          languageError={snap.languageError}
          appearance={snap.appearance}
          {...(onSettingsOpenChange === undefined ? {} : { onOpenChange: onSettingsOpenChange })}
          {...(onSettingsOpenChangeComplete === undefined
            ? {}
            : { onOpenChangeComplete: onSettingsOpenChangeComplete })}
        />
      </div>
    </aside>
  );
}

function SidebarSection({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <section>
      <div className="px-2 pb-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

function SidebarEmpty({ text }: { text: string }): ReactElement {
  return <div className="px-2 py-1.5 text-xs text-muted-foreground/70">{text}</div>;
}

function SidebarToggleButton({
  app,
  collapsed,
  className,
  ariaControls,
  ariaExpanded,
  onPointerEnter,
  onPointerLeave,
  onToggle
}: {
  app: App;
  collapsed: boolean;
  className?: string;
  ariaControls?: string;
  ariaExpanded?: boolean;
  onPointerEnter?: PointerEventHandler<HTMLButtonElement>;
  onPointerLeave?: PointerEventHandler<HTMLButtonElement>;
  onToggle?: () => void;
}): ReactElement {
  const label = collapsed ? t().sidebar.expand : t().sidebar.collapse;
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("sidebar-toggle size-8 text-muted-foreground", className)}
      aria-label={label}
      aria-controls={ariaControls}
      aria-expanded={ariaExpanded}
      title={label}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClick={() => (onToggle ? onToggle() : app.setSidebarCollapsed(!collapsed))}
    >
      <Icon />
    </Button>
  );
}

function TrunkUnitRow({
  app,
  unit,
  active
}: {
  app: App;
  unit: UnitSummary;
  active: boolean;
}): ReactElement {
  return (
    <button
      type="button"
      aria-current={active || undefined}
      onClick={() => void app.selectTrunkUnit(unit.unitId)}
      className={cn(
        "row flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active
          ? "bg-background font-medium text-foreground shadow-xs ring-1 ring-border"
          : "text-neutral-600 hover:bg-sidebar-accent hover:text-foreground"
      )}
    >
      <UnitIcon type={unit.type} className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{unit.name}</span>
    </button>
  );
}

/** One worktree row; while selected it expands into a card with its unit list. */
function WorktreeRow({
  app,
  snap,
  worktree
}: {
  app: App;
  snap: AppSnapshot;
  worktree: Worktree;
}): ReactElement {
  const selected = snap.view.kind === "worktree" && snap.view.worktreeId === worktree.worktreeId;
  const ready = worktree.status === "ready";
  const tail = ready ? t().sidebar.tailReady : t().sidebar.tailDraft;
  const sub = t().sidebar.worktreeRowSub(relativeTime(worktree.createdAt), tail);
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl p-1 transition-colors",
        selected && "bg-sidebar-accent/70",
        snap.flashWorktreeId === worktree.worktreeId && "animate-worktree-flash"
      )}
    >
      <button
        type="button"
        aria-current={selected || undefined}
        onClick={() => void app.enterWorktree(worktree.worktreeId)}
        className={cn(
          "row worktree flex w-full cursor-pointer flex-col gap-1 rounded-lg px-2 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          !selected && "hover:bg-sidebar-accent"
        )}
      >
        <span className="flex w-full items-center gap-2">
          {worktree.status === "draft" ? (
            <PulseDot />
          ) : ready ? (
            <CircleCheck className="size-4 shrink-0 text-emerald-600" />
          ) : (
            <Pencil className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
            {worktree.name || worktree.worktreeId}
          </span>
          {ready && (
            <Badge variant="warn" size="sm">
              {t().status.ready}
            </Badge>
          )}
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              selected && "rotate-90"
            )}
          />
        </span>
        <span className="w-full truncate pl-6 text-xs text-muted-foreground">{sub}</span>
      </button>
      {selected && (
        <div className="worktree-units mt-0.5 flex flex-col gap-0.5 border-t border-border/60 pt-1.5">
          {snap.worktreeUnits.map((u) => (
            <WorktreeUnitRow key={u.unitId} app={app} snap={snap} worktree={worktree} unit={u} />
          ))}
          {app.worktreeDeletedUnits(worktree).map((d) => (
            <div
              key={d.unitId}
              className="row u deleted flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-muted-foreground/70"
            >
              <UnitIcon type={d.type} className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate line-through">{d.name}</span>
              <ChangeTag variant="deleted">{t().change.deleted}</ChangeTag>
            </div>
          ))}
          {snap.worktreeUnits.length === 0 && (
            <div className="px-2 py-1 text-xs text-muted-foreground/70">{t().sidebar.noFiles}</div>
          )}
          <div className="px-2 pt-0.5 pb-1 text-xs text-muted-foreground">
            {summaryText(app.worktreeChangeSummary(worktree))}
          </div>
        </div>
      )}
    </div>
  );
}

function WorktreeUnitRow({
  app,
  snap,
  worktree,
  unit
}: {
  app: App;
  snap: AppSnapshot;
  worktree: Worktree;
  unit: UnitSummary;
}): ReactElement {
  const active = snap.selectedUnitId === unit.unitId;
  const badge = app.unitBadgeInfo(worktree, unit);
  return (
    <button
      type="button"
      aria-current={active || undefined}
      onClick={() => void app.selectWorktreeUnit(worktree.worktreeId, unit.unitId)}
      className={cn(
        "row u flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        active
          ? "bg-background font-medium text-foreground shadow-xs ring-1 ring-border"
          : "text-neutral-600 hover:bg-background/70 hover:text-foreground"
      )}
    >
      <UnitIcon type={unit.type} className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{unit.name}</span>
      {badge && <ChangeTag variant={badge.variant}>{badge.text}</ChangeTag>}
    </button>
  );
}

function SettingsMenu({
  app,
  lang,
  languageLoading,
  languageError,
  appearance,
  onOpenChange,
  onOpenChangeComplete
}: {
  app: App;
  lang: Lang;
  languageLoading: Lang | undefined;
  languageError: boolean;
  appearance: Appearance;
  onOpenChange?: (open: boolean) => void;
  onOpenChangeComplete?: (open: boolean) => void;
}): ReactElement {
  return (
    <MenuRoot
      {...(onOpenChange === undefined ? {} : { onOpenChange })}
      {...(onOpenChangeComplete === undefined ? {} : { onOpenChangeComplete })}
    >
      <MenuTrigger
        className={cn(
          "settings-row row flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-muted-foreground transition-colors outline-none hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-[popup-open]:bg-sidebar-accent data-[popup-open]:text-foreground"
        )}
      >
        <Settings className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{t().settings.title}</span>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>{t().settings.appearance}</MenuLabel>
        {(["light", "dark"] as const).map((option) => {
          const AppearanceIcon = option === "light" ? Sun : Moon;
          return (
            <MenuItem
              key={option}
              onClick={() => app.chooseAppearance(option)}
              className={cn(option === appearance && "active font-medium")}
            >
              <span className="flex items-center gap-2">
                <AppearanceIcon className="size-3.5 shrink-0 text-muted-foreground" />
                {option === "light" ? t().settings.light : t().settings.dark}
              </span>
              {option === appearance && <Check className="size-3.5 shrink-0" />}
            </MenuItem>
          );
        })}
        <MenuLabel>{t().settings.language}</MenuLabel>
        {LOCALE_MANIFEST.map((opt) => (
          <MenuItem
            key={opt.tag}
            onClick={() => void app.chooseLang(opt.tag)}
            className={cn(opt.tag === lang && "active font-medium")}
          >
            <span>{opt.nativeName}</span>
            {opt.tag === languageLoading ? (
              <Spinner className="size-3.5 shrink-0" />
            ) : (
              opt.tag === lang && <Check className="size-3.5 shrink-0" />
            )}
          </MenuItem>
        ))}
        {languageLoading !== undefined && (
          <div className="px-2 py-1 text-xs text-muted-foreground">
            {t().settings.loadingLanguage}
          </div>
        )}
        {languageError && (
          <div className="px-2 py-1 text-xs text-destructive">
            {t().settings.languageLoadFailed}
          </div>
        )}
      </MenuContent>
    </MenuRoot>
  );
}

// ---- topbar ----

function Topbar({ app, snap }: { app: App; snap: AppSnapshot }): ReactElement {
  const leading = snap.sidebarCollapsed ? (
    <span aria-hidden="true" className="sidebar-toggle-spacer size-8 shrink-0" />
  ) : undefined;
  return (
    <header className="topbar flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-background px-4 py-1">
      {snap.view.kind === "trunk" ? (
        <TrunkTitle app={app} snap={snap} leading={leading} />
      ) : (
        <WorktreeTitle app={app} snap={snap} worktreeId={snap.view.worktreeId} leading={leading} />
      )}
    </header>
  );
}

function TitleUnitIcon({
  type,
  className,
  children
}: {
  type: number;
  className?: string;
  children?: ReactNode;
}): ReactElement {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md border shadow-xs [&_svg]:size-4",
        className ?? "border-border bg-background text-muted-foreground"
      )}
    >
      {children ?? <UnitIcon type={type} />}
    </span>
  );
}

function TrunkTitle({
  app,
  snap,
  leading
}: {
  app: App;
  snap: AppSnapshot;
  leading?: ReactNode;
}): ReactElement {
  const unit = snap.trunkUnits.find((u) => u.unitId === snap.selectedUnitId);
  const pending = app.pendingWorktreeCount();
  return (
    <>
      <div className="flex min-w-0 items-center gap-2.5">
        {leading}
        <TitleUnitIcon type={unit?.type ?? 2} />
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-sm font-semibold">{unit?.name ?? app.univerfileName}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            · {t().topbar.currentVersion}
          </span>
        </div>
      </div>
      <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
        {unit === undefined ? (
          <Badge variant="outline">
            <Eye />
            {t().topbar.viewOnly}
          </Badge>
        ) : pending === 0 ? (
          <Badge variant="ok">
            <Pencil />
            {t().topbar.editable}
          </Badge>
        ) : snap.trunkEditingOptIn ? (
          <>
            <Badge variant="warn">
              <Pencil />
              {t().topbar.editingPending(pending)}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => app.stopTrunkEdit()}>
              {t().topbar.stopEditing}
            </Button>
          </>
        ) : (
          <>
            <Badge variant="warn">
              <Lock />
              {t().topbar.lockedPending(pending)}
            </Badge>
            <Button variant="outline" size="sm" onClick={() => void app.startTrunkEdit()}>
              {t().topbar.editAnyway}
            </Button>
          </>
        )}
      </div>
    </>
  );
}

function WorktreeTitle({
  app,
  snap,
  worktreeId,
  leading
}: {
  app: App;
  snap: AppSnapshot;
  worktreeId: string;
  leading?: ReactNode;
}): ReactElement {
  const worktree = snap.worktrees.find((f) => f.worktreeId === worktreeId);
  const unit = app.topbarUnits().find((u) => u.unitId === snap.selectedUnitId);
  const preview = snap.previews.get(worktreeId);
  const previewError = snap.previewErrors.get(worktreeId);
  const mergeable = preview?.mergeable ?? false;
  const unitBadge =
    worktree !== undefined && unit !== undefined ? app.unitBadgeInfo(worktree, unit) : undefined;
  return (
    <>
      <div className="flex min-w-0 items-center gap-2.5">
        {leading}
        <TitleUnitIcon
          type={unit?.type ?? 2}
          className="border-amber-200/80 bg-amber-50 text-amber-600"
        />
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="truncate text-sm font-semibold">
            {worktree?.name || worktreeId || t().topbar.fallbackWorktreeName}
          </span>
          {unit !== undefined && (
            <span className="shrink-0 truncate text-xs text-muted-foreground">· {unit.name}</span>
          )}
        </div>
        <Badge variant="outline">
          <Lock />
          {t().topbar.readOnlyPreview}
        </Badge>
        {previewError !== undefined ? (
          <Badge variant="warn" title={previewError}>
            <TriangleAlert />
            {t().topbar.previewUnavailable}
          </Badge>
        ) : preview?.diverged ? (
          <Badge variant={mergeable ? "info" : "danger"}>
            {!mergeable && <TriangleAlert />}
            {mergeable
              ? snap.viewPreview
                ? t().topbar.divergedShowingPreview
                : t().topbar.divergedShowingOriginal
              : t().topbar.conflictCount(preview.conflicts.length)}
          </Badge>
        ) : (
          unitBadge && <ChangeTag variant={unitBadge.variant}>{unitBadge.text}</ChangeTag>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {preview?.diverged && (
          <SegmentedToggle
            value={snap.viewPreview ? "preview" : "original"}
            options={[
              { value: "preview", label: t().topbar.segPreview },
              { value: "original", label: t().topbar.segOriginal }
            ]}
            onChange={(v) => app.setViewPreview(v === "preview")}
          />
        )}
        {worktree?.status === "draft" && (
          <Button size="sm" onClick={() => void app.doReady(worktreeId)}>
            <CircleCheck />
            {t().topbar.submitForReview}
          </Button>
        )}
        {worktree?.status === "ready" && (
          <Button
            size="sm"
            disabled={preview !== undefined && !mergeable}
            onClick={() => {
              if (preview !== undefined && !mergeable) {
                toast(t().toast.conflictsCannotMerge);
                return;
              }
              void app.doMerge(worktreeId);
            }}
          >
            <GitMerge />
            {t().topbar.mergeToCurrent}
          </Button>
        )}
        {(worktree?.status === "draft" || worktree?.status === "ready") && (
          <Button
            variant="destructiveGhost"
            size="sm"
            onClick={() => void app.doDiscard(worktreeId)}
          >
            <Trash2 />
            {t().topbar.discard}
          </Button>
        )}
      </div>
    </>
  );
}

// ---- content pane ----

function ContentPane({ app, snap }: { app: App; snap: AppSnapshot }): ReactElement {
  return (
    <div className="content relative min-h-0 flex-1 bg-background">
      <div
        ref={(node) => {
          app.bindContent(node);
        }}
        className="absolute inset-0"
      />
      {snap.selectedUnitId === undefined && <EmptyContent />}
    </div>
  );
}

function EmptyContent(): ReactElement {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 p-6">
      <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-muted/50 text-muted-foreground shadow-xs">
        <FolderOpen className="size-5" />
      </span>
      <div className="text-sm font-medium">{t().content.emptyTitle}</div>
      <div className="max-w-72 text-center text-xs leading-5 text-muted-foreground">
        {t().content.emptyHint}
      </div>
    </div>
  );
}

function LoadingOverlay({ busy }: { busy: boolean }): ReactElement {
  return (
    <div
      className={cn(
        "overlay absolute inset-0 z-20 flex-col items-center justify-center gap-2.5 bg-background/70 backdrop-blur-[1px]",
        busy ? "flex" : "hidden"
      )}
    >
      <Spinner />
      <div className="overlay-text text-sm text-muted-foreground">{t().viewer.loading}</div>
    </div>
  );
}

function PulseDot(): ReactElement {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-blue-500" />
      </span>
    </span>
  );
}
