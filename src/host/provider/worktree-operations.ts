import type { WorktreeReviewAction } from '../../shared/wire/actions.ts'
import type { ChangedUnit } from '../../shared/wire/state.ts'
import { GatewayClient, gatewayErrorMessage } from '../adapters/gateway/client.ts'
import { GatewayWorktreeApi } from '../adapters/gateway/worktree-api.ts'
import { isRecord, mapChangedUnits } from '../adapters/gateway/mapping.ts'
import { UniverError } from '../service/errors.ts'

/** Worktree reads and mutations over the package-local Gateway. */
export class WorktreeOperations {
  constructor(
    private readonly gatewayTimeoutMs: number,
    private readonly gatewayMutationTimeoutMs: number
  ) {}

  /** Read changed units from the Gateway merge preview. */
  async changedUnits(gateway: string, file: string, worktreeId: string): Promise<ChangedUnit[]> {
    return mapChangedUnits(
      await new GatewayWorktreeApi(new GatewayClient(gateway, this.gatewayTimeoutMs)).preview(
        file,
        worktreeId
      )
    )
  }

  /** Apply one human review action through Gateway. */
  async action(
    gateway: string,
    file: string,
    worktreeId: string,
    action: WorktreeReviewAction
  ): Promise<void> {
    const value = await new GatewayWorktreeApi(
      new GatewayClient(gateway, this.gatewayMutationTimeoutMs)
    ).action(file, worktreeId, action)
    if (
      isRecord(value) &&
      (value.ok === false || (isRecord(value.error) && value.error.code === 0))
    ) {
      throw new UniverError(
        gatewayErrorMessage(value) ?? 'Gateway rejected the worktree action.',
        'WORKTREE_ACTION_REJECTED'
      )
    }
  }
}
