# CatLog MCP

**简体中文** | [English](./README_EN.md)

CatLog MCP 是一个给本地 CatLog 归档栈使用的小型 Model Context Protocol（MCP）控制层。

它的职责刻意保持得很窄：对 MCP 客户端提供稳定的工具接口，把归档请求交给本机 Companion，在需要时等待浏览器认证后的归档任务完成，再把结构化结果返回给 MCP 客户端。

CatLog MCP 自己不会直接抓取 ChatGPT 对话，运行时也不依赖浏览器自动化。

## 架构

~~~text
MCP 客户端
  |
  | Streamable HTTP
  v
CatLog MCP
  |
  | 本机 loopback 控制 API
  v
CatLog Companion
  |
  | 本地触发队列
  v
已登录 ChatGPT 的浏览器扩展
  |
  | 使用现有登录态读取对话
  v
对话归档 + 索引
~~~

最重要的信任边界是：**CatLog Companion 始终留在本机。** 远程 MCP 客户端只应该访问 CatLog MCP，不应该直接访问 Companion。

CatLog MCP 也会尽量减少控制层泄露的信息：Companion 健康状态只保留服务名、版本和健康状态；归档任务结果在经由 MCP 返回前，会移除本机路径和归档根目录等元数据。只有在 `catlog_find_message` 需要读取刚生成的原始归档时，本机文件路径才会留在进程内部使用。

## 仓库里有什么

- `server.mjs` — MCP 服务端和 6 个工具
- `setup.ps1` — 安装依赖，并在仓库外创建带随机 MCP 路径的配置
- `rotate-mcp-path.ps1` — 需要时轮换私有 capability path
- `start.ps1` — 使用外部配置启动服务
- `install-startup.ps1` — 可选的 Windows 计划任务安装脚本
- `uninstall-startup.ps1` — 移除对应计划任务
- `config.example.json` — 可以公开的配置示例
- `CHANGELOG.md` — 版本级行为和安全变更
- `tests/` — 轻量回归测试
- `docs/` — 安装、运维、协议、隐私和维护文档

浏览器扩展和 CatLog Companion 是前置依赖，不包含在这个仓库里。

## 工具

| 工具 | 用途 |
| --- | --- |
| `catlog_status` | 查看 Companion 健康状态和最近的 MCP 内存批处理任务 |
| `catlog_find_message` | 先 fresh-read 并归档一段对话，再搜索刚生成的原始 JSON |
| `catlog_archive_conversation` | fresh-read 并归档一段对话 |
| `catlog_archive_many` | 启动按顺序执行的后台批量归档 |
| `catlog_job_status` | 查看一个 MCP 批处理任务 |
| `catlog_trigger_status` | 查看底层 Companion trigger 任务 |

### Fresh-read 规则

`catlog_find_message` 会刻意先归档、再搜索。这样会牺牲一点速度，但优先保证来源是最新的，避免磁盘上的旧归档导致时间戳或正文查错。

### 批处理任务的持久性

`catlog_archive_many` 的批处理状态保存在内存里。重启 CatLog MCP 后，MCP 这一层的批任务状态会丢失；已经由 Companion 完成并写入磁盘的归档不会消失。

## 环境要求

- Windows（仓库自带的 setup/start 脚本使用 PowerShell）
- Node.js 20 或更新版本
- 同一台机器上运行兼容的 CatLog Companion
- 浏览器扩展已连接 Companion，并在浏览器中登录 ChatGPT
- 如果 MCP 客户端在远程，还需要可访问的 HTTPS 入口

## 快速开始

1. 安装依赖并创建本地配置：

~~~powershell
.\setup.ps1
~~~

2. 启动服务：

~~~powershell
.\start.ps1
~~~

3. 检查本地健康状态：

~~~powershell
Invoke-RestMethod http://127.0.0.1:32188/healthz
~~~

`setup.ps1` 会在**仓库之外**的配置文件中生成一条随机 MCP 路径。不要把真实路径提交进 Git，也不要把它贴到公开 issue、截图、示例或文档里。

这条随机路径属于 **capability URL**：HTTPS 负责加密传输；完整且不可猜的随机路径则充当一层“持有即有访问资格”的秘密入口。只要 CatLog MCP 绑定到非 loopback 地址，路径就必须是 `/mcp-` 加至少 40 位 URL-safe 随机字符；短路径或容易猜的路径会在启动时直接被拒绝。

如果以后真的需要轮换路径，可以运行：

~~~powershell
.\rotate-mcp-path.ps1
~~~

然后重启 CatLog MCP，并让 MCP 客户端使用新的完整 URL 重新连接。脚本默认不会把新 secret 打出来；只有准备好重新连接时，才使用 `-ShowNewPath`。

