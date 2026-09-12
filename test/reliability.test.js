import assert from 'node:assert/strict'
import test from 'node:test'
import { __test, apply, TavilySearchProvider, TAVILY_ENABLED_REF } from '../src/index.js'
import { createLimiter, deadline, normalizeKey, readBoundedBody } from '../src/tavily.js'

const options = { baseURL: 'https://api.tavily.com', maxResults: 5, searchTimeoutMs: 1000, maxRetries: 0 }
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers })
const tick = () => new Promise(resolve => setImmediate(resolve))

test('response validation, URL deduplication and result caps respect the provider contract', () => {
  assert.throws(() => __test.projectResult({ error: 'not a result' }), { code: 'TAVILY_INVALID_RESPONSE' })
  assert.deepEqual(__test.projectResult({ results: [] }), { sources: [], truncated: false })
  const result = __test.projectResult({ results: [
    { url: 'javascript:alert(1)' }, { url: '   ' }, { url: 'https://user:pass@example.test' },
    { url: 'https://example.test/page?utm_source=x#first' }, { url: 'https://example.test/page#second' },
    { url: 'https://example.test/page?id=2' }, { url: 'https://example.test/third' }
  ] }, 2)
  assert.equal(result.sources.length, 2)
  assert.equal(result.sources[1].url, 'https://example.test/page?id=2')
  assert.equal(result.truncated, true)
})

test('invalid keys and upstream errors cannot expose credentials', async (t) => {
  assert.throws(() => normalizeKey('synthetic-secret\ninvalid'), error => !JSON.stringify(error).includes('synthetic-secret'))
  assert.throws(() => normalizeKey('invalid-密钥'), { code: 'TAVILY_INVALID_KEY' })
  t.mock.method(globalThis, 'fetch', async () => json({ detail: { error: 'invalid synthetic-secret' },
    error: { code: 'synthetic-secret' }, request_id: 'synthetic-secret' }, 401))
  await assert.rejects(__test.searchTavily('query', { ...options, apiKey: 'synthetic-secret' }), error => {
    assert.equal(error.status, 401)
    assert.equal(error.code, 'TAVILY_INVALID_KEY')
    assert(!error.message.includes('synthetic-secret'))
    assert(!JSON.stringify(error).includes('synthetic-secret'))
    assert.equal(error.cause, undefined)
    return true
  })
})

test('credential resolution honors cancellation and the total timeout', async () => {
  const ctx = { get() { return { resolve() { return new Promise(() => {}) } } } }
  const provider = new TavilySearchProvider(() => ({ ...options, ctx }), {})
  const cancel = new AbortController()
  const search = provider.search({ query: 'query' }, cancel.signal)
  cancel.abort(new Error('private cancellation detail'))
  await assert.rejects(search, { code: 'WEB_ABORTED' })
  const keepAlive = setTimeout(() => {}, 100)
  try {
    const timed = new TavilySearchProvider(() => ({ ...options, ctx, searchTimeoutMs: 10 }), {})
    await assert.rejects(timed.search({ query: 'query' }), { code: 'WEB_PROVIDER_TIMEOUT' })
  } finally { clearTimeout(keepAlive) }
})

test('timeout while reading the body stays a timeout and cancels the stream', async () => {
  let canceled = false
  const body = new ReadableStream({ cancel() { canceled = true } })
  const keepAlive = setTimeout(() => {}, 100)
  try { await assert.rejects(readBoundedBody(body, 4096, deadline(undefined, 10)), { code: 'WEB_PROVIDER_TIMEOUT' }) }
  finally { clearTimeout(keepAlive) }
  assert(canceled)
})

test('streaming probe rejects oversize input without reading the whole stream', async () => {
  let pulls = 0, canceled = false
  const request = new Request('https://dsh.test/api/tavily-probe', { method: 'POST', duplex: 'half',
    body: new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(4097)) }, cancel() { canceled = true } }) })
  await assert.rejects(__test.readProbeBody(request), { code: 'TAVILY_BODY_TOO_LARGE' })
  assert(pulls <= 2)
  assert(canceled)
})

