# dsh-tavily-provider

English | [简体中文](README.zh.md)

Tavily web search for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Version 0.5.x targets DSH **0.1.5-rc.2**, on Node.js 22 or newer. This independent fork is not an official DeepSeek or Tavily project.

## Install

```sh
dsh plugin --profile web add dsh-tavily-provider@0.5.0
```

Restart DSH, then open **Settings → Plugins → Plugin configuration → Tavily web search**. Enable Tavily and save. An API key is optional; without one the plugin uses Tavily's keyless access mode. Test connection performs a real basic search and costs one credit in account mode. A probe does not save a draft or change the switch.

Development installs can use `dsh plugin --profile web add github:roojay/dsh-tavily-provider#<commit>`. The committed `src/` is directly runnable; installation needs no build hooks. If pnpm's minimum release age blocks a new version, wait or add only the exact trusted version to the profile's `minimumReleaseAgeExclude` list.

## Behavior

| Switch | Key | Search provider |
| --- | --- | --- |
| Off (default) | Any | Official DeepSeek search, with its current settings |
| On | Absent | Tavily keyless |
| On | Present | Tavily account |

Credentials retain the `TAVILY_API_KEY` and `TAVILY_SEARCH_ENABLED` references. The presence of the latter enables Tavily, regardless of its string value. The card writes keys through DSH credentials and follows a custom `apiKeyEnv`; configuration literals remain read-only in the card. A failed save retains any unwritten key draft and reports that some changes may already have been applied. Discarding changes does not roll back completed remote writes.

Disabling Tavily selects the official DeepSeek provider; Tavily failures do not silently switch to DeepSeek. Existing credentials survive upgrades from `dsh-tavily-provider@0.4.0`. When migrating from the original `dsh-tavily` package, remove that package before installing this fork to avoid two providers claiming the same id.

## Configuration

DSH settings namespace: `web-search-tavily`. Provider id: `tavily`. The card exposes the switch, key and search depth. Other options can be set through DSH settings.

| Option | Default | Meaning |
| --- | --- | --- |
| `apiKeyEnv` | `TAVILY_API_KEY` | Credential reference |
| `apiKey` | Unset | Optional secret configuration literal; overrides the reference |
| `searchDepth` | `basic` | `basic`, `fast`, `ultra-fast`, or `advanced` |
| `chunksPerSource` | `3` | 1–3 chunks for basic, fast and advanced |
| `snippetChars` | `1600` | 500–10000 character cap; avoids cutting a later chunk when possible |
| `maxResults` | `5` | Used when a provider request omits its result count; upstream count is capped at 20 |
| `searchTimeoutMs` | `30000` | Total 1–300000 ms budget, including credentials, queue, retries and response body |
| `maxRetries` | `1` | 0–2 retries for HTTP 429/502/503/504, with at most 2 seconds per retry delay |
| `baseURL` | `https://api.tavily.com` | Official endpoint |
| `allowCustomBaseURL` | `false` | Explicit opt-in for a trusted HTTPS gateway |

Basic remains the balanced default. Fast favors latency; ultra-fast sacrifices relevance for speed. Advanced uses two search credits; the other depths use one. See [Tavily's guidance](https://docs.tavily.com/documentation/best-practices/best-practices-search) and [credits](https://docs.tavily.com/documentation/api-credits).

## Reliability and security

- At most four active Tavily requests and 32 queued requests per plugin instance, shared with probes. Canceled queue entries are removed.
- Cancellation reaches fetch and body reading. Daily/monthly quota failures, invalid keys, and ambiguous network failures are not retried. Automatic retries can consume additional credits; set `maxRetries: 0` when that is undesirable.
- Search responses are limited to 1 MiB. Results retain only supported fields, HTTP(S) URLs without embedded credentials, and unique source URLs. Deduplication ignores fragments and common tracking parameters while preserving functional parameters and HTTP/HTTPS distinctions.
- Probes use DSH Connection's request checks, a streaming 4 KiB input limit and a five-second body deadline. Their security boundary follows the host's authentication and proxy configuration; this plugin does not install an authentication bypass.
- Keys are validated before use in headers. Network failures omit raw causes; upstream error messages redact keys. Custom gateways receive the key and query, so only configure one you trust. Redirects are rejected.

See [compatibility and transport limits](docs/COMPATIBILITY.md) and the [0.5.0 validation record](docs/REGRESSION.md).

## Development and release

```sh
npm ci --ignore-scripts
npm test
npm run check:package
npx playwright install chromium
npm run test:browser
npm run test:live
```

`test:live` makes one real keyless search, plus one account search if `TAVILY_API_KEY` is present. Never commit or print real credentials. Browser tests use an isolated DSH home and synthetic credential fixtures; live search is opt-in and separate from deterministic CI.

`src/` is the sole implementation. `test/` holds unit, browser and live checks; `scripts/` validates the published tarball; `docs/` records compatibility and validation. Legacy `lib/` files forward to `src/` for source checkouts and are not published.

CI uses a committed npm lockfile, Node.js 22/24 checks, real DSH browser compatibility and tarball entry-point verification. Only after all checks pass does a matching `vX.Y.Z` tag publish the verified tarball to npm with OIDC/provenance and create a GitHub Release. Normal checks have read-only repository permissions.

## Origin and license

Forked from [`SZMY-haruhi/dsh-tavily`](https://github.com/SZMY-haruhi/dsh-tavily), under the [MIT license](LICENSE). The original author's copyright is retained. Since 0.4.0, `roojay` maintains this fork independently under the npm name `dsh-tavily-provider`.
