import { UniverCollabService } from '@univerjs-pro/collaboration-service'
import { getExportQuota } from '@univerjs-pro/exchange-node'
import { describe, expect, it } from 'vitest'
import { openUniverfile } from '../../packages/univerfile-sqlite/src/index.ts'
import {
  UNIVER_LICENSE,
  UNIVER_LICENSE_KEY,
  univerLicense,
  univerServerCredentials
} from '../../src/shared/univer-license.ts'
import { TEST_LICENSE } from '../../src/viewer-support/render-preset/license.ts'

describe('Univer credentials', () => {
  it('keeps the browser License in step with the Node one', () => {
    expect(TEST_LICENSE).toBe(UNIVER_LICENSE)
  })

  it('uses the bundled pair unless the environment replaces both', () => {
    const bundled = { license: UNIVER_LICENSE, licenseKey: UNIVER_LICENSE_KEY }
    expect(univerServerCredentials({})).toEqual(bundled)
    expect(univerServerCredentials({ UNIVER_LICENSE: ' ', UNIVER_LICENSE_KEY: 'k' })).toEqual(
      bundled
    )
    expect(univerServerCredentials({ UNIVER_LICENSE: ' l ', UNIVER_LICENSE_KEY: ' k ' })).toEqual({
      license: 'l',
      licenseKey: 'k'
    })
    expect(() => univerServerCredentials({ UNIVER_LICENSE: 'l' })).toThrow(/UNIVER_LICENSE_KEY/)
    expect(univerLicense({})).toBe(UNIVER_LICENSE)
    expect(univerLicense({ UNIVER_LICENSE: 'l' })).toBe('l')
  })

  it('is accepted by the Collaboration SDK', async () => {
    const file = openUniverfile(':memory:', { create: true })
    try {
      const service = new UniverCollabService({
        dbAdapter: file.trunk,
        ...univerServerCredentials({})
      })
      expect(service.license.status).toBe('valid')
      expect(service.license.domains).toEqual(['localhost', 'app', '127.0.0.1'])
    } finally {
      await file.close()
    }
  })

  it('is accepted by Exchange', async () => {
    const quota = await getExportQuota(univerServerCredentials({}))
    expect(quota.licenseStatus).toBe('valid')
  })
})