配置还支持两个可选的安全字段：

- `allowed_origins` — 明确允许访问 MCP transport 的浏览器 `Origin`。正常的 server-to-server MCP 请求通常没有 `Origin`，不受影响。
- `bearer_token` — 可选共享 Bearer Token，至少 24 个字符。支持环境变量注入时，优先使用 `CATLOG_MCP_BEARER_TOKEN`。

`CATLOG_MCP_ALLOWED_ORIGINS` 可以用逗号分隔的形式覆盖 `allowed_origins`。默认 allowlist 为空，因此任何真的携带浏览器 `Origin` 的请求都会被拒绝。

配置查找顺序：

1. `CATLOG_MCP_CONFIG` — 指定完整配置文件路径
2. `CATLOG_MCP_STATE_DIR` — 指定包含 `config.json` 的目录
3. Windows 上的 `%LOCALAPPDATA%\CatLogMCP\config.json`
4. 没有 `LOCALAPPDATA` 时使用 `~/.catlog-mcp/config.json`

## 远程访问

默认监听地址是 `127.0.0.1`。如果 MCP 客户端不在同一台机器上，应该在 CatLog MCP 前面放受限制的反向代理、隧道或私有网络。

**不要把 CatLog Companion 本身暴露到远程。**

服务端支持可选 Bearer 认证，但默认关闭，以兼容无法发送固定 `Authorization` header 的客户端。对于这类客户端，随机 capability URL 本身就是兼容的共享秘密边界；如果服务从互联网可达，仍建议同时使用 HTTPS 和合理的网络/反向代理限制。只有客户端确实能发送 Bearer header 时，才开启 Bearer。

MCP transport 还会拒绝带有未授权 `Origin` 的浏览器请求。这可以降低跨站请求和 DNS rebinding 风险，同时不会影响通常不带 `Origin` 的 server-to-server MCP 客户端。

更多说明见 `docs/REMOTE_ACCESS.md` 和 `SECURITY.md`。

## ChatGPT custom MCP 配置

已经实际验证过的 App-backed custom MCP 流程记录在 `docs/CHATGPT_SETUP.md`。

简版流程：

1. 用 HTTPS 暴露 CatLog MCP endpoint
2. 在 ChatGPT 中添加 custom MCP server
3. 填写包含随机路径在内的完整 endpoint
4. 连接 plugin/app
5. 设置这个插件自己的工具权限
6. Refresh tools
7. 运行 `catlog_status`
8. 再做一次真实归档或消息查询作为 smoke test

当前实际验证过的 ChatGPT custom MCP UI **不能原地修改 endpoint URL**。如果 capability path 需要轮换，就先让 CatLog MCP 使用新路径启动，再删除旧的 CatLog 连接/app，最后用新的完整 URL 重新添加。

不要把 ChatGPT 的全局权限设置和这个自定义插件自己的权限页混在一起。

## 隐私

这个仓库的设计目标是：所有私有运行时数据都留在 Git 之外。

仓库中不应出现：

- 对话归档正文
- 示例里的真实 conversation ID
- 浏览器 cookie 或 session token
- 真实远程域名
- 真实隧道路由
- 真实随机 MCP path
- 本地归档目录
- plugin/app ID
- 个人文件系统路径

公开仓库前，可以运行 `docs/OPEN_SOURCE_CHECKLIST.md` 里的检查项。

## 开发与验证

~~~powershell
npm run check
npm test
npm audit --omit=dev
~~~

如果要做真正的端到端验收，还应该确认：

1. Companion 健康
2. MCP initialize 成功
3. `tools/list` 返回全部 6 个 CatLog 工具
4. 一次真实对话归档能完成
5. `catlog_find_message` 能返回原始 `create_time`
6. 返回的 `local_time` 与指定 IANA timezone 一致

## 文档地图

- `docs/END_TO_END_RUNBOOK.md` — 干净环境安装、ChatGPT 注册、smoke test、日常流程、恢复和发布流程
- `docs/ARCHITECTURE.md` — 组件、信任边界、数据流
- `docs/CHATGPT_SETUP.md` — custom MCP / App-backed 配置与权限
- `docs/OPERATIONS.md` — 日常运维与归档流程
- `docs/COMPANION_PROTOCOL.md` — Companion 最小协议
- `docs/REMOTE_ACCESS.md` — 安全远程访问模式
- `docs/TROUBLESHOOTING.md` — 常见故障与恢复
- `docs/OPEN_SOURCE_CHECKLIST.md` — 公开前隐私检查
- `SECURITY.md` — 安全模型和漏洞报告说明

## License

当前没有提供明确的 LICENSE。仓库仍然可以公开；在没有额外许可证的情况下，默认适用通常的版权限制。
