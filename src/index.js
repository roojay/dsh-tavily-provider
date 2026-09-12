import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import {
  DeepSeekSearchProvider, DEEPSEEK_DEFAULT_API_VERSION, DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_MAX_TOKENS, DEEPSEEK_DEFAULT_MAX_USES, DEEPSEEK_DEFAULT_MODEL
} from '@deepseek-ai/dsh-web-search-deepseek'
import {
  TAVILY_ORIGIN, DEFAULT_TIMEOUT_MS, abortable, checkSignal, deadline, failure,
  normalizeBaseURL, normalizeKey, readBoundedBody, projectResult, searchTavily,
  createLimiter, classifyProbeError
} from './tavily.js'

export const name = 'web-search-tavily'
export const inject = ['web']
export const TAVILY_PROVIDER_ID = 'tavily'
export const TAVILY_SETTINGS_NAMESPACE = 'web-search-tavily'
export const TAVILY_API_KEY_REF = 'TAVILY_API_KEY'
export const TAVILY_ENABLED_REF = 'TAVILY_SEARCH_ENABLED'

export const Config = z.object({
  apiKey: z.string().role('secret'),
  apiKeyEnv: z.string().role('credential-ref').default(TAVILY_API_KEY_REF),
  baseURL: z.string().default(TAVILY_ORIGIN),
  allowCustomBaseURL: z.boolean().default(false),
  maxResults: z.number().step(1).min(1).max(20).default(5),
  searchDepth: z.union(['basic', 'fast', 'ultra-fast', 'advanced']).default('basic'),
  chunksPerSource: z.number().step(1).min(1).max(3).default(3),
  snippetChars: z.number().step(1).min(500).max(10000).default(1600),
  maxRetries: z.number().step(1).min(0).max(2).default(1),
  searchTimeoutMs: z.number().step(1).min(1).max(300000).default(DEFAULT_TIMEOUT_MS)
})

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
  return credentials !== undefined
    ? (await credentials.resolve(ref)) !== undefined
    : launchEnvironmentOf(ctx).get(ref) !== undefined
}

function deepSeekFallback(ctx) {
  return new DeepSeekSearchProvider(() => {
    const config = ctx.get('settings')?.get('web-search-deepseek') ?? {}
    const ref = config.apiKeyEnv ?? 'DEEPSEEK_API_KEY'
    return {
      resolveApiKey: () => resolveCredential(ctx, ref, config.apiKey),
      apiKeyEnv: credentialRef(ref),
      baseURL: config.baseURL ?? launchEnvironmentOf(ctx).get('DEEPSEEK_SEARCH_BASE_URL')?.value ?? DEEPSEEK_DEFAULT_BASE_URL,
      model: config.model ?? DEEPSEEK_DEFAULT_MODEL,
      apiVersion: config.apiVersion ?? DEEPSEEK_DEFAULT_API_VERSION,
      maxTokens: config.maxTokens ?? DEEPSEEK_DEFAULT_MAX_TOKENS,
      maxUses: config.maxUses ?? DEEPSEEK_DEFAULT_MAX_USES,
      recordRequest: (request) => {
        ctx.get('agents')?.currentInitiator()?.session.append('web/deepseek-search-llm-request', request)
      }
    }
  })
}

export class TavilySearchProvider {
  id = TAVILY_PROVIDER_ID
  constructor(resolveOptions, fallback, run = createLimiter()) {
    this.resolveOptions = resolveOptions
    this.fallback = fallback
    this.run = run
  }
  available() { return true }
  async search(request, signal) {
    const options = this.resolveOptions()
    const budget = deadline(signal, options.searchTimeoutMs)
    if (!(await abortable(() => isTavilyEnabled(options.ctx), budget))) {
      checkSignal(budget)
      return abortable(() => this.fallback.search(request, budget), budget)
    }
    const apiKey = await abortable(() => resolveCredential(options.ctx, options.apiKeyEnv, options.apiKey), budget)
    return this.run(() => searchTavily(request.query, {
      ...options, apiKey, maxResults: request.maxResults ?? options.maxResults, deadlineApplied: true
    }, budget), budget)
  }
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), { status, headers: {
    'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8'
  } })
}

async function readProbeBody(request) {
  const signal = deadline(request.signal, 5000)
  if (Number(request.headers.get('content-length')) > 4096) throw failure('body too large', 'TAVILY_BODY_TOO_LARGE')
  const text = await readBoundedBody(request.body, 4096, signal)
  if (!text.trim()) return {}
  let value
  try { value = JSON.parse(text) } catch { throw failure('invalid JSON body', 'TAVILY_INVALID_QUERY') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('invalid JSON body', 'TAVILY_INVALID_QUERY')
  return value
}

export function apply(ctx, config) {
  let current = () => config
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, TAVILY_SETTINGS_NAMESPACE, Config, config, {
      setSource(source) { current = source }, onChange() {}
    })
  })
  const options = () => {
    const value = current()
    return { ...value, ctx, apiKeyEnv: value.apiKeyEnv ?? TAVILY_API_KEY_REF,
      baseURL: value.baseURL ?? TAVILY_ORIGIN, allowCustomBaseURL: value.allowCustomBaseURL === true,
      maxResults: value.maxResults ?? 5, searchTimeoutMs: value.searchTimeoutMs ?? DEFAULT_TIMEOUT_MS }
  }
  const run = createLimiter()
  ctx.web.registerSearchProvider(new TavilySearchProvider(options, deepSeekFallback(ctx), run))
  // The search provider also works in headless compositions without a browser connection.
  ctx.inject(['connection'], (connectionCtx) => {
    connectionCtx.connection.fetch.register({
      path: '/api/tavily-probe', methods: ['POST'], requestBody: 'streaming',
      fetch: async (request) => {
        let body
        try { body = await readProbeBody(request) } catch (error) {
          return jsonResponse(error.code === 'TAVILY_BODY_TOO_LARGE' ? 413 : error.code === 'WEB_PROVIDER_TIMEOUT' ? 408 : 400,
            { ok: false, ...classifyProbeError(error) })
        }
        try {
          const value = options()
          const signal = deadline(request.signal, value.searchTimeoutMs)
          const literal = normalizeKey(value.apiKey)
          // A configured literal overrides the credential plane, so a draft cannot pretend to replace it.
          const draft = literal === undefined ? normalizeKey(body.apiKey) : undefined
          const apiKey = literal ?? draft ?? (body.clearKey === true ? undefined
            : await abortable(() => resolveCredential(ctx, value.apiKeyEnv), signal))
          await run(() => searchTavily('tavily', { ...value, apiKey, maxResults: 1,
            searchDepth: 'basic', maxRetries: 0, deadlineApplied: true }, signal), signal)
          return jsonResponse(200, { ok: true, mode: apiKey === undefined ? 'keyless' : 'key' })
        } catch (error) {
          return jsonResponse(200, { ok: false, ...classifyProbeError(error) })
        }
      }
    })
  })
}

export const __test = { classifyProbeError, normalizeBaseURL, projectResult, readProbeBody,
  searchTavily, deepSeekFallback, resolveCredential }
