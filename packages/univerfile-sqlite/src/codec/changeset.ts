import type { ChangesetRecord } from '@univerjs-pro/collaboration-service'
import type { IChangeset } from '@univerjs/protocol'
import { decodeStoredJson } from './stored-json.ts'

/** The v3 payload contains only the protocol changeset. */
export function protocolChangeset({
  metadata: _metadata,
  ...changeset
}: ChangesetRecord): IChangeset {
  return changeset
}

export function readChangeset(payload: string): ChangesetRecord {
  return { ...decodeStoredJson<IChangeset>(payload), metadata: {} }
}