test('probe cancellation prevents any upstream request', async (t) => {
  let route
  const ctx = { inject(names, callback) { if (names[0] === 'connection') callback(ctx) },
    web: { registerSearchProvider() {} }, connection: { fetch: { register(value) { route = value } } }, get() {} }
  apply(ctx, options)
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('must not call') })
  const cancel = new AbortController(); cancel.abort()
  const result = await route.fetch(new Request('https://dsh.test/api/tavily-probe', { method: 'POST', body: '{}', signal: cancel.signal }))
  assert.equal((await result.json()).code, 'aborted')
  assert.equal(fetch.mock.callCount(), 0)
})

test('short rate limits retry once; daily quota and long cooldown do not retry', async (t) => {
  let calls = 0
  const fetch = t.mock.method(globalThis, 'fetch', async () => ++calls === 1
    ? json({ error: 'slow down' }, 429, { 'retry-after': '0' }) : json({ results: [] }))
  await __test.searchTavily('query', { ...options, maxRetries: 1 })
  assert.equal(calls, 2)
  for (const [status, code, delay, expected] of [[429, 'keyless_daily_limit', 3600, 'quota'], [429, 'rate_limit', 60, 'rate_limited'], [432, '', 0, 'quota']]) {
    calls = 0
    fetch.mock.mockImplementation(async () => { calls++; return json({ error: { code, retry_after_seconds: delay } }, status) })
    await assert.rejects(__test.searchTavily('query', { ...options, maxRetries: 2 }), error => {
      assert.equal(__test.classifyProbeError(error).code, expected); return true
    })
    assert.equal(calls, 1)
  }
})

test('search caps upstream count and respects selected depth without retrying ambiguous network failures', async (t) => {
  let payload
  const fetch = t.mock.method(globalThis, 'fetch', async (_url, init) => { payload = JSON.parse(init.body); return json({ results: [] }) })
  await __test.searchTavily('query', { ...options, maxResults: 100, searchDepth: 'fast' })
  assert.equal(payload.max_results, 20)
  assert.equal(payload.search_depth, 'fast')
  fetch.mock.mockImplementation(async () => { throw new Error('Authorization: Bearer synthetic-secret') })
  await assert.rejects(__test.searchTavily('query', { ...options, maxRetries: 2 }), error => error.code === 'TAVILY_NETWORK_ERROR' && !error.message.includes('synthetic-secret'))
  assert.equal(fetch.mock.callCount(), 2)
})

test('limiter bounds active and queued searches and releases canceled waiters', async () => {
  const run = createLimiter(1, 1)
  let release
  const first = run(() => new Promise(resolve => { release = resolve }))
  const controller = new AbortController()
  const second = run(() => { throw new Error('canceled waiter ran') }, controller.signal)
  await assert.rejects(run(async () => {}), { code: 'TAVILY_BUSY' })
  controller.abort()
  await assert.rejects(second, { code: 'WEB_ABORTED' })
  release(); await first
  assert.equal(await run(async () => 42), 42)
})

test('DeepSeek fallback inherits live official search settings', async (t) => {
  const config = { baseURL: 'https://search-proxy.test/anthropic', apiKeyEnv: 'CUSTOM_DEEPSEEK_KEY', model: 'custom-model', maxUses: 2 }
  const refs = []
  const ctx = { get(name) {
    if (name === 'settings') return { get() { return config } }
    if (name === 'credentials') return { async resolve(ref) { refs.push(ref); return { value: 'synthetic-key' } } }
  } }
  let request
  t.mock.method(globalThis, 'fetch', async (url, init) => { request = { url, body: JSON.parse(init.body) }; return json({ content: [{ type: 'web_search_tool_result', content: [] }] }) })
  await __test.deepSeekFallback(ctx).search({ query: 'query' })
  assert.equal(refs[0], 'CUSTOM_DEEPSEEK_KEY')
  assert.equal(request.url, 'https://search-proxy.test/anthropic/messages')
  assert.equal(request.body.model, 'custom-model')
})

