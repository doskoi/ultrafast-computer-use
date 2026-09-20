# Jev Computer Use Assistant

这是一个独立、可复用的 Computer Use 导航库。它读取 OpenAI Computer Use 的无障碍树，把当前
`element_index` 转成有限动作空间，再让 TypeSafe Jev 判断下一步操作及目标。

设计参考 `browser-use/jev-ultrafast` 的
[`1231850a`](https://github.com/browser-use/jev-ultrafast/tree/1231850a0bf1a0c0341fe408ef1668dbbfdfac46)：

- 每一步都从当前完整无障碍树重新生成动作空间；
- 一次 System One 请求同时判断操作、各操作的候选目标和完成状态；
- 代码只校验并读取被选中操作对应的目标分支；
- 执行前再次读取完整页面，页面变化就拒绝使用旧索引。

Jev 不操作界面。Computer Use 负责观察和执行，Jev 只从代码给出的当前候选里做语义判断。
具体调用在 `JevPolicy.decide()`：通过官方 JavaScript SDK 执行 `TypeSafeClient.systemOne()`。

## 安装

需要 Node.js 20 或更新版本：

```bash
npm install
npm run build
export TYPESAFE_API_KEY='<只放在本机环境变量>'
```

如果 key 在交互式 zsh 中只是 shell 变量、尚未 export 给子进程：

```bash
/bin/zsh -ic 'export TYPESAFE_API_KEY; cd /Users/sj/projects/jev-computer-use && \
  node examples/live-jev-smoke.mjs'
```

## 在 Computer Use 中使用

### 自动优先使用

仓库包含一个可隐式触发的 Codex skill：`skills/jev-computer-use`。本机通过符号链接安装到：

```text
/Users/sj/.codex/skills/jev-computer-use
```

全局 `~/.codex/AGENTS.md` 也要求 Computer Use 优先应用该 skill。它会把当前完整 AX 状态写入权限为
`0600` 的随机临时文件，再通过交互式 zsh 读取并导出已有的 `TYPESAFE_API_KEY`，调用
`TypeSafeClient.systemOne()`。请求结束后临时文件立即删除，key 不会打印或写入文件。

没有 key、Jev 请求失败、页面含有不应发送给第三方的敏感数据、结果概率不足或页面已经变化时，
skill 会回退到 Computer Use 自己的本地判断。Jev 不会取代 Computer Use 的执行确认。

### 代码调用

当前 `cua` 运行时会通过 `cua.getApp()` 或 `cua.getTab()` 返回 app/tab binding。把 binding 注入
`CuaComputer`，不要把业务项目耦合到这个仓库：

```js
const { CuaComputer, ComputerUseAssistant, JevPolicy } =
  await import("file:///Users/sj/projects/jev-computer-use/dist/index.js");

const app = await cua.getApp("Preview");
const assistant = new ComputerUseAssistant(
  new CuaComputer(app, "Preview"),
  new JevPolicy(),
);

// 默认只建议，不执行。
const suggestion = await assistant.step("打开第一份报告，看到报告标题后停止");

// 调用方明确进入执行路径后，仍由 Computer Use 运行时执行并应用其确认规则。
const result = await assistant.step(
  "打开第一份报告，看到报告标题后停止",
  { execute: true },
);
```

仓库也提供 `SkyComputer`，适配直接注入的 `@oai/sky` 对象：

```js
const { sky } = await import("@oai/sky");
const computer = new SkyComputer(sky, "Preview");
```

## 执行边界

第一版只支持 `CLICK`、四向 `SCROLL`、`WAIT`、`DONE` 和 `BLOCKED`。它不提供文本输入、粘贴、
拖拽、快捷键、二级动作或坐标点击。模型不会收到截图、坐标或命令；无障碍文本中的常见坐标、
手机号、邮箱和长 token 会先清理。

登录、同意、保存、提交、发送、上传、删除、购买、订阅、授权、设置变更等明显写操作不会进入
候选动作空间。这层过滤是额外保护，不能替代 Computer Use 自己的确认机制。库不会压掉、代答或
绕过运行时确认；新增写能力时应由调用方在动作发生前走原有确认流程。

自动执行默认要求操作和目标的最低概率都达到 `0.55`。`DONE` 同时要求操作概率达到该阈值，
完成判断达到 `0.85`。这些是保守初值，应使用真实导航轨迹评估后再调整。

## 验证

```bash
npm run check
```

测试范围和实时验证记录见 [docs/validation.md](docs/validation.md)。
