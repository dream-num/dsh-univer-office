#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { cp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(import.meta.url)
const root = resolve(dirname(script), '..')
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const version = packageJson.version
const archiveName = `${packageJson.name}-${version}.tar.zst`
const archive = join(root, 'dist', archiveName)
const tarball = join(root, 'dist', `${packageJson.name}-${version}.tar`)
const manifestPath = join(root, 'dist', 'plugin-manifest.json')
const archiveRoot = join(root, 'dist', 'harnone-plugin')

if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`package.json version is not a supported semantic version: ${version}`)
}

run('bash', ['scripts/build-dist.sh'])
await rm(tarball, { force: true })
await rm(archive, { force: true })
await rm(manifestPath, { force: true })
await rm(archiveRoot, { recursive: true, force: true })
await cp(join(root, 'dist', 'univer'), archiveRoot, { recursive: true })

// Prevent macOS AppleDouble metadata from entering the portable archive.
run('tar', ['--format=ustar', '-cf', tarball, '-C', 'dist', 'harnone-plugin'], {
  COPYFILE_DISABLE: '1'
})
run('zstd', ['--no-progress', '--force', '--ultra', '-22', '-o', archive, tarball])
await rm(tarball, { force: true })
await rm(archiveRoot, { recursive: true, force: true })

const artifact = await readFile(archive)
const manifest = {
  pluginId: packageJson.name,
  version,
  pluginTypes: ['host', 'client'],
  summary: 'Univer Office brings Sheets, Docs, Slides, Bases, and Boards to DeepSeek Harness.',
  description: packageJson.description,
  harness: { minVersion: '0.1.1-rc.2', maxVersion: '0.2.0' },
  runtimeApi: 1,
  platforms: ['darwin-aarch64'],
  permissions: {
    filesystem: ['workspace', 'dsh-home'],
    network: ['127.0.0.1', 'univer.ai'],
    process: ['node', 'chromium']
  },
  artifact: {
    sha256: createHash('sha256').update(artifact).digest('hex'),
    size: artifact.length
  }
}

const signingKeyId = requiredEnvironment('DSH_PLUGIN_SIGNING_KEY_ID')
const privateKey = privateKeyFromEnvironment()
const signature = sign(null, signingBytes(manifest), privateKey).toString('base64')
const signedManifest = { ...manifest, signature: { keyId: signingKeyId, value: signature } }

if (!verify(null, signingBytes(signedManifest), createPublicKey(privateKey), Buffer.from(signature, 'base64'))) {
  throw new Error('manifest signature self-verification failed')
}

await writeFile(manifestPath, `${JSON.stringify(signedManifest, null, 2)}\n`)
console.log(`Marketplace archive: ${archive}`)
console.log(`Marketplace manifest: ${manifestPath}`)

function run(command, args, extraEnvironment = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnvironment },
    stdio: 'inherit'
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required to sign a marketplace release`)
  return value
}

function privateKeyFromEnvironment() {
  const encoded = requiredEnvironment('DSH_PLUGIN_SIGNING_PRIVATE_KEY_BASE64')
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.toString('base64') !== encoded) {
    throw new Error('DSH_PLUGIN_SIGNING_PRIVATE_KEY_BASE64 must use standard Base64 encoding')
  }
  if (bytes.length === 32) {
    const prefix = Buffer.from('302e020100300506032b657004220420', 'hex')
    return createPrivateKey({ key: Buffer.concat([prefix, bytes]), format: 'der', type: 'pkcs8' })
  }
  if (bytes.length === 48) return createPrivateKey({ key: bytes, format: 'der', type: 'pkcs8' })
  throw new Error('DSH_PLUGIN_SIGNING_PRIVATE_KEY_BASE64 must decode to a 32-byte Ed25519 seed or 48-byte PKCS#8 key')
}

function signingBytes(value) {
  const payload = {
    pluginId: value.pluginId,
    version: value.version,
    pluginTypes: value.pluginTypes,
    summary: value.summary,
    description: value.description,
    harness: value.harness,
    runtimeApi: value.runtimeApi,
    platforms: value.platforms,
    permissions: value.permissions,
    artifact: value.artifact
  }
  return Buffer.concat([Buffer.from('DSH-PLUGIN-MANIFEST-V1\0'), Buffer.from(JSON.stringify(payload))])
}
