import { CollaborationRuntimeError as Upstream } from '@univer-cli/univer-collaboration-runtime'
import { describe, expect, it } from 'vitest'
import { CollaborationRuntimeError as Shim } from '../../../src/host/adapters/unit-content/collaboration-runtime-error.ts'

const describeError = (error: Error & { code: string; retryable: boolean }) => ({
  name: error.name,
  message: error.message,
  code: error.code,
  retryable: error.retryable,
  cause: error.cause,
  ownKeys: Object.keys(error).toSorted()
})

// The Host build swaps the upstream class for the shim; the runtime pool must observe the same
// fields either way.
describe('CollaborationRuntimeError shim', () => {
  it('matches the upstream class with default options', () => {
    expect(describeError(new Shim('COLLABORATION_UNAVAILABLE', 'down'))).toEqual(
      describeError(new Upstream('COLLABORATION_UNAVAILABLE', 'down'))
    )
  })

  it('matches the upstream class when retryable with a cause', () => {
    const options = { retryable: true, cause: new Error('io') }
    expect(describeError(new Shim('COLLABORATION_LOAD_FAILED', 'load', options))).toEqual(
      describeError(new Upstream('COLLABORATION_LOAD_FAILED', 'load', options))
    )
  })
})
