import type { LocaleKey } from '../../locale/types.js'
import { LocaleService } from '@univerjs/core'
import { useDependency } from '@univerjs/ui'
import { UploadCancel } from './upload-cancel/UploadCancel.js'
import { UploadProgress } from './upload-progress/UploadProgress.js'

export function Uploading() {
  const localeService = useDependency(LocaleService)

  return (
    <div className="univer-mt-5 univer-flex univer-flex-col">
      <span
        className={`
                  univer-pl-2 univer-pr-4 univer-text-sm univer-text-gray-900
                  dark:!univer-text-gray-0
                `}
      >
        {localeService.t<LocaleKey>('custom-import-export.wait')}
      </span>
      <div className="univer-pl-2 univer-pr-4">
        <UploadProgress />
      </div>
      <UploadCancel />
    </div>
  )
}
