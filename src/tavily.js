import { WebError } from '@deepseek-ai/dsh-web'

export const TAVILY_ORIGIN = 'https://api.tavily.com'
export const DEFAULT_TIMEOUT_MS = 30_000
const MAX_RESPONSE_BYTES = 1024 * 1024

export function failure(message, code = 'WEB_PROVIDER_ERROR', details = {}) {
  return Object.assign(new WebError(message, code), details)
}

export function checkSignal(signal) {
  if (!signal?.aborted) return
  throw failure(signal.reason?.name === 'TimeoutError' ? 'Tavily search timed out' : 'Tavily search aborted',
    signal.reason?.name === 'TimeoutError' ? 'WEB_PROVIDER_TIMEOUT' : 'WEB_ABORTED')
}

// Do not attach arbitrary causes: Node header errors can contain the complete key.
export function abortable(operation, signal) {
  checkSignal(signal)
  if (!signal) return Promise.resolve().then(operation)
  return new Promise((resolve, reject) => {
    const onAbort = () => { try { checkSignal(signal) } catch (error) { reject(error) } }
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve().then(() => { checkSignal(signal); return operation() }).then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort))
  })
}

export function deadline(signal, timeoutMs = DEFAULT_TIMEOUT_MS) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) {
    throw failure('Tavily timeout must be an integer between 1 and 300000 ms')
  }
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

export function normalizeBaseURL(value, allowCustom) {
  let url
  try { url = new URL(value || TAVILY_ORIGIN) } catch { throw failure('Tavily baseURL must be an absolute URL') }
  const normalized = url.href.replace(/\/+$/u, '')
  if (normalized === TAVILY_ORIGIN) return normalized
  if (!allowCustom) throw failure(`Tavily baseURL must be ${TAVILY_ORIGIN} unless allowCustomBaseURL is true`)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw failure('Tavily custom baseURL must use HTTPS without credentials, query parameters or fragments')
  }
  return normalized
}

export function normalizeKey(value) {
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string' || /[^\x20-\x7e]/u.test(value) || value.length > 512) {
    throw failure('Tavily API key contains invalid characters or exceeds 512 characters', 'TAVILY_INVALID_KEY')
  }
  return value.trim() || undefined
}

export async function readBoundedBody(body, limit, signal) {
  if (!body) return ''
  const reader = body.getReader()
  const chunks = []
  let size = 0
  let completed = false
  try {
    while (true) {
      const { done, value } = await abortable(() => reader.read(), signal)
      if (done) { completed = true; break }
      size += value.byteLength
      if (size > limit) throw failure('Tavily response body is too large', 'TAVILY_BODY_TOO_LARGE')
      chunks.push(value)
    }
    checkSignal(signal)
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } finally {
    if (!completed) void reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

function sourceURL(value) {
  if (typeof value !== 'string' || value.length > 8192) return undefined
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return undefined
    return url
  } catch { return undefined }
}

function duplicateKey(url) {
  const copy = new URL(url)
  copy.hash = ''
  for (const name of [...copy.searchParams.keys()]) {
    if (/^(?:utm_.+|gclid|fbclid|msclkid|_gl)$/iu.test(name)) copy.searchParams.delete(name)
  }
  // Preserve protocol and all functional parameters; HTTP and HTTPS need not serve the same page.
  return copy.href
}

export function projectResult(body, maxResults = 20, snippetChars = 1600) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.results)) {
    throw failure('Tavily returned an invalid search response', 'TAVILY_INVALID_RESPONSE')
  }
  const sources = []
  const seen = new Set()
  let truncated = false
  for (const row of body.results) {
    const url = sourceURL(row?.url)
    if (!url) continue
    const key = duplicateKey(url)
    if (seen.has(key)) continue
    seen.add(key)
    if (sources.length >= maxResults) { truncated = true; break }
    const source = { url: url.href }
    if (typeof row.title === 'string' && row.title.trim()) source.title = row.title.trim().slice(0, 500)
    if (typeof row.content === 'string' && row.content) {
      // Tavily currently returns up to three 500-character chunks, separated by " [...] ".
      let snippet = row.content.slice(0, snippetChars)
      if (row.content.length > snippetChars && snippet.includes(' [...] ')) snippet = snippet.slice(0, snippet.lastIndexOf(' [...] '))
      source.snippet = snippet
    }
    if (typeof row.published_date === 'string' && Number.isFinite(Date.parse(row.published_date))) {
      source.publishedAt = new Date(row.published_date).toISOString()
    }
    sources.push(source)
  }
  return { sources, truncated }
}

function retryDelay(response, body) {
  const header = response.headers.get('retry-after')
  const seconds = header === null ? NaN : Number(header)
  const date = header === null ? NaN : Date.parse(header)
  const value = body?.error?.retry_after_seconds
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1000)
    : Number.isFinite(date) ? Math.max(0, date - Date.now())
      : typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value * 1000) : undefined
}

function apiError(response, body, apiKey) {
  const status = response.status
  const safeText = (value, limit) => {
    if (typeof value !== 'string') return undefined
    if (apiKey) value = value.replaceAll(apiKey, '[REDACTED]')
    return value.replace(/Bearer\s+\S+|tvly-[A-Za-z0-9_-]+/giu, '[REDACTED]')
      .replace(/[\x00-\x1f\x7f]/gu, ' ').slice(0, limit)
  }
  const code = safeText(body?.error?.code, 100)
  const detail = safeText(body?.detail?.error ?? body?.error?.message ?? body?.message ?? body?.detail ?? body?.error, 240)
  const quota = status === 432 || status === 433 || /(?:daily|monthly|quota|usage.?limit)/iu.test(code ?? '')
  const category = status === 401 || status === 403 ? 'TAVILY_INVALID_KEY'
    : quota ? 'TAVILY_QUOTA_EXCEEDED' : status === 429 ? 'TAVILY_RATE_LIMITED' : 'WEB_PROVIDER_ERROR'
  return failure(`Tavily API error (HTTP ${status})${detail ? `: ${detail}` : ''}`, category, {
    status, apiCode: code, retryAfterMs: retryDelay(response, body),
    requestId: safeText(body?.request_id, 100)
  })
}

