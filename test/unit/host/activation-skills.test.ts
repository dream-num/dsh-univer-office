import { readdir } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { DEFAULT_ACTIVATION_SKILLS } from '../../../src/host/config.ts'
import { repoPath } from '../../support/paths.ts'

it('activates exactly the bundled Univer skills', async () => {
  const bundled = (await readdir(repoPath('skills'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  expect([...DEFAULT_ACTIVATION_SKILLS].sort()).toEqual(bundled.sort())
})
