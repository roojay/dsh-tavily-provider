import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { TavilySearchProvider, TAVILY_ENABLED_REF } from '../src/index.js'

// Opt-in network test. Never print keys or entire upstream errors.
const key = process.env.TAVILY_API_KEY
const modes = key ? ['keyless', 'key'] : ['keyless']
for (const mode of modes) {
  const ctx = { get(name) {
    if (name !== 'credentials') return undefined
    return { async resolve(ref) {
      if (ref === TAVILY_ENABLED_REF) return { value: 'true' }
      return mode === 'key' ? { value: key } : undefined
    } }
  } }
  const provider = new TavilySearchProvider(() => ({ ctx, apiKeyEnv: 'TAVILY_API_KEY',
    baseURL: 'https://api.tavily.com', maxResults: 3, searchDepth: 'basic',
    searchTimeoutMs: 20000, maxRetries: 0 }), { search() { throw new Error('Unexpected fallback') } })
  const start = performance.now()
  try {
    const result = await provider.search({ query: 'Tavily Search API official documentation', maxResults: 3 })
    assert(result.sources.length > 0)
    assert(result.sources.length <= 3)
    assert(result.sources.every(source => /^https?:\/\//u.test(source.url)))
    console.log(JSON.stringify({ mode, ok: true, elapsedMs: Math.round(performance.now() - start),
      sourceCount: result.sources.length, sources: result.sources.map(source => source.url) }))
  } catch (error) {
    console.error(JSON.stringify({ mode, ok: false, code: error.code ?? 'UNKNOWN', status: error.status }))
    process.exitCode = 1
  }
}
