# 0.5.0 validation record

Date: 2026-09-12. Baseline: fork commit `d4abd92`, version 0.4.0. Measurements are small smoke-test samples, not an SLA or a controlled before/after benchmark.

## Real searches

Before changes, 19 local real API requests covered search depths, parallel requests, cancellation, timeout, invalid credentials and result-count behavior. All normal calls worked. For three samples per depth, median local latency was basic 1.412 s, fast 1.317 s, and ultra-fast 0.540 s. Ultra-fast had weaker source relevance, so basic remains the default. Sending `max_results: 100` actually succeeded and returned 16 sources; the new 20-result cap is documented-contract hardening, not a claimed reproduction of an HTTP failure.

After core changes, the local live provider returned three valid sources in 1.407 s. On ARM64 / Node.js 24.19.0 / DSH 0.1.5-rc.2, the candidate provider returned three sources in both keyless (0.888 s) and real account (0.710 s) modes. Through the installed DSH probe route, account mode succeeded in 0.754 s, keyless in 0.246 s, and an intentionally invalid key was categorized correctly in 0.256 s. Queries were public documentation searches; credentials and full upstream responses were not logged.

## Regression coverage

The 20 initial host/client regression cases passed on both Windows and ARM. They cover URL/response validation, secret redaction, credentials under cancellation/deadline, response-body timeout, bounded streaming input, pre-aborted probes, retry/quota distinction, upstream count/depth, queue cancellation, official DeepSeek configuration, save/event races, partial failures, custom key references, literal key protection and stale probe results. Packaging and real DSH browser checks are additional release gates.

An isolated browser composition exercises the real settings and credential remotes with synthetic credentials. Probe rendering uses a deterministic fixture; real Tavily behavior is established by the separate live and ARM checks. Rate limits, server faults and stuck credentials use controlled test doubles; no quota-exhaustion or high-volume load test was performed against a real account.

Before release, all 22 local unit/metadata tests and extraction/import of the 11-file npm package passed. The packed plugin passed the real DSH browser test on Windows, including the default session-authentication gate, credential and depth persistence, key clearing, probe validation and rendering. That test also caught a switch track intercepting pointer events; the decorative track now ignores pointer events and the switch has a visible keyboard focus outline.

## ARM deployment

The core candidate was installed into the existing web profile before CI restructuring. The managed service and all required `/opt/dsh/bin/verify.sh` checks passed. Credential and settings file SHA-256 values were unchanged across installation. Cross-origin and cross-site probe requests returned 403; malformed JSON returned 400. Oversized streaming input was rejected by closing the connection; see [transport limits](COMPATIBILITY.md).

The existing proxy and mobile theme versions remain 0.7.0 and 0.5.0 respectively. Profile manifests were copied to a new restricted backup directory before installation. Final npm installation is verified separately after publication.
