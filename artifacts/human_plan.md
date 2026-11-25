# 萌萌的安全小屋：带签名思考内容透传（工程师执行计划）

## 文档信息

- 受众：工程师
- 覆盖章节：设计、测试
- 排除章节：风险（按用户选择不设独立风险章节；安全边界与已知限制并入设计与测试）
- 状态：已执行并验证

## 用户选择

- 目标受众：工程师
- 必需章节：设计、测试
- 排除章节：风险

## 问题机制（同时适用于普通对话与计划模式）

本问题机制同时适用于普通对话与计划模式：无论当前是否处于计划模式，只要执行前存在必须由用户确认的关键输入——例如目标范围、操作对象、交付格式、验收口径，或存在会明显返工、影响现网数据/配置的选择——都应先向用户提问，再开始执行。普通对话中可以直接在回复正文追问；计划模式中则把问题写入计划文件、调用计划提交并等待批准，批准后才创建任务、写文件或调用会产生副作用的工具。

## 计划要求（完整列出本次已批准要求）

1. 批准前不得创建 Agent 或任务条目、写交付物、交付文件，也不得写计划文件之外的任何内容。
2. 批准后必须创建执行者自己的 Task 条目，用于记录和跟踪执行。
3. 批准后必须写入 `artifacts/human_plan.md`，写明目标受众（工程师）、选择章节（设计与测试）以及本批准计划中的每一条要求，不得省略。
4. `artifacts/human_plan.md` 面向工程师编写，条款必须清晰、可验证。
5. 文件必须明确说明上述问题机制同时适用于普通对话与计划模式。
6. 写入后必须读回 `artifacts/human_plan.md`，核验用户选择、全部批准要求以及第 5 条说明。
7. 核验后必须通过 `present_files` 交付 `artifacts/human_plan.md`。
8. 若范围需要实质变化，必须停止执行，更新计划文件并重新调用 `submit_plan`，向用户说明变化并等待批准后再继续。

## 1. 设计

### 1.1 根因

本机脱敏与网关脱敏共用 `textmask`。当前实现把“带签名”的思考内容当作普通可改写文本处理：

- Claude 请求中的 `thinking` 内容块一旦带非空 `signature`，`maskClaudePart` 返回 `ErrUnsupported`；Claude 响应中的 `thinking` 块、SSE `content_block_start` 的 `thinking`、`content_block_delta` 的 `thinking_delta` / `signature_delta` 也直接拒绝。
- Gemini 的 part 只要同时含 `text` 和非空 `thoughtSignature`，请求侧仍会对 `text` 做脱敏，响应侧 `restoreGeminiPart` 直接返回 `ErrUnsupported`。
- `RestoreJSON` / `RestoreEvent` 末尾使用原始字节 `bytes.Contains(result, s.prefix)` 扫描残留占位符。即使签名块被有意跳过，签名块内的占位符仍会被该字节扫描误判为“未还原”，导致整单 `ErrIncomplete`。

因此，问题不是脱敏规则本身，而是：(1) 签名内容与普通文本共用同一条脱敏/还原路径；(2) 残留检查没有按结构区分“允许保留占位符的签名子树”。

### 1.2 目标行为

- 带签名的 Claude `thinking` 块整体视为不透明内容：请求历史、非流式响应、SSE 事件均不脱敏、不还原、不改写 `thinking` 与 `signature`。
- 带签名的 Gemini thought 文本整体视为不透明内容：请求历史、非流式响应、SSE 事件均不脱敏、不还原。
- 脱敏只作用于普通文本字段与函数工具字段；普通文本请求、非流式响应、SSE 文本 delta 的既有行为保持不变。
- 签名内容中的占位符允许原样保留，不得被残留扫描误拦截；普通文本/工具参数中未还原的占位符仍必须 fail-closed。
- 界面文案不再声称“签名推理不支持”，改为说明带签名思考内容会原样透传、不参与脱敏。

### 1.3 Claude 设计

- 请求侧 `maskClaudePart`：
  - `type:"thinking"` 仍只允许 `type`、`thinking`、`signature`、`cache_control` 字段；`cache_control` 继续剥离。
  - `signature` 非空时，仅校验 `signature` 和 `thinking` 的类型/长度/本层 marker 约束，不调用 `maskString` 改写 `thinking`；`signature` 本身保持不变。
  - 无签名或 `signature` 为空的 `thinking` 保持旧行为：对 `thinking` 做可逆脱敏。
  - `signature` 非字符串、超限或包含本层 marker 时继续 fail-closed。
