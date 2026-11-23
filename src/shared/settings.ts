/** Entry id owned by cordis.patch.yml; DSH keys forms by entry. */
export const UNIVER_CONFIG_ENTRY_ID = 'univer'

/** User preferences that affect only the DSH Client presentation. */
export interface UniverSettings {
  readonly autoOpenLivePreview: boolean
  /** Render each Turn's edited `.univer` files as review cards in the conversation. */
  readonly conversationReviewCards: boolean
}

/** Defaults used when the DSH Settings service has no user override. */
export const DEFAULT_UNIVER_SETTINGS: UniverSettings = {
  autoOpenLivePreview: true,
  conversationReviewCards: true
}
