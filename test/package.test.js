import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('package metadata targets DSH 0.1.5 and the new npm name', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))

  assert.equal(pkg.name, 'dsh-tavily-provider')
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/u)
  assert.equal(pkg.main, './src/index.js')
  assert.equal(pkg.exports['.'], './src/index.js')
  assert.equal(pkg.exports['./client'], './src/client.js')
  assert(pkg.files.includes('src'))
  assert(!pkg.files.includes('lib'))
  assert(pkg.files.includes('README.zh.md'))

  const clientInject = pkg.dsh.client.inject
  assert(clientInject.includes('@deepseek-ai/dsh-client-connection'))
  assert(clientInject.includes('@deepseek-ai/dsh-api-remotes'))
  assert(clientInject.includes('@deepseek-ai/dsh-client-ui-settings-plugins'))
  assert(!clientInject.includes('@deepseek-ai/dsh-client-runtime'))
  assert(!clientInject.includes('@deepseek-ai/dsh-client-ui-slots'))

  for (const [name, version] of Object.entries(pkg.peerDependencies)) {
    if (name === '@deepseek-ai/cordis') assert.equal(version, '^4.0.2')
    else assert.equal(version, '0.1.5-rc.2', name)
  }
})

test('bundle patch selects Tavily without replacing the official provider package', async () => {
  const patch = await readFile(new URL('cordis.patch.yml', root), 'utf8')

  assert.match(patch, /searchProvider:\s+tavily/u)
  assert.match(patch, /id:\s+web-search-tavily/u)
  assert.match(patch, /name:\s+dsh-tavily-provider/u)
  assert.doesNotMatch(patch, /name:\s+dsh-tavily(?:\s|$)/u)
})
