import type { IRange } from '@univerjs/core'

/**
 * Reduce an exact cell coverage set to fewer rectangles without highlighting unchanged cells.
 */
export function compactHighlightRanges(input: readonly IRange[]): IRange[] {
  let ranges = removeContainedRanges(input.map(normalizeRange))

  while (true) {
    const next = removeContainedRanges(mergeRangesByColumns(mergeRangesByRows(ranges)))
    if (next.length === ranges.length) {
      return next
    }
    ranges = next
  }
}

function normalizeRange(range: IRange): IRange {
  return {
    endColumn: Math.max(range.startColumn, range.endColumn),
    endRow: Math.max(range.startRow, range.endRow),
    startColumn: Math.min(range.startColumn, range.endColumn),
    startRow: Math.min(range.startRow, range.endRow)
  }
}

function removeContainedRanges(input: readonly IRange[]): IRange[] {
  const ranges = input.filter(
    (range, index) =>
      !input.some(
        (candidate, candidateIndex) =>
          candidateIndex !== index &&
          contains(candidate, range) &&
          (candidate.startRow !== range.startRow ||
            candidate.endRow !== range.endRow ||
            candidate.startColumn !== range.startColumn ||
            candidate.endColumn !== range.endColumn ||
            candidateIndex < index)
      )
  )

  return ranges.sort(compareRanges)
}

function contains(container: IRange, range: IRange): boolean {
  return (
    container.startRow <= range.startRow &&
    container.endRow >= range.endRow &&
    container.startColumn <= range.startColumn &&
    container.endColumn >= range.endColumn
  )
}

function mergeRangesByRows(input: readonly IRange[]): IRange[] {
  return mergeRanges(
    input,
    (range) => `${range.startRow}:${range.endRow}`,
    (left, right) => right.startColumn <= left.endColumn + 1,
    (left, right) => ({ ...left, endColumn: Math.max(left.endColumn, right.endColumn) }),
    (left, right) => left.startColumn - right.startColumn || left.endColumn - right.endColumn
  )
}

function mergeRangesByColumns(input: readonly IRange[]): IRange[] {
  return mergeRanges(
    input,
    (range) => `${range.startColumn}:${range.endColumn}`,
    (left, right) => right.startRow <= left.endRow + 1,
    (left, right) => ({ ...left, endRow: Math.max(left.endRow, right.endRow) }),
    (left, right) => left.startRow - right.startRow || left.endRow - right.endRow
  )
}

function mergeRanges(
  input: readonly IRange[],
  groupKey: (range: IRange) => string,
  canMerge: (left: IRange, right: IRange) => boolean,
  merge: (left: IRange, right: IRange) => IRange,
  compareWithinGroup: (left: IRange, right: IRange) => number
): IRange[] {
  const groups = new Map<string, IRange[]>()
  for (const range of input) {
    const key = groupKey(range)
    const group = groups.get(key)
    if (group === undefined) {
      groups.set(key, [range])
    } else {
      group.push(range)
    }
  }

  const result: IRange[] = []
  for (const group of groups.values()) {
    group.sort(compareWithinGroup)
    for (const range of group) {
      const previous = result[result.length - 1]
      if (
        previous !== undefined &&
        groupKey(previous) === groupKey(range) &&
        canMerge(previous, range)
      ) {
        result[result.length - 1] = merge(previous, range)
      } else {
        result.push(range)
      }
    }
  }
  return result
}

function compareRanges(left: IRange, right: IRange): number {
  return (
    left.startRow - right.startRow ||
    left.startColumn - right.startColumn ||
    left.endRow - right.endRow ||
    left.endColumn - right.endColumn
  )
}
