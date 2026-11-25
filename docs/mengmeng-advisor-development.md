# 萌萌的专属顾问开发文档

## 1. 这是什么

「萌萌的专属顾问」是 YMeng CC 个人资料里的一个原生模块，入口为 `/advisor`（个人资料下拉菜单、侧边栏「个人」分组）。它由三部分组成：

- **Windows 本机仓库里的前端页面**：提供 `/advisor`，生成/查询/解除 QQ 绑定。
- **Linux 服务器上的 AstrBot QQ 插件**：提供 `/advisor/api/*` 后端、QQ 指令、绑定/签到/红包数据。
- **Y Meng CC 现有后端 API**：不新增后端接口，只复用 `/api/user/self`、`/api/user/{id}`、`/api/user/manage`、`/api/log/stat`、`/api/status`。

线上当前版本：前端 v1.2.32，插件 0.7.0（故障告警 + 恢复通知 webhook 已上线，接收群 755457151）。前端「故障告警」说明卡（含恢复通知文案）已合入源码，随 v1.2.34 发版。

---

## 2. 开发文件地址

### 2.1 Windows 本机（前端源码）

仓库根目录：

`E:\07_coding\0_newapi\YMeng-CC-New-API`

核心文件：

- `web/src/features/advisor/index.tsx`：页面主体；当前顺序为标题 → `QqBindingCard` → `FeatureOverviewCard`。
- `web/src/features/advisor/api.ts`：调 `/advisor/api/code`、`/advisor/api/binding`、`/advisor/api/unbind`。
- `web/src/features/advisor/components/qq-binding-card.tsx`：绑定码生成、倒计时、轮询绑定状态、解绑。
- `web/src/features/advisor/components/feature-overview-card.tsx`：功能一览；顺序固定为 `/帮助`、状态监控、故障告警、签到、发红包、余额查询、管理员充值，描述必须与机器人实际行为一致。
- `web/src/features/advisor/components/balance-card.tsx`：余额卡，当前页面不渲染，保留以便复用。
- `web/src/routes/_authenticated/advisor/index.tsx`：TanStack Router 路由文件。
- `web/src/components/profile-dropdown.tsx`：个人资料下拉入口。
- `web/src/hooks/use-sidebar-data.ts`、`web/src/hooks/use-sidebar-config.ts`：侧边栏「个人」分组入口与开关。
- `web/src/features/profile/components/sidebar-modules-card.tsx`：用户侧边栏模块开关。
- `web/src/features/system-settings/maintenance/config.ts`、`web/src/features/system-settings/maintenance/sidebar-modules-section.tsx`：管理员侧边栏模块开关。
- `VERSION`、`.github/update-compatibility.json`：发版版本与升级来源声明。

本机开发分支：`ip-policy`。前端包管理器用 **bun**（`bun run typecheck`、`bun run build`），不要用 npm/yarn/pnpm 提交依赖变更。

### 2.2 Linux 服务器（AstrBot Bot 插件）

插件目录：

`/srv/newapi-migration/services/astrbot/data/plugins/astrbot_plugin_newapi_qq/`

容器内对应路径：

`/AstrBot/data/plugins/astrbot_plugin_newapi_qq/`

核心文件：

- `main.py`：插件入口。HTTP 服务（8099）、所有 QQ 指令、绑定成功文案、签到/帮助/红包/余额逻辑、故障告警 webhook 接收（`POST /advisor/api/webhook/status`）。
- `uptime_alert.py`：故障告警纯逻辑（HMAC 验签、`sentAt` 时效、`deliveryId` 有界去重、告警文案、群号解析），不依赖 AstrBot。
- `newapi.py`：调用 YMeng CC API 的轻量客户端：`get_user`、`adjust_quota`、`get_log_stat`、`get_status` 等。
- `binder.py`：一次性验证码与 QQ↔用户绑定 KV。
- `redpacket.py`：红包 KV、二倍均值随机、领取与过期退款。
- `signin.py`：签到 KV，按 YMeng CC 用户 ID 记录 `pending/done/not_met/unknown`。
- `.env`（600）：`NEWAPI_ADMIN_TOKEN`、`UPTIME_WEBHOOK_SECRET`；示例见 `.env.example`。
- `metadata.yaml`：插件名、描述、版本（当前 `0.7.0`）。
- `_conf_schema.json`：配置项声明（含 `sign_in`、`uptime_alert` 分组）。
- `README.md`：插件命令与规则速查。
- 单测：`/srv/newapi-migration/services/astrbot/data/plugin-tests/test_uptime_alert.py`（放在插件目录之外，避免被 AstrBot 当作插件模块加载；容器内 `cd /AstrBot && python -m unittest discover -s data/plugin-tests -v`）。

