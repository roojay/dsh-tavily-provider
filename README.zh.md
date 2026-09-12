# dsh-tavily-provider

[English](README.md) | 简体中文

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Tavily 网页搜索插件。0.5.x 适配 DSH **0.1.5-rc.2**，需要 Node.js 22 或更新版本。本项目独立维护，并非 DeepSeek 或 Tavily 官方项目。

## 安装

```sh
dsh plugin --profile web add dsh-tavily-provider@0.5.1
```

重启 DSH，进入 **设置 → 插件 → 插件配置 → Tavily 网页搜索**，打开开关并保存。密钥可选，不填时使用 Tavily keyless。连通测试会执行真实的 basic 搜索，账号模式每次消耗 1 积分；测试不会保存草稿或修改开关。

开发版本可使用 `dsh plugin --profile web add github:roojay/dsh-tavily-provider#<commit>`。`src/` 可以直接运行，安装不需要构建钩子。如果 pnpm 的最短发布年龄限制拦截新版本，可以等待，或仅将这个可信版本加入 profile 的 `minimumReleaseAgeExclude`。

## 行为

| 开关 | 密钥 | 搜索服务 |
| --- | --- | --- |
| 关（默认） | 任意 | 官方 DeepSeek 搜索，沿用其当前配置 |
| 开 | 无 | Tavily keyless |
| 开 | 有 | Tavily 账号模式 |

沿用 `TAVILY_API_KEY`、`TAVILY_SEARCH_ENABLED` 凭据引用。后者存在即表示开启，与字符串内容无关。设置卡通过 DSH 凭据接口保存密钥，并遵循自定义 `apiKeyEnv`；直接在配置中提供的密钥在卡片内只读。保存部分失败时保留尚未写入的密钥草稿，并提示已完成的部分可能生效；放弃修改不会撤销已经完成的远程写入。

关闭 Tavily 才会选择官方 DeepSeek；Tavily 搜索失败不会静默切换服务。从 0.4.0 升级不需要重新填写凭据。从原始 `dsh-tavily` 迁移时，应先卸载原包再安装本 fork，避免重复注册同一 provider。

## 配置

DSH 设置命名空间：`web-search-tavily`；provider id：`tavily`。设置卡提供开关、密钥和搜索档位，其余选项通过 DSH 设置配置。

| 选项 | 默认值 | 说明 |
| --- | --- | --- |
| `apiKeyEnv` | `TAVILY_API_KEY` | 凭据引用 |
| `apiKey` | 未设置 | 可选的 secret 配置值，优先于凭据引用 |
| `searchDepth` | `basic` | `basic`、`fast`、`ultra-fast`、`advanced` |
| `chunksPerSource` | `3` | basic、fast、advanced 每来源 1–3 个片段 |
| `snippetChars` | `1600` | 摘要上限 500–10000 字符，尽可能保留完整片段 |
| `maxResults` | `5` | 调用方没有指定数量时使用；上游请求最多 20 条 |
| `searchTimeoutMs` | `30000` | 总时限 1–300000 毫秒，包含凭据解析、排队、重试和响应读取 |
| `maxRetries` | `1` | HTTP 429/502/503/504 最多重试 0–2 次，每次等待不超过 2 秒 |
| `baseURL` | `https://api.tavily.com` | 官方地址 |
| `allowCustomBaseURL` | `false` | 显式允许可信 HTTPS 网关 |

默认 basic 平衡相关性和速度；fast 更偏向速度；ultra-fast 以相关性换取低延迟；advanced 更适合深入检索。advanced 每次 2 积分，其余档位每次 1 积分。参见 [Tavily 最佳实践](https://docs.tavily.com/documentation/best-practices/best-practices-search)和[计费文档](https://docs.tavily.com/documentation/api-credits)。

## 稳定性与安全

- 每个插件实例最多同时执行 4 个 Tavily 请求、排队 32 个；搜索与探测共享限额，取消会移除等待任务。
- 取消传递到网络请求及响应读取。日/月额度耗尽、无效密钥、结果不明确的网络错误不重试。重试可能产生额外积分消耗，可设置 `maxRetries: 0` 关闭。
- 上游响应限制为 1 MiB；仅保留受支持字段、无内嵌凭据的 HTTP(S) URL；去重忽略片段和常见跟踪参数，保留功能参数及 HTTP/HTTPS 区别。
- 探测沿用 DSH Connection 的请求检查，流式输入上限 4 KiB、读取时限 5 秒。实际认证边界取决于宿主和代理配置，本插件不安装认证绕过。
- 密钥在写入请求头前校验；网络错误不附带原始异常，上游错误文本会脱敏。自定义网关会收到密钥和查询，务必使用可信网关；禁止跟随重定向。

具体边界见[兼容性说明](docs/COMPATIBILITY.md)及[验证记录](docs/REGRESSION.md)。

## 开发与发布

```sh
npm ci --ignore-scripts
npm test
npm run check:package
npx playwright install chromium
npm run test:browser
npm run test:live
```

`test:live` 发起 1 次真实免密搜索；环境中有 `TAVILY_API_KEY` 时，再发起 1 次真实账号搜索。请勿提交或打印真实凭据。浏览器测试使用隔离的 DSH home 和合成凭据，真实网络测试单独运行，不作为确定性 CI 的依赖。

`src/` 是唯一实现；`test/` 存放单元、浏览器及真实搜索测试；`scripts/` 检查发布包；`docs/` 记录兼容性和验证。旧 `lib/` 仅在源码检出中转发到 `src/`，不进入 npm 包。

CI 使用 npm 锁文件，在 Node.js 22/24 执行测试，并运行真实 DSH 浏览器兼容测试、解包入口检查。全部通过后，与包版本匹配的 `vX.Y.Z` 标签才会通过 OIDC/provenance 发布已验证的 tarball，并创建 GitHub Release。普通检查仅有仓库读取权限。

## 来源与许可

本项目 fork 自 [`SZMY-haruhi/dsh-tavily`](https://github.com/SZMY-haruhi/dsh-tavily)，遵循 [MIT 许可](LICENSE)，保留原作者版权声明。自 0.4.0 起，由 `roojay` 使用新的 npm 包名 `dsh-tavily-provider` 独立维护。
