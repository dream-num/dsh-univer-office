import type { ILanguagePack } from '@univerjs/core'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function deepMerge(target: object, source: object): Record<string, unknown> {
  const output = target as Record<string, unknown>
  for (const [key, sourceValue] of Object.entries(source)) {
    if (isRecord(sourceValue)) {
      const targetValue = output[key]
      output[key] = deepMerge(isRecord(targetValue) ? targetValue : {}, sourceValue)
    } else {
      output[key] = sourceValue
    }
  }
  return output
}

export function mergeLocalePacks(packs: ReadonlyArray<object>): ILanguagePack {
  return packs.reduce((target, source) => deepMerge(target, source), {}) as ILanguagePack
}
