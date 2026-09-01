// Product telemetry smoke: the real uninstall entry CLI and the real host
// telemetry pass against a local proxy double, with temporary DSH_HOME state
// and a dynamic port. Asserts final state-file content, wire payload shape,
// once-only semantics, and that telemetry can never fail uninstall or startup.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as UniverPlugin from '../lib/index.js'

const {
  captureTelemetry,
  parseTelemetryState,
  resolveConfig,
  resolveTelemetryStatePath,
  runHostTelemetry
} = UniverPlugin

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
if (manifest.files.includes('scripts/telemetry-entry.mjs') !== true) {
  throw new Error('published package must ship scripts/telemetry-entry.mjs')
}
if (Object.hasOwn(manifest.scripts, 'postinstall')) {
  throw new Error('published package must not declare a postinstall script')
}
if (manifest.scripts.uninstall !== 'node scripts/telemetry-entry.mjs uninstall') {
  throw new Error('uninstall must launch only the package-owned telemetry entry')
}
if (resolveConfig().telemetry !== true || resolveConfig({ telemetry: false }).telemetry !== false) {
  throw new Error('telemetry config default must be true and accept an explicit false')
}

const buildInfo = JSON.parse(
  await readFile(new URL('../lib/build-info.json', import.meta.url), 'utf8')
)
// Every build hardcodes the live proxy address; anything else in build-info
// means the constant drifted without review and releases would ship silent.
if (buildInfo.telemetryEndpoint !== 'https://univer.ai/api/telemetry/cli') {
  throw new Error(`unexpected pinned telemetry endpoint: ${buildInfo.telemetryEndpoint}`)
}
if (buildInfo.version !== manifest.version) {
  throw new Error(`build-info version must track package.json: ${buildInfo.version}`)
}
if (!existsSync(new URL('../lib/telemetry-entry.js', import.meta.url))) {
  throw new Error('build must emit lib/telemetry-entry.js for the uninstall hook')
}

