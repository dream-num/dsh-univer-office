import type { LocaleKey } from '../../locale/types.js'
import { LocaleService } from '@univerjs/core'
import { useDependency } from '@univerjs/ui'
import { UploadAgain } from '../upload-again/UploadAgain.js'

export interface IUploadSuccessProps {
  count: number
}

export function UploadSuccess(props: IUploadSuccessProps) {
  const { count } = props
  const localeService = useDependency(LocaleService)

  return (
    <div
      className={`
              univer-mt-3 univer-flex univer-items-center univer-justify-between univer-py-0 univer-pl-2 univer-pr-1
            `}
    >
      <span className="univer-text-sm univer-text-gray-500">
        {localeService.t<LocaleKey>('custom-slides-import-export.uploadSuccessTip', `${count}`)}
      </span>
      <UploadAgain />
    </div>
  )
}