运行配置：

`/srv/newapi-migration/services/astrbot/data/config/astrbot_plugin_newapi_qq_config.json`

容器与反代：

- `/srv/newapi-migration/services/astrbot/docker-compose.yml`：AstrBot 容器，端口 `127.0.0.1:8099:8099`。
- `/www/server/panel/vhost/nginx/ymeng.cc.conf`：把 `/advisor/api/` 反代到 `127.0.0.1:8099`；`/advisor` 仍走 SPA。

---

## 3. 关键行为契约

### 3.1 顾问页与插件

- 页面用登录 JWT 调 `/advisor/api/*`；插件用该 JWT 调 `/api/user/self` 验证身份。
- 绑定码：8 位数字，5 分钟有效，一次性；同一用户 10 分钟最多 5 次，按 IP 限速。
- 绑定关系按 QQ 存 KV `bindings`；解绑按 QQ 或按 YMeng CC 用户 ID。
- 默认 `sign_in` 配置：`enabled=true`、`min_display_amount=10.0`、`min_reward_units=1.0`、`max_reward_units=5.0`、`reward_step=0.01`。

### 3.2 QQ 指令

| 指令 | 行为 |
| --- | --- |
| `/绑定 <验证码>`（`/bind`） | 绑定 QQ 与账号，成功提示引导 `/帮助` |
| `/解绑`（`/unbind`） | 解除当前 QQ 绑定 |
| `/绑定状态`（`/我的绑定`） | 查看绑定账号与时间 |
| `/余额`（`/查询余额`、`/balance`） | 返回余额、已用额度、原始额度 |
| `/签到` | 昨日消费达标后随机奖励 |
| `/发红包 <总量> <个数>` | 所有已绑定用户可发，从自己余额扣款 |
| `/领取红包 [红包码]`（`/领红包`） | 领取红包，额度加到绑定账号 |
| `/帮助` | 列出全部可用指令 |

`/帮助` 必须是顾问页功能说明第一条，且文案与实际能力一致。

### 3.3 签到规则

- 时间口径：**北京时间**自然日；“前一天”是昨日 00:00:00–23:59:59。
- 消费查询：`GET /api/log/stat?user_id=<id>&type=2&start_timestamp=<s>&end_timestamp=<e>`，`end_timestamp` 含端点，返回 `data.quota` 为原始额度合计。
- 门槛：昨日消费达到站点显示金额 **10**（含等于）。不确定金额时看 `/api/status` 的 `quota_per_unit`、`quota_display_type`、`custom_currency_exchange_rate`。
- 奖励：**1.00–5.00**，步长 **0.01**，1.00 和 5.00 都可取到；权重随金额线性递减（金额越大越难抽中），不是均匀分布。
- 奖励展示固定两位小数，如 `¤1.00`、`¤3.47`、`¤5.00`，不能出现 `5`、`3.5` 这种形式。KV 里 `reward_units` 也存两位小数字符串。
- 频率：**每个 YMeng CC 账号每天一次**，多个 QQ 绑同一账号共用。
- 防重：`sign_ins` 按 `user_id` + 日期键；先写 `pending` 再请求发奖，并发第二次直接返回“已签到”。超时/5xx 记 `unknown` 且不自动重试，宁可少发不可重复发。

### 3.4 红包规则

- 不再限制 AstrBot 管理员；所有已绑定用户都能在群聊里发。
- 金额按站点显示货币填写，扣的是**发红包人自己绑定的账号**余额。
- 群聊限定；余额不足、个数超限、每群同时进行中红包超限都有明确提示。
- 领取仅限已绑定用户；发红包人不能领自己的包；每人每包一次；24 小时未领完退回发红包人。

### 3.5 访问令牌

插件 `.env` 里的 PAT 是用户 1 的 `qq-bot-balance`，数据库 `user_access_tokens` 中 id=9，需要 scope：

`user:read`、`user:write`、`log:read`

