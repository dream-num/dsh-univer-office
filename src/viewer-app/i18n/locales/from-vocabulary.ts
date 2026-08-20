import type { Messages } from "./en-US";

export interface MessageVocabulary {
  title: string;
  file: string;
  modification: string;
  currentVersion: string;
  aiAssistant: string;
  no: string;
  create: string;
  start: string;
  load: string;
  loading: string;
  failed: string;
  preview: string;
  merge: string;
  discard: string;
  conflict: string;
  updated: string;
  editing: string;
  ready: string;
  readyChanged: string;
  readyFailed: (error: string) => string;
  submitForReview: string;
  readyTitle: string;
  readyBody: (name: string) => string;
  readyConfirm: string;
  merged: string;
  discarded: string;
  files: string;
  inProgress: string;
  awaiting: string;
  collapse: string;
  expand: string;
  settings: string;
  appearance: string;
  light: string;
  dark: string;
  language: string;
  cancel: string;
  confirm: string;
  viewOnly: string;
  editable: string;
  locked: string;
  stop: string;
  continue: string;
  latestChanged: string;
  permanent: string;
  justNow: string;
  minute: string;
  hour: string;
  day: string;
  choose: string;
  cannot: string;
  empty: string;
}

/** Build a structurally complete shell table from locale-owned vocabulary, without English fallback. */
export function messagesFromVocabulary(v: MessageVocabulary): Messages {
  const failure = (action: string, error: string): string => `${action} ${v.failed}: ${error}`;
  const ago = (n: number, unit: string): string => `${n} ${unit}`;
  return {
    app: { title: v.title },
    boot: {
      noFileTitle: `${v.no} ${v.file}`,
      noFileBody: `${v.choose} <code>?file=&lt;${v.file}&gt;</code>`,
      noFileHint: `${v.preview} ${v.modification}: <code>&amp;worktree=&lt;worktreeId&gt;</code>.`,
      notFoundTitle: `${v.file}: ${v.no}`,
      notFoundBody: `<code>.univer</code> ${v.file}: ${v.no}.`,
      notFoundHint: (command) => `${v.create}: <code>${command}</code>`,
      fatal: (error) => failure(v.start, error)
    },
    viewer: {
      loading: `${v.loading}…`,
      loadFailed: (error) => failure(v.load, error),
      previewComputeFailed: `${v.preview} ${v.failed}`,
      previewUnitUnrenderable: `${v.preview}: ${v.cannot}`,
      previewLoadFailed: (error) => failure(v.preview, error),
      worktreeReadOnly: `${v.viewOnly} · ${v.aiAssistant} ${v.modification}. ${v.editing}: ${v.cannot}.`,
      mergePreviewReadOnly: `${v.viewOnly} · ${v.preview}. ${v.editing}: ${v.cannot}.`,
      currentVersionReadOnly: `${v.currentVersion} · ${v.viewOnly}. ${v.continue} ${v.editing}.`
    },
    toast: {
      worktreeGone: `${v.modification}: ${v.no} · ${v.currentVersion}`,
      agentReset: `${v.aiAssistant}: ${v.updated} · ${v.loading}…`,
      workDone: (name) => `“${name}” · ${v.ready}`,
      readyChanged: v.readyChanged,
      readyFailed: v.readyFailed,
      mergedElsewhere: `${v.modification}: ${v.merged}`,
      discardedElsewhere: `${v.modification}: ${v.discarded}`,
      previewRefreshed: `${v.latestChanged} · ${v.preview}: ${v.updated}`,
      merged: `${v.merged} · ${v.currentVersion}`,
      mergeFailed: (error) => failure(v.merge, error),
      discardFailed: (error) => failure(v.discard, error),
      conflictsCannotMerge: `${v.conflict} · ${v.cannot} ${v.merge}`
    },
    sidebar: {
      files: v.files,
      inProgress: `${v.modification} · ${v.inProgress}`,
      awaitingConfirm: `${v.modification} · ${v.awaiting}`,
      none: v.no,
      noFiles: `${v.no} ${v.files}`,
      collapse: v.collapse,
      expand: v.expand,
      tailReady: v.awaiting,
      tailDraft: v.inProgress,
      worktreeRowSub: (when, tail) => `${v.aiAssistant}${when ? ` · ${when}` : ""} · ${tail}`
    },
    status: { draft: v.editing, ready: v.ready, merged: v.merged, discarded: v.discarded },
    change: {
      modified: v.updated,
      added: v.create,
      deleted: v.discarded,
      conflict: v.conflict,
      updated: v.updated
    },
    topbar: {
      currentVersion: v.currentVersion,
      fallbackWorktreeName: v.modification,
      submitForReview: v.submitForReview,
      mergeToCurrent: `${v.merge} · ${v.currentVersion}`,
      discard: v.discard,
      previewUnavailable: `${v.preview}: ${v.cannot}`,
      conflictCount: (n) => `${n} ${v.conflict} · ${v.cannot} ${v.merge}`,
      divergedShowingPreview: `${v.latestChanged} · ${v.preview}`,
      divergedShowingOriginal: `${v.latestChanged} · ${v.modification}`,
      segPreview: v.preview,
      segOriginal: v.modification,
      readOnlyPreview: `${v.viewOnly} · ${v.preview}`,
      viewOnly: v.viewOnly,
      editable: v.editable,
      editingPending: (n) => `${v.editing} · ${n} ${v.awaiting}`,
      lockedPending: (n) => `${v.locked} · ${n} ${v.awaiting}`,
      stopEditing: `${v.stop} ${v.editing}`,
      editAnyway: `${v.continue} ${v.editing}`
    },
    settings: {
      title: v.settings,
      appearance: v.appearance,
      light: v.light,
      dark: v.dark,
      language: v.language,
      loadingLanguage: `${v.loading} ${v.language}…`,
      languageLoadFailed: `${v.language} ${v.failed}`
    },
    modal: {
      cancel: v.cancel,
      gotIt: v.confirm,
      conflictTitle: `${v.cannot} ${v.merge}`,
      conflictBody: (unitHtml) =>
        `<strong>${unitHtml}</strong>: ${v.conflict}. <span class="muted">${v.modification} · ${v.awaiting}; ${v.currentVersion} · ${v.updated}.</span>`,
      readyTitle: v.readyTitle,
      readyBody: v.readyBody,
      readyConfirm: v.readyConfirm,
      mergeTitle: `${v.merge} ${v.modification}?`,
      mergeBody: (name) => `“${name}” · ${v.merge} · <strong>${v.currentVersion}</strong>.`,
      mergeConfirm: v.merge,
      discardTitle: `${v.discard} ${v.modification}?`,
      discardBody: (name) => `“${name}” · <strong>${v.permanent}</strong>.`,
      discardChip: `${v.aiAssistant} · ${v.modification} · ${v.discard}`,
      discardConfirm: v.discard,
      trunkEditTitle: `${v.editing} · ${v.awaiting}?`,
      trunkEditBody: (n) =>
        `<strong>${n}</strong> ${v.modification} · ${v.awaiting}. ${v.continue} ${v.editing} · ${v.conflict}.`,
      trunkEditChip: `${v.merge} / ${v.discard} · ${v.modification}`,
      trunkEditConfirm: `${v.continue} ${v.editing}`
    },
    time: {
      justNow: v.justNow,
      minutesAgo: (n) => ago(n, v.minute),
      hoursAgo: (n) => ago(n, v.hour),
      daysAgo: (n) => ago(n, v.day)
    },
    content: { emptyTitle: v.empty, emptyHint: `${v.choose} ${v.file} · ${v.aiAssistant}` },
    summary: {
      modified: (n) => `${n} ${v.updated}`,
      added: (n) => `${n} ${v.create}`,
      deleted: (n) => `${n} ${v.discarded}`,
      noChanges: `${v.no} ${v.modification}`
    }
  };
}
