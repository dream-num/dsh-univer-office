import { createRequire } from 'node:module'
import {
  createResourceLibrary,
  FilesystemResourceCache,
  FilesystemResourceOutput,
  HttpsResourceDownloader,
  isResourceLibraryError,
  loadResourceManifestFromPath,
  type ResourceLibrary
} from '@univer-cli/resource-library'
import { UniverError } from '../service/errors.ts'
import type { JsonValue, ResourceOperationRequest, UniverResourceResult } from '../service/types.ts'
import { assertAuthorizedPath } from '../service/workspace.ts'

const require = createRequire(import.meta.url)

/** Bundled resource registries with persistent cache and workspace-confined exports. */
export class ResourceOperations {
  private readonly manifest: unknown
  private readonly cache: FilesystemResourceCache
  private readonly output = new FilesystemResourceOutput()

  constructor(
    cacheRoot: string,
    private readonly downloadTimeoutMs: number
  ) {
    this.manifest = loadResourceManifestFromPath(
      require.resolve('@univerjs-pro/cli-assets/manifest.json')
    )
    this.cache = new FilesystemResourceCache(cacheRoot)
  }

  async execute(
    request: ResourceOperationRequest,
    signal?: AbortSignal
  ): Promise<UniverResourceResult> {
    signal?.throwIfAborted()
    try {
      const library = this.library(signal)
      if (request.action === 'registries') {
        return result({ registries: library.listRegistries() as unknown as JsonValue })
      }
      if (request.action === 'find') {
        const found = library.find({
          queries: request.queries,
          ...(request.registries === undefined ? {} : { registries: request.registries }),
          ...(request.limit === undefined ? {} : { limit: request.limit })
        })
        return result(found as unknown as JsonValue)
      }
      if (request.action === 'read') {
        return result((await library.read({ handle: request.handle })) as unknown as JsonValue)
      }
      if (request.action === 'clear-cache') {
        const cleared = await library.clearCache()
        signal?.throwIfAborted()
        return result({ resourceCount: cleared.resourceCount, byteCount: cleared.byteCount })
      }

      await assertAuthorizedPath(request.outputWorkspace, request.output, false)
      const exported = await library.export({
        handles: request.handles,
        destination: request.output
      })
      signal?.throwIfAborted()
      await Promise.all(
        exported.exported.map(async (item) => {
          await assertAuthorizedPath(request.outputWorkspace, item.path, true)
        })
      )
      return result(exported as unknown as JsonValue)
    } catch (error) {
      signal?.throwIfAborted()
      if (error instanceof UniverError) throw error
      if (isResourceLibraryError(error)) {
        const code = error.code.toUpperCase().replaceAll('-', '_')
        throw new UniverError(error.message, code, { cause: error })
      }
      throw error
    }
  }

  private library(signal?: AbortSignal): ResourceLibrary {
    const fetchImpl: typeof fetch = async (input, init) => {
      const requestSignal = combinedSignal(signal, init?.signal)
      return fetch(input, {
        ...init,
        ...(requestSignal === undefined ? {} : { signal: requestSignal })
      })
    }
    return createResourceLibrary({
      manifest: this.manifest,
      cache: this.cache,
      output: this.output,
      downloader: new HttpsResourceDownloader({
        fetch: fetchImpl,
        timeoutMs: this.downloadTimeoutMs
      })
    })
  }
}

function result(value: JsonValue): UniverResourceResult {
  return { ok: true, operation: 'resources', result: value }
}

function combinedSignal(
  operation: AbortSignal | undefined,
  request: AbortSignal | null | undefined
): AbortSignal | undefined {
  if (operation === undefined) return request ?? undefined
  if (request === undefined || request === null) return operation
  return AbortSignal.any([operation, request])
}