function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    checkSignal(signal)
    const onAbort = () => { clearTimeout(timer); try { checkSignal(signal) } catch (error) { reject(error) } }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve() }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function searchTavily(query, options, signal) {
  const requestSignal = options.deadlineApplied ? signal : deadline(signal, options.searchTimeoutMs)
  checkSignal(requestSignal)
  if (typeof query !== 'string' || !query.trim() || query.length > 1500) {
    throw failure('Tavily query must contain 1 to 1500 characters', 'TAVILY_INVALID_QUERY')
  }
  const apiKey = normalizeKey(options.apiKey)
  const baseURL = normalizeBaseURL(options.baseURL, options.allowCustomBaseURL)
  if (!Number.isSafeInteger(options.maxResults) || options.maxResults < 1) throw failure('Tavily maxResults must be a positive integer')
  const maxResults = Math.min(options.maxResults, 20)
  const searchDepth = options.searchDepth ?? 'basic'
  if (!['basic', 'fast', 'ultra-fast', 'advanced'].includes(searchDepth)) throw failure('Tavily searchDepth is invalid')
  const headers = { accept: 'application/json', 'content-type': 'application/json',
    ...(apiKey ? { authorization: `Bearer ${apiKey}` } : { 'x-tavily-access-mode': 'keyless' }) }
  const payload = { query: query.trim(), max_results: maxResults, search_depth: searchDepth,
    ...(searchDepth === 'ultra-fast' ? {} : { chunks_per_source: options.chunksPerSource ?? 3 }),
    include_answer: false, include_raw_content: false, include_images: false }
  const retries = options.maxRetries ?? 1
  for (let attempt = 0; ; attempt++) {
    checkSignal(requestSignal)
    let response, body
    try {
      response = await fetch(`${baseURL}/search`, { method: 'POST', redirect: 'error', headers,
        body: JSON.stringify(payload), signal: requestSignal })
      const text = await readBoundedBody(response.body, MAX_RESPONSE_BYTES, requestSignal)
      try { body = JSON.parse(text) } catch {
        if (response.ok) throw failure('Tavily returned invalid JSON', 'TAVILY_INVALID_RESPONSE')
      }
    } catch (error) {
      checkSignal(requestSignal)
      if (error instanceof WebError) throw error
      throw failure('Tavily network request failed', 'TAVILY_NETWORK_ERROR')
    }
    checkSignal(requestSignal)
    if (response.ok) return projectResult(body, maxResults, options.snippetChars ?? 1600)
    const error = apiError(response, body, apiKey)
    const wait = error.retryAfterMs ?? 250 + Math.floor(Math.random() * 250)
    const retryable = error.code !== 'TAVILY_QUOTA_EXCEEDED' && [429, 502, 503, 504].includes(response.status)
    if (!retryable || attempt >= retries || wait > 2000) throw error
    await pause(wait, requestSignal)
  }
}

// One instance per plugin, shared by searches and probes. Bound the waiting queue too.
export function createLimiter(maxActive = 4, maxWaiting = 32) {
  let active = 0
  const waiting = []
  const release = () => {
    active--
    const next = waiting.shift()
    if (next) { active++; next.signal?.removeEventListener('abort', next.abort); next.resolve(release) }
  }
  return async function run(operation, signal) {
    checkSignal(signal)
    let done
    if (active < maxActive) { active++; done = release } else {
      if (waiting.length >= maxWaiting) throw failure('Tavily search queue is full; try again later', 'TAVILY_BUSY')
      done = await new Promise((resolve, reject) => {
        const entry = { resolve, signal, abort: () => {
          const index = waiting.indexOf(entry)
          if (index >= 0) waiting.splice(index, 1)
          try { checkSignal(signal) } catch (error) { reject(error) }
        } }
        waiting.push(entry)
        signal?.addEventListener('abort', entry.abort, { once: true })
      })
    }
    try { checkSignal(signal); return await operation() } finally { done() }
  }
}

export function classifyProbeError(error) {
  if (error.code === 'WEB_ABORTED') return { code: 'aborted' }
  if (error.code === 'WEB_PROVIDER_TIMEOUT') return { code: 'timeout' }
  if (error.code === 'TAVILY_INVALID_KEY') return { code: 'invalid_key' }
  if (error.code === 'TAVILY_NETWORK_ERROR') return { code: 'network' }
  if (error.code === 'TAVILY_BUSY') return { code: 'busy' }
  if (['TAVILY_RATE_LIMITED', 'TAVILY_QUOTA_EXCEEDED'].includes(error.code)) return {
    code: error.code === 'TAVILY_RATE_LIMITED' ? 'rate_limited' : 'quota',
    ...(error.retryAfterMs === undefined ? {} : { retryAfterSeconds: Math.ceil(error.retryAfterMs / 1000) })
  }
  if (error.status) return { code: 'http', status: error.status }
  return { code: 'other', error: 'Tavily request could not be completed' }
}
