/** Settings namespace owned by the Univer Office plugin. */
export const UNIVER_SETTINGS_NAMESPACE = 'univer-office'

/** User preferences that affect only the DSH Client presentation. */
export interface UniverSettings {
  readonly autoOpenLivePreview: boolean
}

/** Defaults used when the DSH Settings service has no user override. */
export const DEFAULT_UNIVER_SETTINGS: UniverSettings = {
  autoOpenLivePreview: true
}
