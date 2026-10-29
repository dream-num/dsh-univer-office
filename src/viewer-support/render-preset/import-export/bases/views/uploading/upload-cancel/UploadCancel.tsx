import type { LocaleKey } from '../../../locale/types.js'
import { LocaleService } from '@univerjs/core'
import { useDependency } from '@univerjs/ui'
import { IExchangeOperateService } from '../../../services/operate.service.js'
import { UploadButton } from '../../upload-button/UploadButton.js'

export function UploadCancel() {
  const exchangeOperateService = useDependency(IExchangeOperateService)
  const localeService = useDependency(LocaleService)

  function onClick() {
    exchangeOperateService.interrupt()
  }

  return (
    <UploadButton onClick={onClick}>
      {localeService.t<LocaleKey>('custom-bases-import-export.cancel')}
    </UploadButton>
  )
}