`user:write` 用于红包扣款/入账和签到发奖；`log:read` 用于签到统计昨日消费。scope 每请求查库，改库后无需重启 YMeng CC，但要重启 AstrBot 让插件重新读取配置。这个 PAT 已有 `user:write`，加 `log:read` 后可读全站消费日志，泄露时必须立即轮换。

### 3.6 故障告警 webhook（插件 0.7.0）

- 链路：`health.ymeng.cc` 兼容层（model-status-next，镜像 1.1.4-webhook）每 60 秒探测一次，`webhook.py` 每 20 秒从 `probe` 表重算连续失败数；达到阈值（配置为 3）且闭锁位 `monitor_control.webhook_alerted` 为假时，向 `https://ymeng.cc/advisor/api/webhook/status` POST 一条 `monitor.down`；已告警的监控项最近一次探测成功时 POST 一条 `monitor.up`（恢复通知）。new-api 后端与 `/api/uptime/status` 不参与、不改动。
- 签名：`X-Webhook-Signature: sha256=<HMAC-SHA256(密钥, 原始请求体)>`；密钥两端一致，插件侧在 `.env` 的 `UPTIME_WEBHOOK_SECRET`，兼容层侧在后台 webhook 设置。另有 `X-Webhook-Event`、`X-Webhook-Delivery` 头。
- 插件处理顺序：密钥未配置 503 → 验签失败 401 → JSON 无效 400 → `sentAt` 距当前超过 300 秒返回 200 丢弃 → `deliveryId` 已处理（内存最近 200 个）返回 200 丢弃 → `webhook.test` 等其他事件返回 200 不发群 → `uptime_alert.enabled=false` 或未配置群返回 200 丢弃 → `monitor.down` / `monitor.up` 逐个配置群 `context.send_message`，全部成功 200，任一失败 502。
- 不丢不重：插件非 2xx 时兼容层不变更闭锁位，约 20 秒后重试且 `deliveryId` 不变，重试由插件去重丢弃；故障期间群里只有一条告警，恢复时只有一条恢复通知。`monitor.down` 投递成功后兼容层置闭锁位，`monitor.up` 投递成功后清闭锁位，下次故障重新告警。失败原因、首次失败时间均不展示（明确不包含）。
- 告警文本（纯文本，北京时间）：`⚠️ 状态监控告警` + 分组、监控项、已连续失败 N 次、最近失败（MM-DD HH:mm）、状态页链接。
- 恢复文本（纯文本，北京时间）：`✅ 状态监控恢复` + 分组、监控项、恢复时间（MM-DD HH:mm，即恢复成功的探测时间）、状态页链接。
- 配置：插件 `uptime_alert` 分组 `enabled`（默认 false）、`group_ids`（text，每行一个纯数字群号）；兼容层后台填地址、密钥、阈值 3 并打开逐项推送开关。平台 id 写死 `default`（`main.py` 的 `ALERT_PLATFORM_ID`），平台 id 变更需同步。
- 已知限制：启用瞬间已连续失败的监控项会各推一条（如 Claude-CC-Max）；最坏延迟约 100 秒；链路依赖 Cloudflare 与 Nginx 的现有 `/advisor/api/` 反代。

---

## 4. 开发注意事项

### 4.1 文案与品牌

- 顾问页面向用户的展示文案用 **YMeng CC**，不要再写“New API”（面向用户展示）；插件 README/metadata/schema/.env.example 同理。
- 不要改动项目受保护的 `new-api` / `QuantumNous` 技术标识：版权头、Go module 路径、Docker 镜像名、CI 引用、包/目录名、README 中上游项目署名等。用户要求替换的是**顾问页与插件文档中的展示文案**，不等于改这些技术标识。
- 功能说明改动必须同步两边：顾问页 `feature-overview-card.tsx` 与插件 `help_command` / README；以插件实际行为为准，不要写超出能力一致。

### 4.2 前端

- 改顾问页前先读仓库根目录 `AGENTS.md` 和 `web/AGENTS.md`；优先复用 `Card`、`IconBadge`、`Button`、`CurrencyAmount` 等现有组件。
- 用 bun：`bun run typecheck`、`bun run build`；构建后用字符串检查产物确实包含新文案。
- 新增页面入口时要同时检查个人资料下拉、侧边栏数据、用户侧边栏开关、管理员侧边栏开关，避免一处能进一处看不到。
- `routeTree.gen.ts` 由 TanStack Router 插件生成，不要手改。
- 当前顾问页中文文案为硬编码；新增通用 UI 文本按项目规范应支持 i18n，但修改既有功能说明时以保持同一风格和不破坏展示为前提。

