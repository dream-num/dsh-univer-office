import * as React from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { isMissingUniverFile, UniverApiError } from '../api/univer-api.ts'
import { useGatewayStatus } from '../hooks/use-gateway-status.ts'

/** Resolve the missing Viewer target from the file response before offering any process action. */
export function PreviewNotice(props: {
  readonly t: TranslateNS<'univer'>
  readonly error: Error | undefined
  readonly gatewayStopped: boolean
  readonly loading: boolean
}): React.ReactElement {
  const { error, t } = props
  if (
    (error instanceof UniverApiError && error.code === 'GATEWAY_UNAVAILABLE') ||
    (error === undefined && props.gatewayStopped)
  ) {
    return <GatewayNotice t={t} fileError={error?.message} />
  }
  let label = t(props.loading ? 'dock.loading' : 'dock.unavailable')
  if (error instanceof UniverApiError && error.code === 'SESSION_SCOPE_DENIED')
    label = t('viewer.scopeDenied')
  else if (isMissingUniverFile(error)) label = t('viewer.missing')
  else if (error !== undefined)
    label = `${t(error instanceof UniverApiError && error.status === 404 ? 'viewer.routeMissing' : 'viewer.requestFailed')} ${error.message}`
  return <span>{label}</span>
}

function GatewayNotice({
  t,
  fileError
}: {
  readonly t: TranslateNS<'univer'>
  readonly fileError: string | undefined
}): React.ReactElement {
  const { status, retry } = useGatewayStatus()
  switch (status.phase) {
    case 'checking':
      return <span>{t('gateway.checking')}</span>
    case 'starting':
      return <span>{t('gateway.starting')}</span>
    case 'running':
      return (
        <span>
          {t('viewer.requestFailed')} {fileError}
        </span>
      )
    case 'unknown':
      return (
        <>
          <span>
            {t('viewer.statusFailed')} {status.reason}
          </span>
          <button type="button" onClick={() => retry(false)}>
            {t('refresh')}
          </button>
        </>
      )
    case 'failed':
    case 'stopped':
      return (
        <>
          <span>
            {status.phase === 'failed'
              ? `${t('gateway.failed')} ${status.reason}`
              : t('dock.gatewayDown')}
          </span>
          <button type="button" onClick={() => retry(true)}>
            {t('dock.startGateway')}
          </button>
        </>
      )
  }
}
