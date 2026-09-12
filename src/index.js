import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { WebError } from '@deepseek-ai/dsh-web'
import {
  DeepSeekSearchProvider,
  DEEPSEEK_DEFAULT_API_VERSION,
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_MAX_TOKENS,
  DEEPSEEK_DEFAULT_MAX_USES,
  DEEPSEEK_DEFAULT_MODEL
} from '@deepseek-ai/dsh-web-search-deepseek'

export const name = 'web-search-tavily'
export const inject = ['web', 'connection']

export const TAVILY_PROVIDER_ID = 'tavily'
export const TAVILY_SETTINGS_NAMESPACE = 'web-search-tavily'
export const TAVILY_API_KEY_REF = 'TAVILY_API_KEY'
export const TAVILY_ENABLED_REF = 'TAVILY_SEARCH_ENABLED'

const TAVILY_ORIGIN = 'https://api.tavily.com'
const DEFAULT_TIMEOUT_MS = 30_000

export const Config = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref').default(TAVILY_API_KEY_REF),
  baseURL: z.string().default(TAVILY_ORIGIN),
  allowCustomBaseURL: z.boolean().default(false),
  maxResults: z.number().step(1).min(1).max(20).default(5),
  searchTimeoutMs: z.number().step(1).min(1).default(DEFAULT_TIMEOUT_MS)
})

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw new WebError('Tavily search aborted', 'WEB_ABORTED', { cause: signal.reason })
  }
}

function isAbortError(error) {
  return error instanceof DOMException &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
}

function normalizeBaseURL(value, allowCustom) {
  let parsed
  try {
    parsed = new URL(value || TAVILY_ORIGIN)
  } catch (error) {
    throw new WebError('Tavily baseURL must be an absolute URL', 'WEB_PROVIDER_ERROR', { cause: error })
  }

  const normalized = parsed.href.replace(/\/$/u, '')
  if (normalized === TAVILY_ORIGIN) return normalized
  if (!allowCustom) {
    throw new WebError(
      `Tavily baseURL must be ${TAVILY_ORIGIN} unless allowCustomBaseURL is true`,
      'WEB_PROVIDER_ERROR'
    )
  }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '' ||
      parsed.search !== '' || parsed.hash !== '') {
    throw new WebError(
      'Tavily custom baseURL must use HTTPS without credentials, query parameters or fragments',
      'WEB_PROVIDER_ERROR'
    )
  }
  return normalized
}

function deadlineSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout])
}

async function resolveCredential(ctx, name, literal) {
  if (typeof literal === 'string' && literal.length > 0) return literal
  const ref = credentialRef(name)
  const credentials = ctx.get('credentials')
  const value = credentials !== undefined
    ? (await credentials.resolve(ref))?.value
    : launchEnvironmentOf(ctx).get(ref)?.value
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

async function isTavilyEnabled(ctx) {
  const ref = credentialRef(TAVILY_ENABLED_REF)
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) return (await credentials.resolve(ref)) !== undefined
  return launchEnvironmentOf(ctx).get(ref) !== undefined
}

function requestHeaders(apiKey) {
  if (apiKey !== undefined) {
    return {
      accept: 'application/json',
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    }
  }
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-tavily-access-mode': 'keyless'
  }
}

async function errorText(response) {
  let message = `Tavily API error (HTTP ${response.status})`
  try {
    const body = await response.json()
    const detail = typeof body?.error === 'string'
      ? body.error
      : body?.error?.message ?? body?.message ?? body?.detail
    if (typeof detail === 'string' && detail.length > 0) message = detail
  } catch {
    // Keep the status-only fallback when Tavily did not return JSON.
  }
  return message
}

function projectResult(body) {
  const rows = Array.isArray(body?.results) ? body.results : []
  const sources = []
  for (const row of rows) {
    if (typeof row?.url !== 'string' || row.url.length === 0) continue
    const source = { url: row.url }
    if (typeof row.title === 'string' && row.title.length > 0) source.title = row.title
    if (typeof row.content === 'string' && row.content.length > 0) {
      source.snippet = row.content.slice(0, 800)
    }
    if (typeof row.published_date === 'string' && row.published_date.length > 0) {
      source.publishedAt = row.published_date
    }
    sources.push(source)
  }
  return { sources, truncated: false }
}

