import type { UniverLocaleKey } from './zh.ts'

/** English UI strings. */
export const en = {
  title: 'Univer Preview', expand: 'Expand preview', collapse: 'Collapse preview', refresh: 'Refresh',
  'gateway.running': 'Univer Gateway running', 'gateway.stopped': 'Univer Gateway stopped — click to start',
  'gateway.starting': 'Starting Univer Gateway…', 'gateway.checking': 'Checking Univer Gateway…', 'gateway.failed': 'Univer Gateway unavailable — click to retry',
  'dock.live': 'live sync', 'dock.draft': 'Editing', 'dock.ready': 'Ready', 'dock.mergeReady': 'Ready',
  'dock.unit.added': 'A', 'dock.unit.modified': 'M', 'dock.unit.deleted': 'D', 'dock.unit.conflict': 'Conflict',
  'dock.fold': 'Collapse', 'dock.expand': 'Expand', 'dock.maximize': 'Maximize', 'dock.restore': 'Restore', 'dock.close': 'Close',
  'dock.gatewayDown': 'Univer Gateway is not running; live preview is unavailable', 'dock.startGateway': 'Start Gateway',
  'dock.mergeTitle': 'Merge preview', 'dock.reviewTitle': 'Modification in progress', 'dock.markReady': 'Submit for confirmation',
  'dock.merged': 'Merged', 'dock.discarded': 'Discarded', 'dock.mergedTitle': 'Changes merged', 'dock.discardedTitle': 'Changes discarded',
  'dock.fullscreen': 'Review fullscreen', 'dock.exitFullscreen': 'Exit fullscreen',
  'dock.currentVersion': 'Current version', 'dock.loading': 'Loading', 'dock.unavailable': 'Unavailable',
  'dock.notReady': 'Submit this modification for confirmation before merging or discarding it', 'dock.merge': 'Merge into current version', 'dock.discard': 'Discard',
  'settings.title': 'Univer Office', 'settings.description': 'Control live previews while documents are being edited.',
  'settings.autoOpenLivePreview': 'Open live previews automatically', 'settings.autoOpenLivePreviewHint': 'Show a floating preview while the agent edits a document. Conversation review cards remain available when this is off.',
  'settings.expand': 'Expand', 'settings.collapse': 'Collapse', 'settings.unsaved': 'Unsaved', 'settings.overridden': 'Overridden', 'settings.reset': 'Reset to default',
  'settings.readOnly': 'The current settings document is read-only.',
  'settings.discard': 'Discard changes', 'settings.save': 'Save', 'settings.saving': 'Saving…', 'settings.saveFailed': 'Could not save. Try again.',
} satisfies Record<UniverLocaleKey, string>
