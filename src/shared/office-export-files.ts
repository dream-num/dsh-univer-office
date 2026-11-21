import { ExchangeFormat, type ExportOptions } from '@univerjs-pro/exchange-node'
import { UniverInstanceType } from '@univerjs/core'

// Exchange Service uses a transparent pixel for URL images instead of fetching remote content.
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

/** Attach Exchange's file resolver only for Unit/format pairs that accept it. */
export function withOfficeExportFiles(
  options: ExportOptions,
  unitId: string,
  readAsset: (assetId: string) => Uint8Array | undefined | Promise<Uint8Array | undefined>
): ExportOptions {
  if (
    options.type === UniverInstanceType.UNIVER_BASE ||
    (options.type === UniverInstanceType.UNIVER_SHEET && options.format !== ExchangeFormat.XLSX)
  )
    return options

  return {
    ...options,
    files: {
      load: async (ref) => {
        if (ref.sourceType === 'URL') return { bytes: TRANSPARENT_PNG }
        if (
          ref.unitId !== unitId ||
          !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(ref.source)
        ) {
          throw new Error('Office export requires an embedded file belonging to this Unit.')
        }
        const bytes = await readAsset(ref.source)
        if (bytes === undefined) throw new Error('The embedded Office file was not found.')
        return { bytes }
      }
    }
  }
}
