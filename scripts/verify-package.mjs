import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, symlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
await mkdir(resolve(root, 'artifacts'), { recursive: true })
const scratch = await mkdtemp(resolve(root, 'artifacts/package-'))
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' })
  if (result.error) throw result.error
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}
assert(process.env.npm_execpath, 'Run with npm run check:package')
const output = JSON.parse(run(process.execPath, [process.env.npm_execpath, 'pack', '--ignore-scripts', '--json', '--pack-destination', scratch]))
// npm 12 changed pack --json from an array to an object keyed by package name.
const packed = Array.isArray(output) ? output[0] : output[pkg.name]
const paths = packed.files.map(file => file.path).sort()
assert.deepEqual(paths, ['LICENSE', 'README.md', 'README.en.md', 'README.zh.md', 'cordis.patch.yml', 'docs/COMPATIBILITY.md', 'docs/REGRESSION.md',
  'package.json', 'src/client.js', 'src/index.js', 'src/tavily.js'].sort())
const tarball = resolve(scratch, packed.filename)
run('tar', ['-xzf', tarball, '-C', scratch])
await symlink(resolve(root, 'node_modules'), resolve(scratch, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
const extracted = resolve(scratch, 'package')
const installed = JSON.parse(await readFile(resolve(extracted, 'package.json'), 'utf8'))
assert.equal(installed.version, pkg.version)
const host = await import(pathToFileURL(resolve(extracted, installed.exports['.'])).href)
assert.equal(host.TAVILY_PROVIDER_ID, 'tavily')
let client
globalThis.window = { __ModuleLoader__: { load(value) { client = value } } }
await import(pathToFileURL(resolve(extracted, installed.exports['./client'])).href)
assert.equal(client.id, pkg.name)
assert.equal(typeof client.factory(() => ({})).apply, 'function')
console.log(JSON.stringify({ tarball, version: pkg.version, integrity: packed.integrity, files: paths.length }))
