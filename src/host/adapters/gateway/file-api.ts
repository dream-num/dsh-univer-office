import type { JsonValue, UniverUnitKind } from '../../service/types.ts'
import type { GatewayClient } from './client.ts'

/** Encode an absolute file path as the key used by the collaboration Gateway. */
export function fileKeyOf(file: string): string {
  return Buffer.from(file, 'utf8').toString('base64url')
}

/** Gateway file API used by the Provider. */
export class GatewayFileApi {
  constructor(private readonly client: GatewayClient) {}

  /** Return the raw worktree listing for one file. */
  listWorktrees(file: string): Promise<JsonValue> {
    return this.client.get(`/uf/${fileKeyOf(file)}/worktrees`)
  }

  /** Return trunk Units for one file. */
  listUnits(file: string): Promise<JsonValue> {
    return this.client.get(`/uf/${fileKeyOf(file)}/units`)
  }

  /** Create an empty Univer file in the bundled collaboration store. */
  create(file: string): Promise<JsonValue> {
    return this.client.post(`/uf/${fileKeyOf(file)}`, {})
  }

  /** Create the first trunk Unit after the file container exists. */
  createUnit(file: string, kind: UniverUnitKind, name: string): Promise<JsonValue> {
    return this.client.post(
      `/uf/${fileKeyOf(file)}/universer-api/snapshot/${String(unitType(kind))}/unit/-/create`,
      { name },
    )
  }
}

function unitType(kind: UniverUnitKind): 1 | 2 | 3 | 5 | 6 {
  if (kind === 'doc') return 1
  if (kind === 'sheet') return 2
  if (kind === 'slide') return 3
  if (kind === 'base') return 5
  return 6
}
