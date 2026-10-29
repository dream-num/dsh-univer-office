import type { LocaleKey } from '../../locale/types.js'
import { ExchangeFormat } from '@univerjs-pro/exchange-client'
import { LocaleService } from '@univerjs/core'
import { Button, Radio, Select } from '@univerjs/design'
import { LoadingMultiIcon } from '@univerjs/icons'
import { useDependency } from '@univerjs/ui'
import { useRef, useState } from 'react'

export const EXPORT_FORMAT_DIALOG = 'custom-bases-import-export.export-format-dialog'

export interface IExchangeTargetItem {
  label: string
  value: string
}

export interface IExportFormatDialogProps {
  formats: ExchangeFormat[]
  items: IExchangeTargetItem[]
  selectedId: string
  onCancel: () => void
  onConfirm: (format: ExchangeFormat, selectedId: string) => void | Promise<void>
}

export function ExportFormatDialog({
  formats,
  items,
  selectedId: initialSelectedId,
  onCancel,
  onConfirm
}: IExportFormatDialogProps) {
  const localeService = useDependency(LocaleService)
  const [format, setFormat] = useState(formats[0])
  const [selectedId, setSelectedId] = useState(initialSelectedId)
  const [isExporting, setIsExporting] = useState(false)
  const isExportingRef = useRef(false)

  const handleConfirm = async () => {
    if (isExportingRef.current || format === undefined) {
      return
    }

    isExportingRef.current = true
    setIsExporting(true)
    try {
      await onConfirm(format, selectedId)
    } finally {
      isExportingRef.current = false
      setIsExporting(false)
    }
  }

  return (
    <div className="univer-flex univer-flex-col univer-gap-5 univer-p-1">
      <div className="univer-flex univer-flex-col univer-gap-4">
        {formats.map((item) => (
          <div key={item} className="univer-flex univer-items-center univer-gap-3">
            <Radio
              value={item}
              checked={format === item}
              onChange={(value) => setFormat(value as ExchangeFormat)}
            >
              <span className="univer-w-10">{item.toUpperCase()}</span>
            </Radio>
            {item !== ExchangeFormat.XLSX && (
              <Select
                className="univer-w-48"
                value={selectedId}
                options={items}
                onChange={(value) => setSelectedId(String(value))}
              />
            )}
          </div>
        ))}
      </div>
      <div className="univer-flex univer-justify-end univer-gap-2">
        <Button type="button" variant="default" onClick={onCancel}>
          {localeService.t<LocaleKey>('custom-bases-import-export.cancel')}
        </Button>
        <Button
          type="button"
          variant="primary"
          aria-busy={isExporting}
          disabled={isExporting || !format || (format !== ExchangeFormat.XLSX && !selectedId)}
          onClick={handleConfirm}
        >
          {isExporting && <LoadingMultiIcon className="univer-animate-spin" />}
          {localeService.t<LocaleKey>('custom-bases-import-export.confirm')}
        </Button>
      </div>
    </div>
  )
}
