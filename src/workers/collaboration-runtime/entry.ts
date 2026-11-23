import type { UniverCollaborationRuntimeWorkerDefinition } from '@univer-cli/univer-collaboration-runtime-pool'
import {
  loadUnitContentRuntime,
  parseUnitContentRuntimeInit
} from '../unit-content/runtime/content-runtime.ts'

/**
 * Worker definition the Host's runtime pool imports in each pooled child process. The pool
 * owns the process and IPC; each createRuntime call binds its own Unit through the Gateway. A plain
 * object keeps the pool package itself out of this bundle.
 */
const worker: UniverCollaborationRuntimeWorkerDefinition = {
  createRuntime: (init) => loadUnitContentRuntime(parseUnitContentRuntimeInit(init))
}

export default worker
