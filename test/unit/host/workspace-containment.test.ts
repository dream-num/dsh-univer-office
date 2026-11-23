import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { workspacePath } from '../../../src/host/service/identifiers.ts'
import { canReadPath, canWritePath } from '../../../src/host/service/workspace.ts'

let directory: string
let root: string

beforeAll(async () => {
  directory = await realpath(await mkdtemp(join(tmpdir(), 'univer-containment-')))
  root = join(directory, 'Granted Directory')
  await mkdir(root)
  await writeFile(join(root, 'existing.svg'), '<svg/>')
})

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

it('recognizes an aliased root by identity for existing and future paths (#146)', async () => {
  const alias = join(directory, 'alias')
  await symlink(root, alias, process.platform === 'win32' ? 'junction' : 'dir')
  const scope = workspacePath(alias)
  expect(canReadPath(scope, root)).toBe(true)
  expect(canReadPath(scope, join(root, 'existing.svg'))).toBe(true)
  expect(canWritePath(scope, join(root, 'future', 'nested', 'output.xlsx'))).toBe(true)

  const sibling = join(directory, 'Granted Directory Backup')
  await mkdir(sibling)
  expect(canWritePath(scope, join(sibling, 'output.xlsx'))).toBe(false)
})

it.runIf(process.platform === 'win32')(
  'recognizes a Windows 8.3 directory name (#146)',
  ({ skip }) => {
    const short = execFileSync(
      'cmd.exe',
      ['/d', '/c', 'for', '%I', 'in', '(.)', 'do', '@echo', '%~fsI'],
      {
        cwd: root,
        encoding: 'utf8'
      }
    ).trim()
    if (basename(short).toLowerCase() === basename(root).toLowerCase()) {
      skip('The test volume did not assign an 8.3 alias')
    }
    expect(canWritePath(workspacePath(root), join(short, 'future', 'output.xlsx'))).toBe(true)
  }
)
