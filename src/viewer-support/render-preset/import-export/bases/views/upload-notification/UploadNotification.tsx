import type { LocaleKey } from '../../locale/types.js'
import { LocaleService } from '@univerjs/core'
import { ClockIcon, CloseIcon, ErrorIcon, SuccessIcon } from '@univerjs/icons'
import { useDependency, useObservable } from '@univerjs/ui'
import {
  IUploadNotificationService,
  UploadNotificationState
} from '../../services/upload-notification.service.js'
import { LinkList } from '../link-list/LinkList.js'
import { UploadError } from '../upload-error/UploadError.js'
import { UploadSuccess } from '../upload-success/UploadSuccess.js'
import { Uploading } from '../uploading/Uploading.js'

const iconMap = {
  [UploadNotificationState.SUCCESS]: <SuccessIcon className="univer-text-green-500" />,
  [UploadNotificationState.UPLOADING]: <ClockIcon className="univer-text-blue-500" />,
  [UploadNotificationState.ERROR]: <ErrorIcon className="univer-text-red-500" />
}

export function UploadNotification() {
  const uploadNotificationService = useDependency(IUploadNotificationService)
  const localeService = useDependency(LocaleService)
  const uploadState = useObservable(
    uploadNotificationService.state$,
    UploadNotificationState.UPLOADING
  )
  const visible = useObservable(uploadNotificationService.visible$, false)
  const linkList = useObservable(uploadNotificationService.list$, [])

  function onClose() {
    uploadNotificationService.hide()
  }

  function renderTitleByState(state: UploadNotificationState) {
    switch (state) {
      case UploadNotificationState.SUCCESS:
        return localeService.t<LocaleKey>('custom-bases-import-export.uploadSuccess')
      case UploadNotificationState.UPLOADING:
        return localeService.t<LocaleKey>('custom-bases-import-export.uploading')
      case UploadNotificationState.ERROR:
        return localeService.t<LocaleKey>('custom-bases-import-export.unknownMistake')
      default:
        return ''
    }
  }

  return (
    visible && (
      <div
        className={`
                  univer-fixed univer-bottom-12 univer-right-3 univer-z-[1000] univer-box-border univer-flex
                  univer-w-[372px] univer-flex-col univer-rounded-md univer-bg-gray-0 univer-px-3 univer-pb-4
                  univer-pt-5 univer-shadow-md
                `}
      >
        <div
          className={`
                      univer-flex univer-items-center univer-justify-between univer-py-0 univer-pl-1.5 univer-pr-2
                    `}
        >
          <span className="univer-flex univer-items-center">
            <span
              className={`
                              univer-flex univer-size-6 univer-shrink-0 univer-items-center univer-justify-center
                              univer-text-2xl
                            `}
            >
              {iconMap[uploadState]}
            </span>
            <span
              className={`
                              univer-ml-1.5 univer-font-semibold univer-text-gray-900
                              dark:!univer-text-gray-0
                            `}
            >
              {renderTitleByState(uploadState)}
            </span>
          </span>
          <button
            type="button"
            aria-label={localeService.t<LocaleKey>('custom-bases-import-export.cancel')}
            className={`
                          univer-flex univer-size-6 univer-cursor-pointer univer-p-0 univer-items-center univer-justify-center
                          univer-rounded univer-border-none univer-bg-transparent univer-text-gray-500
                          univer-transition-colors
                          hover:univer-bg-gray-200
                          dark:!univer-bg-gray-600
                        `}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <div>
          {uploadState === UploadNotificationState.UPLOADING && <Uploading />}
          {uploadState === UploadNotificationState.ERROR && <UploadError />}
          {linkList.length > 0 && <LinkList list={linkList} />}
          {uploadState === UploadNotificationState.SUCCESS && (
            <UploadSuccess count={linkList.length} />
          )}
        </div>
      </div>
    )
  )
}
