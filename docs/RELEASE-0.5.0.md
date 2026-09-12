## 0.5.0

适配 DSH 0.1.5-rc.2，继续使用 npm 包 `dsh-tavily-provider`，沿用现有凭据。

- 新增 basic、fast、ultra-fast、advanced 搜索档位，默认保持 basic；优化片段保留、URL 校验和去重。
- 凭据解析、排队、重试和响应读取共用总时限；限制并发和等待队列，正确处理提前取消与读取超时。
- 仅对短暂的 429/502/503/504 做有限重试，区分额度耗尽与限流；密钥校验及错误脱敏覆盖上游诊断字段。
- 探测改为流式限量读取，支持取消；修复设置保存与更新通知竞争、自定义凭据引用、部分失败和旧探测结果覆盖。
- 关闭 Tavily 时遵循官方 DeepSeek 搜索的当前配置。
- 统一中英文文档、目录和发布流程；锁定依赖及 Action 提交，发布等待 Node 22/24、解包检查和真实 DSH 浏览器测试，使用 npm OIDC/provenance。

核心版本已在 ARM64 / Node.js 24.19.0 / DSH 0.1.5-rc.2 通过真实免密和账号搜索、接口检查及服务验证。详细测试范围和流式传输限制见仓库 `docs/REGRESSION.md`、`docs/COMPATIBILITY.md`。

安装：`dsh plugin --profile web add dsh-tavily-provider@0.5.0`，随后重启 DSH。