let client
async function controllerClass() {
  if (client) return client
  const previous = globalThis.window
  let bundle
  globalThis.window = { __ModuleLoader__: { load(value) { bundle = value } } }
  try { await import('../src/client.js?reliability'); client = bundle.factory(() => ({})).__test.TavilyCardController }
  finally { globalThis.window = previous }
  return client
}

function remoteFixture(ref = 'TAVILY_API_KEY') {
  const values = new Map(), writes = []
  const section = { ns: 'web-search-tavily', value: { apiKeyEnv: ref }, revision: 0, secrets: [] }
  const remote = {
    settings: { async describe() { return { ok: true, value: { namespaces: [section] } } },
      async update(_ns, patch, revision) { assert.equal(revision, section.revision); Object.assign(section.value, patch); section.revision++; return { ok: true } } },
    credentials: { async describe(refs) { return { ok: true, value: Object.fromEntries(refs.map(key => [key, { configured: values.has(key), writable: true }])) } },
      async set(key, value) { writes.push(key); values.set(key, value); await remote.notify?.(); return { ok: true } },
      async unset(key) { writes.push(key); values.delete(key); await remote.notify?.(); return { ok: true } } }
  }
  return { remote, values, writes, section }
}

test('save snapshots survive credential notifications and target the configured key reference', async () => {
  const Controller = await controllerClass(), fixture = remoteFixture('CUSTOM_TAVILY_KEY')
  const controller = new Controller(fixture.remote); await tick()
  fixture.remote.notify = async () => { await controller.refresh(); await tick() }
  controller.setEnabled(true); controller.setKey('synthetic-key'); controller.setDepth('fast')
  await controller.save()
  assert.deepEqual(fixture.writes, ['CUSTOM_TAVILY_KEY', TAVILY_ENABLED_REF])
  assert.equal(fixture.values.get('CUSTOM_TAVILY_KEY'), 'synthetic-key')
  assert.equal(fixture.section.value.searchDepth, 'fast')
  assert.equal(controller.store.getSnapshot().dirty, false)
  controller.setKey('another-key'); await controller.refresh()
  assert.equal(controller.draftKey, 'another-key')
  controller.dispose()
})

test('partial save failure retains the unsaved key and never enables Tavily', async () => {
  const Controller = await controllerClass(), fixture = remoteFixture()
  fixture.remote.credentials.set = async () => ({ ok: false, error: { message: 'write refused' } })
  const controller = new Controller(fixture.remote); await tick()
  controller.setEnabled(true); controller.setKey('synthetic-key'); await controller.save()
  assert(controller.failed)
  assert.equal(controller.draftKey, 'synthetic-key')
  assert(!fixture.values.has(TAVILY_ENABLED_REF))
  controller.dispose()
})

test('literal keys are read-only and changing a reference does not silently retarget a dirty draft', async () => {
  const Controller = await controllerClass(), fixture = remoteFixture()
  fixture.section.secrets = [{ path: ['apiKey'], set: true }]
  const controller = new Controller(fixture.remote); await tick()
  assert.equal(controller.keyWritable, false)
  assert.equal(controller.keyConfigured, true)
  controller.setEnabled(true)
  fixture.section.value.apiKeyEnv = 'OTHER_KEY'; await controller.refresh()
  assert(controller.conflicted)
  await controller.save(); assert.equal(fixture.writes.length, 0)
  controller.discard(); assert.equal(controller.conflicted, false)
  controller.dispose()
})

test('editing a key cancels the pending probe and discards late success', async (t) => {
  const Controller = await controllerClass(), fixture = remoteFixture()
  const controller = new Controller(fixture.remote); await tick()
  let complete, signal
  t.mock.method(globalThis, 'fetch', (_url, init) => { signal = init.signal; return new Promise(resolve => { complete = resolve }) })
  const probe = controller.testConnection()
  controller.setKey('new-key')
  assert(signal.aborted)
  complete(json({ ok: true }))
  await probe
  assert.equal(controller.probe, null)
  assert.equal(controller.probing, false)
  controller.dispose()
})