- 顶层请求参数 `thinking`：
  - 允许 `type` 为 `disabled`、`enabled`、`adaptive`。
  - 仍只允许 `budget_tokens`、`display`；`display` 仍限定 `summarized` / `omitted`；`budget_tokens` 仍限定数值。
  - 这是为了不拦截 Claude Code / Claude Messages 的合法扩展思考参数；参数本身不承载可脱敏文本。
- 响应侧 `restoreContent`：
  - `type:"thinking"` 白名单为 `type`、`thinking`、`signature`。
  - `signature` 非空时，仅做类型/长度校验，`thinking` 原样保留，不建立还原 lane。
  - 无签名时保持旧行为，对 `thinking` 执行 `restoreField`。
- SSE `content_block_start`：
  - `content_block.type:"thinking"` 且 `signature` 非空时，原样透传 `thinking` 与 `signature`。
  - 无签名时保持旧行为。
- SSE `content_block_delta`：
  - `thinking_delta` 不再拒绝，校验 `thinking` 为字符串后原样透传；不建立 thinking lane，也不做 pending 检查。
  - `signature_delta` 不再拒绝，校验 `signature` 为不透明字符串（长度、marker）后原样透传。
  - `text_delta` 仍按 `claude/<index>/text` 车道还原；`input_json_delta` 仍按工具参数车道还原。
- `redacted_thinking` 的不透明 `data` 行为不变。

### 1.4 Gemini 设计

- 请求侧 `maskGeminiPart`：
  - part 含 `text` 且 `thoughtSignature` 非空时，校验 `text` 为字符串后直接返回，不脱敏 `text`；`thoughtSignature` 仍按不透明字段校验。
  - part 含 `text` 但无签名/签名为空时，保持旧行为，对 `text` 做可逆脱敏。
  - `functionCall` / `functionResponse` 的既有工具参数脱敏逻辑不变；`functionCall` 同时带 `thoughtSignature` 的工具参数处理明确不在本次“thought 文本透传”范围内，保持现有掩码/还原行为。
- 响应侧 `restoreGeminiPart`：
  - part 含 `text` 且 `thoughtSignature` 非空时，校验 `text` 为字符串后直接返回，既不还原 `text`，也不建立 text lane。
  - 无签名的 `text` 保持旧行为，执行 `restoreField`。
  - `functionCall.args` 的既有还原逻辑不变。
- Gemini SSE 复用同一 `restoreGeminiPart`，因此非流式响应与流式候选 chunk 都遵循同样的“签名文本整块跳过”规则。

### 1.5 残留占位符扫描

- 用结构化扫描替换 `bytes.Contains(result, s.prefix)`：
  - `hasResidualPlaceholder(object)` 递归遍历 JSON 对象、数组、字符串。
  - 字符串叶子命中本层 `s.prefix` 才判定为残留。
  - 遇到不透明对象时整棵子树跳过：
    - Claude `type:"thinking"` 且 `signature` 非空；
    - Claude `type:"thinking_delta"`、`type:"signature_delta"`；
    - Gemini 同时含 `text` 与非空 `thoughtSignature` 的对象。
  - 普通文本、普通工具参数、普通 SSE delta 仍需检测；未还原即返回 `ErrIncomplete`。
- 解析失败或无法判断的原始值按 fail-closed 返回残留，宁可阻断也不放行半还原内容。
- 该扫描只改变“是否误报”，不改变任何脱敏/还原结果。

### 1.6 文案与 i18n

- `safehouse/internal/local/proxy.go`：`messageUnsupported` 去掉“签名推理不支持”，改为“带签名的思考内容会原样透传”。
- `safehouse/internal/local/panel/index.html`、`panel/panel.js`：`limitTools` 改为“带签名的思考内容会原样透传、不参与脱敏；图片、音频、服务端会话状态、原生/服务端工具仍拦截”。
- `web/src/features/security/components/mengmeng-local-mode.tsx`：说明带签名 thinking/thought 原样透传、不脱敏。
- `web/src/features/security/components/mengmeng-gateway-mode.tsx`：不支持项移除 signed reasoning，新增“签名思考内容原样透传”的说明。
- 7 个前端 locale 文件（en、zh、zh-TW、fr、ru、ja、vi）同步替换旧英文 key 及对应译文，删除“signed reasoning blocked”旧文案。
- `i18n/locales/{en,zh-CN,zh-TW}.yaml` 的 `privacy.unsupported_request` 同步更新。
- 不改变 `middleware/text_masking.go` 的调用逻辑与既有固定端点/`store:true` 等安全策略。

### 1.7 边界与已知限制