async function searchTavily(query, options, signal) {
  throwIfAborted(signal)
  const baseURL = normalizeBaseURL(options.baseURL, options.allowCustomBaseURL)
  const requestSignal = deadlineSignal(signal, options.searchTimeoutMs)
  let response
  try {
    response = await fetch(`${baseURL}/search`, {
      method: 'POST',
      redirect: 'error',
      headers: requestHeaders(options.apiKey),
      body: JSON.stringify({
        query,
        max_results: options.maxResults,
        search_depth: 'basic',
        chunks_per_source: 3,
        include_answer: false,
        include_raw_content: false,
        include_images: false
      }),
      signal: requestSignal
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new WebError(
        `Tavily search timed out after ${options.searchTimeoutMs}ms`,
        'WEB_PROVIDER_ERROR',
        { cause: error }
      )
    }
    if (signal?.aborted || isAbortError(error)) {
      throw new WebError('Tavily search aborted', 'WEB_ABORTED', { cause: error })
    }
    throw new WebError(`Tavily request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
  }

  if (!response.ok) throw new WebError(await errorText(response), 'WEB_PROVIDER_ERROR')
  try {
    return projectResult(await response.json())
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) {
      throw new WebError('Tavily search aborted', 'WEB_ABORTED', { cause: error })
    }
    throw new WebError(
      `Tavily returned an unprocessable response: ${String(error)}`,
      'WEB_PROVIDER_ERROR',
      { cause: error }
    )
  }
}

function deepSeekFallback(ctx) {
  const apiKeyRef = credentialRef('DEEPSEEK_API_KEY')
  return new DeepSeekSearchProvider(() => ({
    resolveApiKey: async () => resolveCredential(ctx, 'DEEPSEEK_API_KEY'),
    apiKeyEnv: apiKeyRef,
    baseURL: DEEPSEEK_DEFAULT_BASE_URL,
    model: DEEPSEEK_DEFAULT_MODEL,
    apiVersion: DEEPSEEK_DEFAULT_API_VERSION,
    maxTokens: DEEPSEEK_DEFAULT_MAX_TOKENS,
    maxUses: DEEPSEEK_DEFAULT_MAX_USES,
    recordRequest: (request) => {
      ctx.get('agents')?.currentInitiator()?.session.append('web/deepseek-search-llm-request', request)
    }
  }))
}

export class TavilySearchProvider {
  id = TAVILY_PROVIDER_ID

  constructor(resolveOptions, fallback) {
    this.resolveOptions = resolveOptions
    this.fallback = fallback
  }

  available() {
    return true
  }

  async search(request, signal) {
    const options = this.resolveOptions()
    throwIfAborted(signal)
    if (!(await isTavilyEnabled(options.ctx))) {
      return this.fallback.search(request, signal)
    }
    const apiKey = await resolveCredential(options.ctx, options.apiKeyEnv, options.apiKey)
    return searchTavily(request.query, {
      apiKey,
      baseURL: options.baseURL,
      allowCustomBaseURL: options.allowCustomBaseURL,
      maxResults: request.maxResults ?? options.maxResults,
      searchTimeoutMs: options.searchTimeoutMs
    }, signal)
  }
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8'
    }
  })
}

async function readProbeBody(request) {
  const text = await request.text()
  if (new TextEncoder().encode(text).byteLength > 4096) throw new Error('body too large')
  if (text.trim() === '') return {}
  const value = JSON.parse(text)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid JSON body')
  }
  return value
}

function classifyProbeError(error) {
  const message = error instanceof Error ? error.message : String(error)
  if (/timed out|TimeoutError|aborted/iu.test(message)) return { code: 'timeout' }
  const match = message.match(/HTTP (\d{3})/u)
  if (match !== null) {
    const status = Number(match[1])
    if (status === 401 || status === 403) return { code: 'invalid_key' }
    return { code: 'http', status }
  }
  if (/unauthorized|invalid api key|forbidden|invalid key/iu.test(message)) {
    return { code: 'invalid_key' }
  }
  if (/request failed|fetch failed|ECONN|ENOTFOUND|network/iu.test(message)) {
    return { code: 'network' }
  }
  const detail = message
    .replace(/^Tavily (?:API error|returned an unprocessable response):?\s*/iu, '')
    .slice(0, 60)
  return { code: 'other', error: detail || 'unknown' }
}

export function apply(ctx, config) {
  let current = () => config
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(
      ctx,
      TAVILY_SETTINGS_NAMESPACE,
      Config,
      config,
      {
        setSource(source) {
          current = source
        },
        onChange() {}
      }
    )
  })

  const fallback = deepSeekFallback(ctx)
  ctx.web.registerSearchProvider(new TavilySearchProvider(() => {
    const value = current()
    return {
      ctx,
      apiKey: value.apiKey,
      apiKeyEnv: value.apiKeyEnv ?? TAVILY_API_KEY_REF,
      baseURL: value.baseURL ?? TAVILY_ORIGIN,
      allowCustomBaseURL: value.allowCustomBaseURL === true,
      maxResults: value.maxResults ?? 5,
      searchTimeoutMs: value.searchTimeoutMs ?? DEFAULT_TIMEOUT_MS
    }
  }, fallback))

  ctx.connection.fetch.register({
    path: '/api/tavily-probe',
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      let body
      try {
        body = await readProbeBody(request)
      } catch (error) {
        const message = error instanceof SyntaxError ? 'invalid JSON body' : error.message
        return jsonResponse(400, { ok: false, code: 'other', error: message })
      }

      try {
        const value = current()
        const draft = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
        const clearKey = body.clearKey === true
        const apiKey = draft.length > 0
          ? draft.slice(0, 512)
          : clearKey
            ? undefined
            : await resolveCredential(ctx, value.apiKeyEnv ?? TAVILY_API_KEY_REF, value.apiKey)
        await searchTavily('tavily', {
          apiKey,
          baseURL: value.baseURL ?? TAVILY_ORIGIN,
          allowCustomBaseURL: value.allowCustomBaseURL === true,
          maxResults: 1,
          searchTimeoutMs: value.searchTimeoutMs ?? DEFAULT_TIMEOUT_MS
        })
        return jsonResponse(200, { ok: true, mode: apiKey === undefined ? 'keyless' : 'key' })
      } catch (error) {
        return jsonResponse(200, { ok: false, ...classifyProbeError(error) })
      }
    }
  })
}

export const __test = {
  classifyProbeError,
  normalizeBaseURL,
  projectResult,
  readProbeBody,
  searchTavily
}
