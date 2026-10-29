import type { UniverInstanceType } from '@univerjs/core'
import { UNIT_FILE_EXTENSIONS } from './content-type.js'

export function isSupportedFileType(file: File, univerType: UniverInstanceType): boolean {
  const extName = file.name.split('.').pop()?.toLowerCase()
  return Boolean(extName && (UNIT_FILE_EXTENSIONS[univerType] ?? []).includes(extName))
}

export function getUploadFile(
  types: UniverInstanceType[],
  multiple = false
): Promise<FileList | null> {
  const acceptTypes = types
    .flatMap((type) => UNIT_FILE_EXTENSIONS[type] ?? [])
    .map((extension) => `.${extension}`)
    .join(',')
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = acceptTypes
    input.multiple = multiple

    const finish = () => resolve(input.files?.length ? input.files : null)
    input.addEventListener('change', finish, { once: true })
    input.addEventListener('cancel', finish, { once: true })

    input.click()
  })
}