- 带签名的 Claude `thinking` 与 Gemini thought 文本绝不改写；即使其中含敏感实体或本层占位符，也原样透传。
- 无签名的 Claude `thinking`、Gemini thought 文本仍按普通文本脱敏/还原，保持旧行为。
- Gemini `functionCall` 同时带 `thoughtSignature` 时，当前仍按工具参数掩码/还原处理；如果上游签名覆盖 `args`，该场景可能因改写参数而校验失败。本次明确只修“thought 文本”透传，不扩大该工具参数路径的范围。
- 媒体、服务端会话状态、原生/服务端工具继续 fail-closed。
- 结构化残留扫描会跳过被认定为签名的对象；恶意构造的非签名对象若伪装成 `thinking_delta` 等结构，应由上游结构校验先行拒绝，不能借此绕过普通文本检查。

## 2. 测试

### 2.1 `textmask/masking_test.go`

沿用现有测试文件，新增 `TestSignedReasoningPassThrough`，至少覆盖：

1. Claude 非流式响应：`thinking` 带非空 `signature` 且内容含本层占位符；断言 `thinking` 与 `signature` 原样保留，同一响应中的普通 `text` 正常还原。
2. Claude 请求历史：assistant `content` 中 `thinking` + `signature` 含敏感明文；断言请求脱敏后签名块内明文不变，普通 user 文本仍被脱敏。
3. Claude 顶层 `thinking` 参数：`enabled`（含 `budget_tokens`/`display`）与 `adaptive` 均被接受；非法类型/非法字段继续 `ErrUnsupported`。
4. Claude SSE：`content_block_start` 的签名 `thinking`、`thinking_delta`、`signature_delta` 原样透传；同流 `text_delta` 的占位符正常还原。
5. Gemini 非流式响应：part 同时含 `text` 与非空 `thoughtSignature`；断言 thought 文本保留占位符，另一普通 text part 正常还原。
6. Gemini 请求历史：model part 的签名 thought 文本中的敏感明文不被脱敏，普通 user part 仍被脱敏。
7. Gemini SSE：签名 thought chunk 原样透传，普通 text chunk 正常还原，`finishReason` 后正常 `Finish`。
8. 负向畸形签名块：Claude `signature` 非字符串、签名块多余字段、Gemini `thoughtSignature` 非字符串、签名 part 多余字段，均返回 `ErrUnsupported`；不得因为“签名透传”而放宽结构校验。
9. 普通文本回归：现有 `TestAgentToolContracts` 与文本/工具用例继续通过，确认普通文本脱敏与工具参数还原没有变化。

### 2.2 `safehouse/internal/local/local_test.go`

新增端到端用例，通过本地代理实际跑两份带签名响应：

- Claude `/v1/messages`：上游返回带 `signature` 的 `thinking` 块与普通 `text`；断言上游请求体无明文、响应中签名 thinking 保留本地占位符、普通 text 在本机还原。
- Gemini `/v1beta/models/gemini-pro:generateContent`：上游返回带 `thoughtSignature` 的 thought part 与普通 text part；断言签名 thought 原样透传、普通 text 在本机还原，HTTP 200 且无错误事件。
- 现有 Agent 工具、SSE 分片、阻断、配对、模型列表用例全部保留。

### 2.3 其他验证

- `textmask` 模块：`go test ./...`，新增测试与旧测试全部通过。
- `safehouse` 模块：`go test ./...`、`go build ./...`、五平台 `cmd/pack`。
- 根模块：`go build ./...`、`go test ./middleware -run TestTextMasking`。
- 前端：`node scripts/sync-i18n.mjs`、`tsgo -b`、相关 vitest；确认 7 个 locale 的旧 key 已删除、新 key 齐全。
- 对修改过的 Go 文件执行 `gofmt -w`。

## 3. 验收标准

- 带签名的 Claude `thinking` 在请求历史、非流式响应、SSE 中均不再返回 `ErrUnsupported`，且 `thinking` / `signature` 字节内容不被脱敏或还原。
- 带签名的 Gemini thought `text` 在请求历史、非流式响应、SSE 中均不再返回 `ErrUnsupported`，且 `text` 不被脱敏或还原。
- 签名内容中的本层占位符不会被残留扫描误判为 `ErrIncomplete`；普通文本中的未还原占位符仍会 fail-closed。
- 普通文本、普通工具调用/工具结果的脱敏与还原行为与修改前一致。
- `textmask`、`safehouse` 独立模块测试/构建通过；safehouse 五平台打包通过；根模块构建与中间件测试通过；前端类型检查与相关测试通过。
- 文案与 i18n 不再声称签名推理被拦截，明确说明签名思考内容原样透传。
- `artifacts/human_plan.md` 已读回核验并已通过 `present_files` 交付。