const requests = []
const server = createServer((request, response) => {
  const chunks = []
  request.on('data', (chunk) => chunks.push(chunk))
  request.on('end', () => {
    requests.push({ body: JSON.parse(Buffer.concat(chunks).toString('utf8')), url: request.url })
    response.writeHead(204, { 'cache-control': 'no-store' })
    response.end()
  })
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const endpoint = `http://127.0.0.1:${server.address().port}/api/telemetry/cli`

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const EXPECTED_PROPERTIES = [
  'arch',
  'build_commit',
  'event_source',
  'node_major_version',
  'package_name',
  'package_version',
  'platform',
  'telemetry_state_version'
]
const now = new Date()
const today = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`

const home = await mkdtemp(join(tmpdir(), 'dsh-univer-telemetry-smoke-'))
// Asynchronous spawn: the proxy double lives in this process, so a synchronous
// wait would block the event loop and starve the child's fetch.
const entryPath = new URL('../lib/telemetry-entry.js', import.meta.url).pathname
const runProcess = (file, args, env) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [file, ...args], { env, stdio: 'ignore' })
    child.on('close', (code) => resolve({ status: code }))
  })
try {
  const entryEnvironment = { ...process.env, DSH_HOME: home, UNIVER_TELEMETRY_ENDPOINT: endpoint }

  // The uninstall hook is deliberately never deduplicated.
  const statePath = resolveTelemetryStatePath({ env: entryEnvironment })
  await runProcess(entryPath, ['capture', 'dsh_plugin_uninstall_hook'], entryEnvironment)
  await runProcess(entryPath, ['capture', 'dsh_plugin_uninstall_hook'], entryEnvironment)
  if (requests.length !== 2)
    throw new Error(`uninstall hook must not deduplicate: ${requests.length}`)
  if (requests[1].body.event !== 'dsh_plugin_uninstall_hook')
    throw new Error('uninstall entry sent the wrong event')
  if (requests[1].body.properties.event_source !== 'uninstall-hook')
    throw new Error('wrong event source')
  assertPayloadShape(requests[0].body)
  parseTelemetryState(await readFile(statePath, 'utf8'))

  // DO_NOT_TRACK suppresses everything, including state creation.
  const trackedHome = `${home}-dnt`
  await runProcess(entryPath, ['capture', 'dsh_plugin_uninstall_hook'], {
    ...entryEnvironment,
    DSH_HOME: trackedHome,
    DO_NOT_TRACK: '1'
  })
  if (requests.length !== 2) throw new Error('DO_NOT_TRACK must suppress sends')
  if (existsSync(resolveTelemetryStatePath({ env: { DSH_HOME: trackedHome } }))) {
    throw new Error('DO_NOT_TRACK must not create telemetry state')
  }

  // An explicitly empty endpoint override stays fully inert even when the
  // build pins the live proxy (incident kill-switch and CI test isolation).
  const inertHome = `${home}-inert`
  await runProcess(entryPath, ['capture', 'dsh_plugin_uninstall_hook'], {
    ...process.env,
    DSH_HOME: inertHome,
    UNIVER_TELEMETRY_ENDPOINT: ''
  })
  if (requests.length !== 2) throw new Error('empty endpoint override must suppress sends')
  if (existsSync(resolveTelemetryStatePath({ env: { DSH_HOME: inertHome } }))) {
    throw new Error('empty endpoint override must not create telemetry state')
  }

  // A disabled state file gates hook sends; host activation clears the flag.
  const disabledHome = `${home}-disabled`
  const disabledPath = resolveTelemetryStatePath({ env: { DSH_HOME: disabledHome } })
  await mkdir(join(disabledPath, '..'), { recursive: true })
  await writeFile(
    disabledPath,
    `${JSON.stringify({ anonymousInstallId: crypto.randomUUID(), disabled: true, version: 1 }, null, 2)}\n`
  )
  await runProcess(entryPath, ['capture', 'dsh_plugin_uninstall_hook'], {
    ...entryEnvironment,
    DSH_HOME: disabledHome
  })
  if (requests.length !== 2) throw new Error('disabled state must suppress hook sends')

  const reEnabled = []
  await runHostTelemetry({
    buildInfo: { telemetryEndpoint: endpoint, commit: 'c0ffee', version: '9.9.9' },
    env: { ...process.env, DSH_HOME: disabledHome },
    statePath: disabledPath,
    transport: async ({ body }) => reEnabled.push(body),
    telemetryEnabled: true
  })
  if (reEnabled.length !== 2)
    throw new Error(`activation must clear disabled and send twice: ${reEnabled.length}`)
  const cleared = parseTelemetryState(await readFile(disabledPath, 'utf8'))
  if (cleared.disabled === true) throw new Error('host activation must clear the disabled flag')

  // Host activation reports activated once and daily active once per day.
  const hostHome = `${home}-host`
  const hostStatePath = resolveTelemetryStatePath({ env: { DSH_HOME: hostHome } })
  const sent = []
  const transport = async ({ body }) => sent.push(body)
  const hostBase = {
    buildInfo: { telemetryEndpoint: endpoint, commit: 'c0ffee', version: '9.9.9' },
    env: { ...process.env, DSH_HOME: hostHome },
    statePath: hostStatePath,
    transport
  }
  await runHostTelemetry({ ...hostBase, telemetryEnabled: true })
  if (sent.map((body) => body.event).join(',') !== 'dsh_plugin_activated,dsh_plugin_daily_active') {
    throw new Error(
      `first activation must send activated then daily active: ${sent.map((body) => body.event).join(',')}`
    )
  }
  assertPayloadShape(sent[0])
  const hostState = parseTelemetryState(await readFile(hostStatePath, 'utf8'))
  if (hostState.activatedAttemptedAt === undefined) throw new Error('state must record activation')
  if (hostState.dailyActiveSentDate !== today)
    throw new Error(`state must record today: ${hostState.dailyActiveSentDate}`)
  await runHostTelemetry({ ...hostBase, telemetryEnabled: true })
  if (sent.length !== 2) throw new Error(`same-day restart must not resend: ${sent.length}`)

  // Disabling via config writes the flag before any hook can fire and sends nothing.
  const offHome = `${home}-off`
  await runHostTelemetry({
    buildInfo: { telemetryEndpoint: endpoint, version: '9.9.9' },
    env: { ...process.env, DSH_HOME: offHome },
    statePath: resolveTelemetryStatePath({ env: { DSH_HOME: offHome } }),
    transport,
    telemetryEnabled: false
  })
  if (sent.length !== 2) throw new Error('disabled telemetry must not send')
  const offState = parseTelemetryState(
    await readFile(resolveTelemetryStatePath({ env: { DSH_HOME: offHome } }), 'utf8')
  )
  if (offState.disabled !== true) throw new Error('disabled config must persist the disabled flag')

  // A failed state write must fail closed: no persisted mark, no send.
  const blockedSent = []
  const blocked = await captureTelemetry({
    buildInfo: { telemetryEndpoint: endpoint, commit: 'c0ffee', version: '9.9.9' },
    endpoint,
    event: 'dsh_plugin_activated',
    source: 'host-activate',
    stateIo: {
      mkdir: async () => {
        throw new Error('state directory denied')
      }
    },
    statePath: resolveTelemetryStatePath({ env: { DSH_HOME: `${home}-blocked` } }),
    transport: async ({ body }) => blockedSent.push(body)
  })
  if (blocked.status !== 'skipped' || blocked.reason !== 'state-unavailable') {
    throw new Error(
      `failed state write must skip with state-unavailable: ${JSON.stringify(blocked)}`
    )
  }
  if (blockedSent.length !== 0) throw new Error('failed state write must not send')

  // Concurrent first starts race the state read; the documented outcome is a
  // possible double send with a parseable final state (never corruption).
  const raceHome = `${home}-race`
  const raceStatePath = resolveTelemetryStatePath({ env: { DSH_HOME: raceHome } })
  const raceSent = []
  const slowRead = async (file, options) => {
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 50))
    return readFile(file, options)
  }
  const raceBase = {
    buildInfo: { telemetryEndpoint: endpoint, commit: 'c0ffee', version: '9.9.9' },
    env: { ...process.env, DSH_HOME: raceHome },
    stateIo: { readFile: slowRead },
    statePath: raceStatePath,
    transport: async ({ body }) => raceSent.push(body.event)
  }
  await Promise.all([
    runHostTelemetry({ ...raceBase, telemetryEnabled: true }),
    runHostTelemetry({ ...raceBase, telemetryEnabled: true })
  ])
  if (raceSent.length < 2)
    throw new Error(`concurrent starts must send at least the two events: ${raceSent.length}`)
  parseTelemetryState(await readFile(raceStatePath, 'utf8'))

  // The package.json uninstall script exits immediately and delivers detached.
  const shimHome = `${home}-shim`
  const shimRequests = requests.length
  const shim = await runProcess(
    new URL('../scripts/telemetry-entry.mjs', import.meta.url).pathname,
    ['uninstall'],
    {
      ...entryEnvironment,
      DSH_HOME: shimHome
    }
  )
  if (shim.status !== 0) throw new Error('lifecycle script must always exit 0')
  await waitFor(() => requests.length > shimRequests, 'detached uninstall child never delivered')
  if (requests[requests.length - 1].body.event !== 'dsh_plugin_uninstall_hook')
    throw new Error('shim sent the wrong event')

  console.log('telemetry smoke passed')
} finally {
  server.close()
  await rm(home, { force: true, recursive: true })
}

function assertPayloadShape(body) {
  if (UUID_PATTERN.test(body.distinctId) !== true)
    throw new Error(`distinct id must be a UUID: ${body.distinctId}`)
  const keys = Object.keys(body.properties).toSorted()
  if (keys.join(',') !== EXPECTED_PROPERTIES.join(','))
    throw new Error(`unexpected payload keys: ${keys.join(',')}`)
  if (body.properties.package_name !== 'dsh-univer-office') throw new Error('wrong package name')
  if (
    body.properties.package_version !== '9.9.9' &&
    body.properties.package_version !== manifest.version
  ) {
    throw new Error(`wrong package version: ${body.properties.package_version}`)
  }
  if (body.properties.telemetry_state_version !== 1) throw new Error('wrong state version')
}

async function waitFor(predicate, message) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(message)
}
