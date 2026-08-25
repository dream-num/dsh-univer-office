import type { WorktreeReviewAction } from '../../../shared/wire/actions.ts'
import type { JsonValue, UniverUnitKind } from '../../service/types.ts'
import type { GatewayClient } from './client.ts'
import { fileKeyOf } from './file-api.ts'

/** Gateway worktree API used by the Provider. */
export class GatewayWorktreeApi {
  constructor(private readonly client: GatewayClient) {}

  /** Return merge-preview metadata for one worktree. */
  preview(file: string, worktreeId: string): Promise<JsonValue> {
    return this.client.get(`/uf/${fileKeyOf(file)}/worktrees/${encodeURIComponent(worktreeId)}/preview`)
  }

  /** Create an isolated worktree for agent edits. */
  create(file: string, name: string | undefined): Promise<JsonValue> {
    return this.client.post(`/uf/${fileKeyOf(file)}/worktrees`, {
      agentId: 'dsh-agent',
      name: name ?? 'DSH agent worktree',
    })
  }

  /** Return Units visible inside one worktree. */
  listUnits(file: string, worktreeId: string): Promise<JsonValue> {
    return this.client.get(`/uf/${fileKeyOf(file)}/worktrees/${encodeURIComponent(worktreeId)}/units`)
  }

  /** Create a Unit inside a draft worktree. */
  createUnit(
    file: string,
    worktreeId: string,
    kind: UniverUnitKind,
    name: string,
    snapshot?: JsonValue,
  ): Promise<JsonValue> {
    return this.client.post(
      `/uf/${fileKeyOf(file)}/worktrees/${encodeURIComponent(worktreeId)}/units`,
      { type: unitType(kind), name, ...(snapshot === undefined ? {} : { snapshot }) },
    )
  }

  /** Remove a Unit inside a draft worktree. */
  removeUnit(file: string, worktreeId: string, unitId: string): Promise<JsonValue> {
    return this.client.post(
      `/uf/${fileKeyOf(file)}/worktrees/${encodeURIComponent(worktreeId)}/units/${encodeURIComponent(unitId)}/remove`,
      {},
    )
  }

  /** Apply one worktree lifecycle transition. */
  action(file: string, worktreeId: string, action: WorktreeReviewAction): Promise<JsonValue> {
    return this.client.post(`/uf/${fileKeyOf(file)}/worktrees/${encodeURIComponent(worktreeId)}/${action}`)
  }
}

function unitType(kind: UniverUnitKind): 1 | 2 | 3 | 5 | 6 {
  if (kind === 'doc') return 1
  if (kind === 'sheet') return 2
  if (kind === 'slide') return 3
  if (kind === 'base') return 5
  return 6
}
