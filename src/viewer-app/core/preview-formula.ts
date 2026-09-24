/**
 * Kick a merge-preview Sheet formula pass without failing the mounted snapshot.
 *
 * The formula engine starts after the first render, and `waitForLatestApplied` rejects
 * with "Calculation end timeout" when that pass does not finish. Result mutations are
 * `onlyLocal`, so they can still land after the read-only gate.
 */
export async function startPreviewSheetFormulaCalculation(
  start: () => Promise<unknown>,
  waitForApplied: () => Promise<void>
): Promise<void> {
  try {
    await start()
    await waitForApplied()
  } catch {
    // Expected: "Calculation end timeout", or the trigger command failing before
    // LifecycleStages.Rendered. The materialized sheet stays mounted.
  }
}
