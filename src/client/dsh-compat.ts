import type { Context } from '@deepseek-ai/cordis'

export type DshConversationApi = 'combined' | 'split'

interface ConversationEventRegistry {
  register(definition: unknown): unknown
}

interface UiConversationService {
  readonly events: ConversationEventRegistry
}

/** Register a Conversation definition against the API exposed by the active DSH Client. */
export function registerConversationDefinition(
  ctx: Context,
  definition: unknown
): DshConversationApi {
  // DSH 0.1.2-alpha.1 moved the event registry under uiConversation and split
  // Chat from Session. Probe the service instead of relying on an unavailable
  // runtime version so the same browser bundle can also run on 0.1.1-rc.2.
  const uiConversation = ctx.get('uiConversation') as UiConversationService | undefined
  if (uiConversation !== undefined) {
    registerDefinition(uiConversation.events, definition)
    return 'split'
  }

  const conversationEvents = ctx.get('conversationEvents') as ConversationEventRegistry | undefined
  if (conversationEvents === undefined) {
    throw new Error('dsh-univer-office: active conversation service exposes no event registry')
  }
  registerDefinition(conversationEvents, definition)
  return 'combined'
}

function registerDefinition(registry: ConversationEventRegistry, definition: unknown): void {
  try {
    registry.register(definition)
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('already registered')) throw error
  }
}
