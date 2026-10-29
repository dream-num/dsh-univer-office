import { DirectExportIcon, ExportIcon, FolderIcon } from '@univerjs/icons'
import type { IconType } from '@univerjs/ui'

/**
 * Icons the import/export menus reference by name.
 *
 * `@univerjs/icons` and `@univerjs/ui` each declare `IIconProps`; the two only disagree under
 * `exactOptionalPropertyTypes` (`className?: string` against `string | undefined`), so the
 * components are registered through the Icon Manager's own type.
 */
export const EXCHANGE_ICONS = { DirectExportIcon, ExportIcon, FolderIcon } as unknown as Record<
  string,
  IconType
>