### 4.3 插件

- 命令注册用 `@filter.command("签到")`，**不带 `/`**；AstrBot 会自动加全局唤醒前缀。别加 `help` 别名，避免与内置指令冲突。
- 命令处理器必须是 async generator，统一 `yield event.plain_result(...)`；`event` 之后的形参必须有默认值。
- 不要依赖热重载；改完插件重启 AstrBot，并用命令注册表自检确认 `签到`、`帮助` 已注册。
- KV 写入用 `asyncio.Lock`，网络调用不要放在锁内；发奖/扣款这类会改变额度的操作必须有 pending 或幂等保护。
- 时间统一显式指定 `ZoneInfo("Asia/Shanghai")`，不要依赖数据库/容器时区；`/api/log/stat` 的结束时间是含端点的 `今日00:00 - 1秒`。
- 金额换算统一走 `main.py` 里已有的 `_quota_factor`、`_quota_from_display`、`_format_amount`；签到额外用 `_display_from_quota`、`_format_reward`。

### 4.4 发布与部署

- 插件改动：先备份插件目录，写入文件，执行 `python3 -m py_compile` 和 JSON 校验，重启容器，查日志确认版本与 8099 启动正常。
- 前端改动：走正式 tag 发布。`VERSION` 与 `.github/update-compatibility.json` 必须和 tag 一致，`from_versions` 写上当前线上版本；push 分支和 annotated tag。
- 必须等 `Managed update image release` 成功，且 Release 含 `update-manifest.json` / `.sig`、控制器 `/v1/releases` 显示 `compatible:true`，才算线上更新器就绪。`Publish Docker image (Multi-arch)` 因无 Docker Hub 凭据失败是已知现象，与托管更新无关。
- 安装走后台“系统更新”或更新控制器 `/v1/update`；两者后端步骤相同。安装后核对 `/api/status` 版本、运行容器镜像 digest、控制器 `current_version`。
- **注意**：`/opt/newapi/.env` 里的 `UPDATE_CURRENT_VERSION` 和 `NEW_API_IMAGE` 仍是历史旧值（`v1.2.17` / `b54159f1...`）。真实状态以控制器 state 和运行容器为准。不要直接 `docker compose up -d`，否则可能用旧镜像重建导致降级；如需执行，先把这两个键改为当前版本和当前 digest。

---

## 5. 常用验证

命令注册自检（容器内）：

```bash
docker exec astrbot-astrbot_x4s3-1 sh -lc 'python - <<"PY"
import sys
sys.path.insert(0, "/AstrBot")
import importlib
importlib.import_module("data.plugins.astrbot_plugin_newapi_qq.main")
from astrbot.core.star.star_handler import star_handlers_registry
from astrbot.core.star.filter.command import CommandFilter
for h in star_handlers_registry:
    if "newapi_qq" in (h.handler_module_path or ""):
        names = []
        for f in h.event_filters:
            if isinstance(f, CommandFilter):
                names += f.get_complete_command_names()
        print(h.handler_name, names)
PY'
```

行为回归用 fake event + 桩客户端在容器内跑，不要对真实用户额度直接测成功路径；真实接口只测“未达标签到”这类不发奖路径。

页面验收：打开 `https://ymeng.cc/advisor`，确认功能一览第一条是 `/帮助`，随后是签到、发红包、余额查询；文案与 `/帮助`、签到、红包实际行为逐条对照。

发布验收：确认 `Managed update image release` run 成功〄Release 资源齐全、签名验证通过、控制器 `compatible:true`、安装后 `/api/status` 报告新版本。

---

## 6. 相关记忆

- `[[qq-bot-napcat-deployment]]`：NapCat/AstrBot 容器、域名、扫码登录。
- `[[newapi-deploy-workflow]]`：managed 蓝绿发布流程。
- `[[newapi-managed-release-ops]]`：GHCR 小写、签名密钥、已知坑。
- `[[server-storage-layout]]`：服务器磁盘布局。
