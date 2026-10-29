import { describe, expect, it } from 'vitest'
import { startPreviewSheetFormulaCalculation } from '../../src/viewer-app/core/preview-formula.ts'

describe('startPreviewSheetFormulaCalculation', () => {
  it('starts the formula pass, then waits for it', async () => {
    const applied: string[] = []
    await startPreviewSheetFormulaCalculation(
      async () => {
        applied.push('start')
      },
      async () => {
        applied.push('wait')
      }
    )
    expect(applied).toEqual(['start', 'wait'])
  })

  it('skips the wait when the trigger fails before Rendered', async () => {
    let waited = false
    await expect(
      startPreviewSheetFormulaCalculation(
        async () => {
          throw new Error('formula trigger failed before Rendered')
        },
        async () => {
          waited = true
        }
      )
    ).resolves.toBeUndefined()
    expect(waited).toBe(false)
  })

  it('does not fail the mounted snapshot on a calculation timeout', async () => {
    await expect(
      startPreviewSheetFormulaCalculation(
        async () => undefined,
        async () => {
          throw new Error('Calculation end timeout')
        }
      )
    ).resolves.toBeUndefined()
  })
})
