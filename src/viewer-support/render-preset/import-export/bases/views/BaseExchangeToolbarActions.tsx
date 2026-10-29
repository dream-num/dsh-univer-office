import type { IDropdownMenuProps } from '@univerjs/design'
import type { MenuConfig } from '@univerjs/ui'
import type { LocaleKey } from '../locale/types.js'
import { ICommandService, IConfigService, LocaleService } from '@univerjs/core'
import { Button, DropdownMenu, Tooltip } from '@univerjs/design'
import { DirectExportIcon, ExportIcon, FolderIcon, MoreDownIcon } from '@univerjs/icons'
import { useDependency } from '@univerjs/ui'
import {
  ExportBaseOperation,
  ImportBaseOperation
} from '../commands/operations/exchange.operation.js'

export function BaseExchangeToolbarActions() {
  const commandService = useDependency(ICommandService)
  const configService = useDependency(IConfigService)
  const localeService = useDependency(LocaleService)
  const fileLabel = localeService.t<LocaleKey>('custom-bases-import-export.file')
  const importHidden = configService.getConfig<MenuConfig>('menu')?.[ImportBaseOperation.id]?.hidden
  const items: IDropdownMenuProps['items'] = [
    ...(!importHidden
      ? [
          {
            type: 'item',
            children: (
              <span className="univer-flex univer-items-center univer-gap-2">
                <FolderIcon />
                {localeService.t<LocaleKey>('custom-bases-import-export.upload')}
              </span>
            ),
            onSelect: () => commandService.executeCommand(ImportBaseOperation.id)
          } as const
        ]
      : []),
    {
      type: 'item',
      children: (
        <span className="univer-flex univer-items-center univer-gap-2">
          <ExportIcon />
          {localeService.t<LocaleKey>('custom-bases-import-export.download')}
        </span>
      ),
      onSelect: () => commandService.executeCommand(ExportBaseOperation.id)
    }
  ]

  return (
    <Tooltip title={fileLabel} placement="top">
      <DropdownMenu align="end" sideOffset={8} items={items}>
        <Button
          type="button"
          variant="text"
          className="univer-h-8 univer-gap-1 univer-px-2"
          aria-label={fileLabel}
        >
          <DirectExportIcon />
          <MoreDownIcon className="univer-size-3" />
        </Button>
      </DropdownMenu>
    </Tooltip>
  )
}
