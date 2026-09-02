import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import type { UniverApiResult, UniverOperationResult } from '../service/types.ts'

/** Output schema shared by all Univer operation tools. */
export const operationOutput = {
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean' as const, required: true, const: true },
      operation: {
        type: 'string' as const,
        required: true,
        enum: [
          'new',
          'status',
          'inspect',
          'execute',
          'import',
          'export',
          'lint',
          'screenshot',
          'compile-svg',
          'unit',
          'worktree'
        ] as const
      },
      file: { type: 'string' as const, required: true },
      result: { type: 'json' as const, required: true }
    }
  },
  render: (_args: unknown, value: UniverOperationResult) => [
    { type: 'text' as const, text: renderOperationResult(value) }
  ]
} as const

/** Output schema for version-matched Facade reference reads. */
export const apiOutput = {
  schema: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean' as const, required: true, const: true },
      operation: { type: 'string' as const, required: true, const: 'api' },
      result: { type: 'json' as const, required: true }
    }
  },
  render: (_args: unknown, value: UniverApiResult) => [
    { type: 'text' as const, text: JSON.stringify(value) }
  ]
} as const

/** Pure text projection of a structured Univer operation result. */
export function renderOperationResult(value: UniverOperationResult): string {
  return JSON.stringify(value)
}

/** Pure generic-card title for one Univer operation. */
export function operationTitle(operation: string, file: string): string {
  return `Univer ${operation}: ${file}`
}

/** Keep stable Univer failure codes visible to the model while preserving DSH-owned result fields. */
export function withUniverErrorContent(definition: ToolDefinition): ToolDefinition {
  const finalizeContent = definition.finalizeContent?.bind(definition)
  return {
    ...definition,
    finalizeContent(exec, result) {
      if (result.isError && result.error.info?.name === 'UniverError') {
        return [
          { type: 'text', text: `Error [${result.error.info.code}]: ${result.error.message}` }
        ]
      }
      return finalizeContent?.(exec, result)
    }
  }
}
