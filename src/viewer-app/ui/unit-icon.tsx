import {
  UNIT_TYPE_BASE,
  UNIT_TYPE_BOARD,
  UNIT_TYPE_DOC,
  UNIT_TYPE_SLIDE
} from '@univer/collab-gateway-contract'
import {
  BasesMultiIcon,
  BoardsMultiIcon,
  DocsMultiIcon,
  SheetsMultiIcon,
  SlidesMultiIcon
} from '@univerjs/icons'
import type { ReactElement } from 'react'

/** Official Univer product mark for every unit type supported by the Gateway contract. */
export function UnitIcon({ type, className }: { type: number; className?: string }): ReactElement {
  const Icon =
    type === UNIT_TYPE_DOC
      ? DocsMultiIcon
      : type === UNIT_TYPE_SLIDE
        ? SlidesMultiIcon
        : type === UNIT_TYPE_BASE
          ? BasesMultiIcon
          : type === UNIT_TYPE_BOARD
            ? BoardsMultiIcon
            : SheetsMultiIcon
  return <Icon {...(className === undefined ? {} : { className })} aria-hidden="true" />
}
