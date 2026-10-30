// Build-time stand-in for `@univer-cli/univer-collaboration-runtime` in the Host bundle.
//
// The runtime pool value-imports only `CollaborationRuntimeError` from that package, but its
// single entry statically loads the whole Univer engine, which then lands in lib/index.js
// (+27.7 MB). `scripts/build.mjs` redirects the package here for the Host build only; the
// pooled workers still run the real runtime. Remove this file and the redirect once the Univer
// CLI SDK exposes the error class without the engine (CLI SDK issue #83).
//
// Mirrors the CLI SDK class; test/unit/host/collaboration-runtime-error.test.ts keeps the two
// in step.

export type CollaborationRuntimeErrorCode =
  | 'COLLABORATION_INVALID_INPUT'
  | 'COLLABORATION_LOAD_FAILED'
  | 'COLLABORATION_UNAVAILABLE'
  | 'COLLABORATION_PROTOCOL_ERROR'
  | 'COLLABORATION_CLOSED'

export interface CollaborationRuntimeErrorOptions extends ErrorOptions {
  readonly retryable?: boolean
}

export class CollaborationRuntimeError extends Error {
  readonly code: CollaborationRuntimeErrorCode
  readonly retryable: boolean

  constructor(
    code: CollaborationRuntimeErrorCode,
    message: string,
    options: CollaborationRuntimeErrorOptions = {}
  ) {
    super(message, options)
    this.name = 'CollaborationRuntimeError'
    this.code = code
    this.retryable = options.retryable ?? false
  }
}
