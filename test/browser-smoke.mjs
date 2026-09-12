// Real DSH composition, isolated home, synthetic credentials; real search lives in test:live.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const dsh = process.env.DSH_BIN || resolve(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js')
const scratch = await mkdtemp(resolve(tmpdir(), 'dsh-tavily-browser-'))
const env = { ...process.env, DSH_HOME: resolve(scratch, 'home'), DEEPSEEK_API_KEY: '' }
delete env.TAVILY_API_KEY
delete env.TAVILY_SEARCH_ENABLED
await mkdir(env.DSH_HOME)
const redact = text => text.replace(/token=[^\s]+/gu, 'token=[REDACTED]').replace(/tvly-[A-Za-z0-9_-]+/gu, '[REDACTED]')
const run = args => new Promise((done, fail) => {
  const child = spawn(process.execPath, [dsh, ...args], { env, cwd: scratch, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', data => { output += data })
  child.stderr.on('data', data => { output += data })
  child.once('error', fail)
  child.once('exit', code => code === 0 ? done() : fail(new Error(redact(output))))
})
const spec = process.env.PLUGIN_TARBALL || `dsh-tavily-provider@file:${root}`
await run(['plugin', '--profile', 'web', 'add', spec, '--ignore-scripts', '--store-dir', resolve(scratch, 'pnpm-store')])
console.log('Isolated DSH profile installed')
const server = spawn(process.execPath, [dsh, 'web', '--host', '127.0.0.1', '--port', '0', '--no-open'], { env, cwd: scratch })
let browser, page
try {
  const url = await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error('DSH Web did not start')), 30_000)
    let output = ''
    server.stdout.on('data', data => {
      output += data
      const match = output.match(/dsh web: (http[^\s]+)/u)
      if (match) { clearTimeout(timer); done(match[1]) }
    })
    server.stderr.on('data', data => { output += data })
    server.once('error', fail)
    server.once('exit', code => { clearTimeout(timer); fail(new Error(`DSH exited ${code}: ${redact(output)}`)) })
  })
  const base = new URL(url).origin
  const denied = await fetch(`${base}/api/tavily-probe`, { method: 'POST', body: '{}' })
  assert.equal(denied.status, 401, 'official DSH composition requires browser authentication')
  await denied.text()
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE,
    args: process.env.CHROMIUM_ARGS ? JSON.parse(process.env.CHROMIUM_ARGS) : ['--no-sandbox'] })
  page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'en-US' })
  page.setDefaultTimeout(15_000)
  const errors = []
  page.on('pageerror', error => errors.push(redact(error.message)))
  await page.goto(url)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Configure later', exact: true }).click()
  await page.locator('[data-slot="sidebar.settings"] button[aria-haspopup="dialog"]').click()
  await page.getByRole('button', { name: 'Plugins', exact: true }).click()
  await page.getByRole('tab', { name: 'Plugin configuration', exact: true }).click()
  const card = page.locator('.dshTavilyCard')
  await card.locator('.dshTavilyHead').click()
  // Password inputs have no implicit textbox role.
  const password = card.locator('input[type="password"]')
  await password.waitFor()
  await page.waitForFunction(() => !document.querySelector('.dshTavilyCard input[type="password"]').disabled)
  await password.fill('tvly-browser-fixture')
  await card.getByRole('combobox').selectOption('fast')
  await card.getByRole('switch').check()
  await card.getByRole('button', { name: 'Save', exact: true }).click()
  await card.getByText('Unsaved', { exact: true }).waitFor({ state: 'hidden' })
  assert.equal(await password.inputValue(), '')
  assert.equal(await card.getByRole('combobox').inputValue(), 'fast')
  assert.equal(await card.getByRole('switch').isChecked(), true)
  assert.equal(await card.getByRole('alert').count(), 0)
  const settings = await readFile(resolve(env.DSH_HOME, 'settings.yaml'), 'utf8')
  const credentials = await readFile(resolve(env.DSH_HOME, '.credentials.yaml'), 'utf8')
  assert(!settings.includes('tvly-browser-fixture'), 'key never enters the settings document')
  assert(credentials.includes('tvly-browser-fixture'), 'key saved through the real credential remote')
  assert(settings.includes('fast'), 'search depth saved through the real settings remote')
  const invalid = await page.evaluate(async () => {
    const response = await fetch('/api/tavily-probe', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ apiKey: 'invalid\u0000key' }) })
    return { status: response.status, body: await response.json() }
  })
  assert.equal(invalid.status, 200)
  assert.equal(invalid.body.code, 'invalid_key', 'real route rejects unsafe headers before contacting Tavily')
  await page.route('**/api/tavily-probe', route => route.fulfill({ json: { ok: true, mode: 'key' } }))
  await card.getByRole('button', { name: 'Test connection', exact: true }).click()
  await card.getByText('Connected', { exact: true }).waitFor()
  await card.getByRole('switch').uncheck()
  await card.getByRole('button', { name: 'Clear key', exact: true }).click()
  await card.getByRole('button', { name: 'Save', exact: true }).click()
  await card.getByText('Unsaved', { exact: true }).waitFor({ state: 'hidden' })
  const cleared = await readFile(resolve(env.DSH_HOME, '.credentials.yaml'), 'utf8')
  assert(!cleared.includes('tvly-browser-fixture'))
  assert(!cleared.includes('TAVILY_SEARCH_ENABLED'))
  assert.deepEqual(errors, [])
  console.log('Real DSH browser: authentication, card registration, credential/depth save, probe validation and clearing passed')
} catch (error) {
  if (page) console.error(redact((await page.locator('body').innerText()).slice(0, 5000)))
  throw error
} finally {
  if (browser) await browser.close()
  server.kill('SIGTERM')
}
