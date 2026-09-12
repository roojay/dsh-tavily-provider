# dsh-tavily-provider

[中文](README.md) | English

Tavily web-search provider for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Version `0.4.x` targets DSH `0.1.5-rc.2` while preserving the original toggle, credential references, and DeepSeek fallback.

## Origin and maintenance

This project is a public fork of [`SZMY-haruhi/dsh-tavily`](https://github.com/SZMY-haruhi/dsh-tavily), continuing development from its MIT-licensed code. Since `0.4.0`, this fork has been maintained independently by `roojay` under the new npm package name `dsh-tavily-provider`. Its main changes include adapting to current DSH interfaces, updating the client settings integration, and rebuilding the test and automated release workflows.

The upstream author retains copyright in the original code; subsequent modifications remain copyrighted by their respective contributors. See [LICENSE](LICENSE) for the full terms and original copyright notice. This project is not an official DeepSeek or Tavily project.

## Install

npm (stable, official recommendation):

```sh
dsh plugin --profile web add dsh-tavily-provider
dsh web
```

Or follow GitHub (latest commit on the repo):

```sh
dsh plugin --profile web add github:roojay/dsh-tavily-provider
dsh web
```

Settings → Plugins → Plugin settings → **Tavily web search**: turn the toggle on. The key is optional; leave it blank for keyless. **Test connection** at the bottom-left checks that search works now (including keyless).

When migrating from the old npm package, remove it before installing the renamed package:

```sh
dsh plugin --profile web remove dsh-tavily
dsh plugin --profile web add dsh-tavily-provider
```

The `TAVILY_API_KEY` and `TAVILY_SEARCH_ENABLED` references are unchanged, so existing credentials do not need to be entered again.

<p align="center">
  <img src="docs/settings-en.png" alt="Tavily web search settings: keyless connection test passed" width="560" />
</p>

Pin a commit:

```sh
dsh plugin --profile web add github:roojay/dsh-tavily-provider#<commit>
```

Remove:

```sh
dsh plugin --profile web remove dsh-tavily-provider
```

> `dsh.bundle` · prebuilt `src/` · git install does not need `allowBuilds`



## Features

- Settings toggle: off = official DeepSeek, on = Tavily — no uninstall to switch back
- No key uses Tavily keyless; a key uses `Authorization: Bearer`
- Bottom-left connection test: one real Tavily search (`max_results: 1`); keyless if no key, account quota if a key is saved (1 credit)
- Timeout, abort, official host lock, drop results without a url
- Key and toggle live on the credentials plane, not the settings file



## Behavior


| Toggle        | Key   | `web_search`         |
| ------------- | ----- | -------------------- |
| Off (default) | —     | official DeepSeek    |
| On            | empty | Tavily keyless       |
| On            | set   | Tavily account quota |


Provider id: `tavily`.

## Credentials


| Ref                     | Meaning                                             |
| ----------------------- | --------------------------------------------------- |
| `TAVILY_API_KEY`        | Optional. Present = account quota; absent = keyless |
| `TAVILY_SEARCH_ENABLED` | Present = on; unset = off                           |


You can also put these in `$DSH_HOME/.credentials.yaml`. Do not commit real keys.

## Updates

- **2026-09-12** **0.4.0:** Adapted settings sections, credential remotes, client slots, and Connection Fetch integration for DSH `0.1.5-rc.2`; renamed the npm package to `dsh-tavily-provider`. Existing credential references and the official DeepSeek fallback remain unchanged.
- **2026-08-17** **0.3.1 (please update)** Fix: installing alongside other client plugins could freeze Web on “Failed to load plugins / dsh-tavily” (`settings.plugin.item` needs `key`, not `id`/`order`). Card namespace is `web-search-tavily`; the official Web Search card is not shadowed. Toggle and key still live on credentials.
- **2026-08-17** Settings card: Test connection at the bottom-left. Works without a key (Tavily keyless). A saved key uses the account path and 1 credit. Does not change the toggle or Save.

## License

This project is distributed under the [MIT License](LICENSE). The upstream author `SZMY-haruhi` remains identified in the copyright notice in `LICENSE`.
