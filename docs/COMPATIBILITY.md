# Compatibility

## Supported baseline

- DSH `0.1.5-rc.2`, Node.js 22/24, Linux ARM64 and x64; local development also checked on Windows.
- Official DSH tag source: [`fb2c4b9`](https://github.com/deepseek-ai/deepseek-harness/tree/fb2c4b9e698e30edb738bca4cf0618587db7d203). Peer packages are pinned to the matching release.
- Tavily [Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search), [best practices](https://docs.tavily.com/documentation/best-practices/best-practices-search) and [JavaScript SDK](https://github.com/tavily-ai/tavily-js/tree/c5de35f07f0f2b85f03a22e6b04c475b329afc13), checked on 2026-09-12.

## Integration contracts

The host requires `web`. Settings and browser Connection are optional injections, so headless compositions can register the provider. Settings use `installSection`; the client uses `remote.settings`, credential remotes and the keyed `settings.plugin.item` slot. Live settings and configured credential references take precedence over fallback defaults.

The official Web request supplies query and optional result count, not Tavily-specific filters. DSH owns tool orchestration, final result limits and cancellation. This plugin does not patch DSH internals or invent tool parameters. The `truncated` flag describes dropped sources, not shortened snippets.

Native fetch provides connection reuse. The plugin bounds concurrency and response sizes; it does not introduce a process-wide HTTP dispatcher, a cache of potentially stale search results, or automatic provider changes after failure.

## Transport and authentication

`/api/tavily-probe` uses a Connection exact route with streaming input. Its handler rejects more than 4096 bytes and stops body reads after five seconds. Search responses have a separate 1 MiB limit. The normal browser payload is well below the input limit.

DSH 0.1.5-rc.2's HTTP bridge can close a socket when a streaming request is rejected before its body is consumed. Consequently, oversized or stalled uploads can be observed as a transport disconnect instead of the handler's HTTP 413/408 JSON. Rejection is still enforced and no Tavily search starts. The plugin does not drain an unbounded upload just to preserve a JSON error. See the official [Connection bridge](https://github.com/deepseek-ai/deepseek-harness/blob/fb2c4b9e698e30edb738bca4cf0618587db7d203/packages/client/connection/src/http-bridge.ts).

In an ordinary DSH composition, Connection checks Host/Origin and the browser session. The tested ARM deployment also installs `dsh-trusted-host-proxy-403-fix@0.7.0`, which intentionally delegates login to its existing Cloudflare Access deployment while retaining the Host/Origin fence. Tavily inherits the resulting host policy. Installing Tavily does not make a publicly exposed, unauthenticated host safe.

## Release conventions

The repository follows the sibling [proxy](https://github.com/roojay/dsh-trusted-host-proxy-403-fix) and [mobile theme](https://github.com/roojay/dsh-mobile-theme) projects: ESM source, explicit host/client exports, a Cordis bundle patch, English README plus README.zh.md, `test/`, `docs/` and a single `ci.yml` release workflow. No build is needed for this plugin's directly executable source.

Additional release controls: a committed npm lockfile; actions pinned to commit SHAs; ordinary jobs with read-only permissions; browser compatibility required before publishing; verified tarballs shared as immutable artifacts; npm OIDC/provenance without a stored publish token. npm's trusted publisher must name this repository and `ci.yml`.
