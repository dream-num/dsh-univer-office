import type { ILinkList } from '../../services/upload-notification.service.js'
import { UniverInstanceType } from '@univerjs/core'
import { clsx, scrollbarClassName, Tooltip } from '@univerjs/design'
import { DocsMultiIcon, ShareRangeIcon, SheetsMultiIcon, SlidesMultiIcon } from '@univerjs/icons'

export interface ILinkListProps {
  list: ILinkList[]
}

export function LinkList(props: ILinkListProps) {
  const { list } = props

  function renderIcon(type: UniverInstanceType) {
    switch (type) {
      case UniverInstanceType.UNIVER_DOC:
        return <DocsMultiIcon />
      case UniverInstanceType.UNIVER_SHEET:
      case UniverInstanceType.UNIVER_BASE:
        return <SheetsMultiIcon />
      case UniverInstanceType.UNIVER_SLIDE:
        return <SlidesMultiIcon />
      default:
        return null
    }
  }

  return (
    <div
      className={clsx(
        'univer-mt-5 univer-max-h-72 univer-overflow-y-auto univer-overflow-x-hidden',
        scrollbarClassName
      )}
    >
      <ul className="univer-m-0 univer-flex univer-list-none univer-flex-col univer-gap-2 univer-p-0">
        {list.map((item, index) => {
          return (
            <li key={index}>
              <a
                className={`
                                  univer-flex univer-justify-between univer-rounded univer-border-none
                                  univer-bg-transparent univer-px-2 univer-py-1 univer-text-gray-900 univer-no-underline
                                  univer-outline-none univer-transition-colors
                                  hover:univer-bg-gray-200
                                  dark:!univer-text-gray-0
                                  dark:hover:!univer-bg-gray-600
                                `}
                href={item.link}
                target="_blank"
                rel="noreferrer"
              >
                <span className="univer-flex univer-w-[calc(100%-48px)] univer-items-center">
                  <span className="univer-flex univer-h-5 univer-text-xl">
                    {renderIcon(item.type)}
                  </span>
                  <Tooltip showIfEllipsis title={item.name} asChild>
                    <span
                      className={`
                                              univer-ml-1 univer-truncate univer-text-sm univer-text-gray-900
                                              dark:!univer-text-gray-0
                                            `}
                    >
                      {item.name}
                    </span>
                  </Tooltip>
                </span>
                <span
                  className={`
                                      univer-flex univer-size-6 univer-items-center univer-justify-center univer-rounded
                                      univer-border-none univer-bg-transparent univer-p-0 univer-text-base
                                      univer-text-gray-600 univer-outline-none univer-transition-colors
                                      hover:univer-bg-gray-200
                                      dark:!univer-text-gray-200
                                      dark:hover:!univer-bg-gray-600
                                    `}
                >
                  <ShareRangeIcon />
                </span>
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
