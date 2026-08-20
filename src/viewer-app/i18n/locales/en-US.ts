/** English shell copy; this table is the structural authority for every other language. */
export const EN_US_MESSAGES = {
  app: {
    title: "Collaboration Viewer"
  },
  boot: {
    noFileTitle: "No file specified",
    noFileBody:
      "Add <code>?file=&lt;absolute path to the .univer&gt;</code> to the address bar, e.g.:",
    noFileHint: "To view a modification, also add <code>&amp;worktree=&lt;worktreeId&gt;</code>.",
    notFoundTitle: "univerfile not found",
    notFoundBody:
      "This <code>.univer</code> file does not exist; the service will not create it automatically.",
    notFoundHint: (command: string): string => `Create it first: <code>${command}</code>`,
    fatal: (error: string): string => `Failed to start: ${error}`
  },
  viewer: {
    loading: "Loading…",
    loadFailed: (error: string): string => `Failed to load: ${error}`,
    previewComputeFailed: "Failed to compute the merge preview",
    previewUnitUnrenderable: "This file cannot be rendered in the merge preview",
    previewLoadFailed: (error: string): string => `Failed to load the preview: ${error}`,
    worktreeReadOnly:
      "This is a read-only AI modification. Ask the AI assistant to continue editing if changes are needed.",
    mergePreviewReadOnly:
      "This is a read-only merge preview and cannot be edited directly. Ask the AI assistant to continue editing, or make manual changes after merging.",
    currentVersionReadOnly:
      'The current version is temporarily read-only. Choose "Edit anyway" above to make changes.'
  },
  toast: {
    worktreeGone: "That modification no longer exists; switched back to the current version",
    agentReset: "The AI undid its last step; refreshing…",
    workDone: (name: string): string => `"${name}" is done and awaiting your confirmation`,
    readyChanged:
      "This modification changed while you were confirming. Review the latest changes and submit it again.",
    mergedElsewhere: "This modification has been merged into the current version",
    discardedElsewhere: "This modification has been discarded",
    previewRefreshed: "The latest version changed; the merge preview has been refreshed",
    readyFailed: (error: string): string => `Failed to submit for confirmation: ${error}`,
    merged: "Merged into the current version",
    mergeFailed: (error: string): string => `Merge failed: ${error}`,
    discardFailed: (error: string): string => `Discard failed: ${error}`,
    conflictsCannotMerge: "There are conflicts; cannot merge"
  },
  sidebar: {
    files: "Files",
    inProgress: "Modifications in progress",
    awaitingConfirm: "Awaiting confirmation",
    none: "None",
    noFiles: "No files",
    collapse: "Collapse sidebar",
    expand: "Expand sidebar",
    tailReady: "awaiting confirmation",
    tailDraft: "in progress",
    worktreeRowSub: (when: string, tail: string): string =>
      `AI assistant${when ? ` · ${when}` : ""} · ${tail}`
  },
  status: {
    draft: "Editing",
    ready: "Ready",
    merged: "Merged",
    discarded: "Discarded"
  },
  change: {
    modified: "M",
    added: "A",
    deleted: "D",
    conflict: "Conflict",
    updated: "Updated"
  },
  topbar: {
    currentVersion: "Current version",
    fallbackWorktreeName: "A modification",
    submitForReview: "Submit for confirmation",
    mergeToCurrent: "Merge into current version",
    discard: "Discard",
    previewUnavailable: "Merge preview unavailable · viewing the original edits",
    conflictCount: (n: number): string =>
      `${n} conflict${n === 1 ? "" : "s"}, cannot merge automatically`,
    divergedShowingPreview: "The latest version has changed · showing the merged result",
    divergedShowingOriginal: "The latest version has changed · viewing the original edits",
    segPreview: "Merge preview",
    segOriginal: "Original edits",
    readOnlyPreview: "Read-only preview",
    viewOnly: "View only",
    editable: "Editable",
    editingPending: (n: number): string => `Editing · ${n} unmerged`,
    lockedPending: (n: number): string => `Locked · ${n} unmerged`,
    stopEditing: "Stop editing",
    editAnyway: "Edit anyway"
  },
  settings: {
    title: "Settings",
    appearance: "Appearance",
    light: "Light",
    dark: "Dark",
    language: "Language",
    loadingLanguage: "Loading language…",
    languageLoadFailed: "Could not load that language"
  },
  modal: {
    cancel: "Cancel",
    gotIt: "Got it",
    conflictTitle: "Cannot merge automatically",
    conflictBody: (unitHtml: string): string =>
      `The file "<strong>${unitHtml}</strong>" was also changed elsewhere and the current version has advanced, so this modification cannot be merged automatically.<br><span class="muted">It has been kept as "awaiting confirmation"; the current version is untouched. You can ask the AI assistant to redo it against the latest version and retry, or discard it.</span>`,
    readyTitle: "Submit this modification for confirmation?",
    readyBody: (name: string): string =>
      `"${name}" will move to <strong>awaiting confirmation</strong>, where you can merge or discard it. Further editing is blocked until you explicitly reopen it.`,
    readyConfirm: "Submit for confirmation",
    mergeTitle: "Merge this modification?",
    mergeBody: (name: string): string =>
      `"${name}" will be merged into the <strong>current version</strong>. After merging, everyone will see the modified data in the current version.`,
    mergeConfirm: "Merge",
    discardTitle: "Discard this modification?",
    discardBody: (name: string): string =>
      `"${name}" will be <strong>permanently deleted and cannot be recovered</strong>. The current version is not affected.`,
    discardChip: "All of the AI assistant's changes will be removed",
    discardConfirm: "Discard",
    trunkEditTitle: "Edit while modifications are still unmerged?",
    trunkEditBody: (n: number): string =>
      `There ${n === 1 ? "is" : "are"} <strong>${n}</strong> unmerged modification${n === 1 ? "" : "s"} (the AI assistant is editing or awaiting confirmation). Editing the <strong>current version</strong> now is fine, but if you touch the places they are changing, those modifications <strong>may conflict when merged</strong> and need redoing or manual resolution.`,
    trunkEditChip:
      "Safer: merge or discard those modifications first, then edit the current version",
    trunkEditConfirm: "Edit anyway"
  },
  time: {
    justNow: "just now",
    minutesAgo: (n: number): string => `${n} min ago`,
    hoursAgo: (n: number): string => `${n} h ago`,
    daysAgo: (n: number): string => `${n} d ago`
  },
  content: {
    emptyTitle: "Empty file",
    emptyHint:
      "Pick a file from the sidebar to view it, or wait for the AI assistant's changes to land for review."
  },
  summary: {
    modified: (n: number): string => `${n} modified`,
    added: (n: number): string => `${n} added`,
    deleted: (n: number): string => `${n} deleted`,
    noChanges: "No changes yet"
  }
};

export type Messages = typeof EN_US_MESSAGES;
