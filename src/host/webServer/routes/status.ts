import type { UniverService } from '../../service/univer-service.ts'
import type { UniverStatus } from '../../../shared/wire/status.ts'

/** Build the browser-visible plugin status. */
export async function statusRoute(service: UniverService): Promise<UniverStatus> {
  const [gateway, unitContent] = await Promise.all([
    service.gatewayStatus(),
    service.unitContentStatus()
  ])
  return { gateway, unitContent }
}
