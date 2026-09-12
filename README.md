# dsh-tavily-provider

中文 | [English](README.en.md)

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Tavily 网页搜索 Provider。`0.4.x` 适配 DSH `0.1.5-rc.2`，保留原有开关、凭据引用和 DeepSeek 回落行为。

## 项目来源与维护

本项目是 [`SZMY-haruhi/dsh-tavily`](https://github.com/SZMY-haruhi/dsh-tavily) 的公开 fork，基于其 MIT 许可代码继续开发。自 `0.4.0` 起，本 fork 由 `roojay` 独立维护，并使用新的 npm 包名 `dsh-tavily-provider`；主要修改包括适配新版 DSH 接口、更新客户端设置集成，以及重建测试和自动发布流程。

上游原作者保留原始代码的版权；本 fork 的后续修改由对应贡献者保留版权。完整条款及原作者版权声明见 [LICENSE](LICENSE)。本项目不是 DeepSeek 或 Tavily 的官方项目。

## 安装

npm（稳定版，官方推荐）：

```sh
dsh plugin --profile web add dsh-tavily-provider
```

也可以跟 GitHub（跟仓库最新提交）：

```sh
dsh plugin --profile web add github:roojay/dsh-tavily-provider
```

设置 → 插件 → 插件配置 → **Tavily 网页搜索**：打开开关即可。Key 可选，不填走无 Key。左下「连通测试」可确认现在能不能搜（无 Key 也测得通）。

从旧 npm 包迁移时，先移除旧包，再安装新包：

```sh
dsh plugin --profile web remove dsh-tavily
dsh plugin --profile web add dsh-tavily-provider
```

`TAVILY_API_KEY` 和 `TAVILY_SEARCH_ENABLED` 仍使用原引用，迁移不会要求重新录入已有凭据。

<p align="center">
  <img src="docs/settings-zh.png" alt="Tavily 网页搜索设置：无 Key 时连通测试通过" width="560" />
</p>

钉 commit：

```sh
dsh plugin --profile web add github:roojay/dsh-tavily-provider#<commit>
```

卸载：

```sh
dsh plugin --profile web remove dsh-tavily-provider
```

> `dsh.bundle` · 预构建 `src/` · git 安装无需 `allowBuilds`



## 特点

- 设置卡开关：关 = 官方 DeepSeek，开 = Tavily，不用卸包
- 无 Key 走 Tavily keyless；有 Key 走 `Authorization: Bearer`
- 左下连通测试：真打一次 Tavily（`max_results: 1`）；无 Key 走 keyless，有 Key 走账号档（消耗 1 积分）
- 超时、中止、官方 Host 锁定、丢掉无 url 的结果
- Key / 开关写在 credentials，不写设置文件



## 行为


| 开关    | Key | `web_search`   |
| ----- | --- | -------------- |
| 关（默认） | —   | 官方 DeepSeek    |
| 开     | 未填  | Tavily keyless |
| 开     | 已填  | Tavily 账号档     |


Provider id：`tavily`。

## 凭证


| 引用                      | 含义                   |
| ----------------------- | -------------------- |
| `TAVILY_API_KEY`        | 可选。有则走账号档；无则 keyless |
| `TAVILY_SEARCH_ENABLED` | 有此项则为开；删除即关          |


可写在 `$DSH_HOME/.credentials.yaml`。不要把真实钥匙提交进仓库。

## 更新

- **2026-09-12** **0.4.0**：适配 DSH `0.1.5-rc.2` 的设置 Section、Credentials Remote、客户端 Slot 和 Connection Fetch 接口；npm 包改名为 `dsh-tavily-provider`。沿用原凭据引用，关闭 Tavily 时继续回落到官方 DeepSeek 搜索。
- **2026-08-17** **0.3.1（请更新）** 修复：与其它客户端插件同时安装时，Web 可能卡在「Failed to load plugins / dsh-tavily」（`settings.plugin.item` 需 `key`，不能再用 `id`/`order`）。设置卡命名空间 `web-search-tavily`，不覆盖官方网页搜索卡。开关与 Key 仍走 credentials。
- **2026-08-17** 设置卡左下增加连通测试。无 Key 也可测（走 Tavily keyless）；有已存 Key 则走账号档，消耗 1 积分。不改开关、不占用保存。

## 许可

本项目遵循 [MIT License](LICENSE)。`LICENSE` 中保留了上游原作者 `SZMY-haruhi` 的版权声明。
