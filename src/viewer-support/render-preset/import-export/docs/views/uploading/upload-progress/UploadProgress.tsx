import { useDependency, useObservable } from '@univerjs/ui'
import { IExchangeOperateService } from '../../../services/operate.service.js'

export function UploadProgress() {
  const exchangeOperateService = useDependency(IExchangeOperateService)
  const uploadProgress = useObservable(exchangeOperateService.progress$)!

  const { count, done } = uploadProgress
  const progress = count > 0 ? done / count : 0

  return (
    <div
      className={`
              univer-mx-0 univer-mb-3 univer-mt-4 univer-h-1.5 univer-w-[324px] univer-rounded-lg univer-bg-gray-200
            `}
    >
      <div
        className={`
                  univer-h-1.5 univer-rounded-lg univer-bg-primary-600 univer-transition-[width] univer-duration-500
                `}
        style={{
          width: `${Math.floor(progress * 100)}%`
        }}
      />
    </div>
  )
}
