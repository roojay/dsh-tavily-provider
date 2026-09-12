import assert from 'node:assert/strict'
import test from 'node:test'

import {
  TavilySearchProvider,
  TAVILY_API_KEY_REF,
  TAVILY_ENABLED_REF,
  TAVILY_SETTINGS_NAMESPACE,
  __test,
  apply
} from '../src/index.js'

test('custom Tavily origins require an explicit, safe HTTPS opt-in', () => {
  assert.equal(__test.normalizeBaseURL('https://api.tavily.com/', false), 'https://api.tavily.com')
  assert.throws(() => __test.normalizeBaseURL('https://example.com', false))
  assert.throws(() => __test.normalizeBaseURL('http://example.com', true))
  assert.throws(() => __test.normalizeBaseURL('https://user@example.com', true))
  assert.throws(() => __test.normalizeBaseURL('https://example.com?q=1', true))
  assert.equal(__test.normalizeBaseURL('https://example.com/api/', true), 'https://example.com/api')
})

test('Tavily results keep only safe provider fields and cap snippets', () => {
  const result = __test.projectResult({
    results: [
      { title: 'ignored without url', content: 'x' },
      {
        url: 'https://example.com',
        title: 'Example',
        content: 'a'.repeat(900),
        published_date: '2026-09-12',
        score: 0.99
      }
    ]
  })

  assert.deepEqual(result, {
    sources: [{
      url: 'https://example.com/',
      title: 'Example',
      snippet: 'a'.repeat(900),
      publishedAt: '2026-09-12T00:00:00.000Z'
    }],
    truncated: false
  })
})

test('probe body accepts an empty object and rejects malformed or oversized input', async () => {
  assert.deepEqual(await __test.readProbeBody(new Request('https://dsh.test', {
    method: 'POST',
    body: ''
  })), {})
  await assert.rejects(__test.readProbeBody(new Request('https://dsh.test', {
    method: 'POST',
    body: '[]'
  })), /invalid JSON body/u)
  await assert.rejects(__test.readProbeBody(new Request('https://dsh.test', {
    method: 'POST',
    body: JSON.stringify({ value: 'x'.repeat(4096) })
  })), /body is too large/u)
})

test('provider falls back when disabled and calls Tavily when enabled', async (t) => {
  const fallbackCalls = []
  const fallback = {
    search(request, signal) {
      fallbackCalls.push({ request, signal })
      return { sources: [{ url: 'https://fallback.test' }], truncated: false }
    }
  }
  const credentials = new Map()
  const ctx = {
    get(name) {
      if (name !== 'credentials') return undefined
      return {
        async resolve(ref) {
          return credentials.has(ref) ? { value: credentials.get(ref) } : undefined
        }
      }
    }
  }
  const provider = new TavilySearchProvider(() => ({
    ctx,
    apiKey: '',
    apiKeyEnv: TAVILY_API_KEY_REF,
    baseURL: 'https://api.tavily.com',
    allowCustomBaseURL: false,
    maxResults: 5,
    searchTimeoutMs: 1_000
  }), fallback)

  const disabled = await provider.search({ query: 'disabled' })
  assert.equal(disabled.sources[0].url, 'https://fallback.test')
  assert.equal(fallbackCalls.length, 1)

  credentials.set(TAVILY_ENABLED_REF, 'true')
  credentials.set(TAVILY_API_KEY_REF, 'secret-value')
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let request
  globalThis.fetch = async (url, init) => {
    request = { url, init }
    return new Response(JSON.stringify({
      results: [{ url: 'https://result.test', title: 'Result', content: 'Snippet' }]
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  const enabled = await provider.search({ query: 'enabled', maxResults: 3 })
  assert.equal(enabled.sources[0].url, 'https://result.test/')
  assert.equal(request.url, 'https://api.tavily.com/search')
  assert.equal(request.init.headers.authorization, 'Bearer secret-value')
  assert.deepEqual(JSON.parse(request.init.body), {
    query: 'enabled',
    max_results: 3,
    search_depth: 'basic',
    chunks_per_source: 3,
    include_answer: false,
    include_raw_content: false,
    include_images: false
  })
})

test('apply registers the current settings section, provider and authenticated probe route', () => {
  let section
  let provider
  let route
  const ctx = {
    inject(names, callback) {
      if (names[0] === 'connection') return callback(ctx)
      assert.deepEqual(names, ['settings'])
      callback({
        settings: {
          installSection(...args) { section = args }
        }
      })
    },
    web: {
      registerSearchProvider(value) { provider = value }
    },
    connection: {
      fetch: {
        register(value) { route = value; return () => {} }
      }
    },
    get() { return undefined }
  }
  const config = {
    apiKey: '',
    apiKeyEnv: TAVILY_API_KEY_REF,
    baseURL: 'https://api.tavily.com',
    allowCustomBaseURL: false,
    maxResults: 5,
    searchTimeoutMs: 30_000
  }

  apply(ctx, config)

  assert.equal(section[0], ctx)
  assert.equal(section[1], TAVILY_SETTINGS_NAMESPACE)
  assert.equal(section[3], config)
  assert.equal(provider.id, 'tavily')
  assert.equal(route.path, '/api/tavily-probe')
  assert.deepEqual(route.methods, ['POST'])
  assert.equal(route.requestBody, 'streaming')
})
