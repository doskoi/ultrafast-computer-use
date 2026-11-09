# Ultrafast Computer Use Assistant

这是一个独立、可复用的 Computer Use 导航库。它读取 OpenAI Computer Use 的无障碍树，把当前
`element_index` 转成有限动作空间，再让配置的 Jev/Laya provider 判断下一步操作及目标。

设计参考 `browser-use/jev-ultrafast` 的
[`1231850a`](https://github.com/browser-use/jev-ultrafast/tree/1231850a0bf1a0c0341fe408ef1668dbbfdfac46)：

- 每一步都从当前完整无障碍树重新生成动作空间；
- 第一次 System One 请求用 `Choice` 判断操作、用 `Noul` 判断完成状态；
- 如果操作需要目标，第二次请求只给该操作的候选目标，避免无关目标分支扩大 token；
- 执行前再次读取完整页面，页面变化就拒绝使用旧索引。

Ultrafast 不操作界面。Computer Use 负责观察和执行，Ultrafast 只从代码给出的当前候选里做语义判断。
具体调用在 `DualPolicy.decide()`：默认只用远程 Jev；只有显式配置 Laya 时才启用 failback。两者都只负责语义判断，
不会绕过 Computer Use 的执行确认。

## 安装

需要 Node.js 20 或更新版本，以及 Apple Silicon 上的 Python 3.11+、`uv` 和本地
[`laya-mlx`](https://github.com/mizorewww/laya-mlx) checkout：

```bash
cd /Users/sj/projects/laya-mlx
uv sync

# 机器级配置写入 ~/.config/ultrafast/laya.env；Computer Use skill 会自动加载它。
export LAYA_MLX_PATH=/Users/sj/projects/laya-mlx
export LAYA_MLX_PYTHON=/Users/sj/projects/laya-mlx/.venv/bin/python
export LAYA_MLX_MODEL=aac6fef/laya-multilingual-mlx

cd /Users/sj/projects/ultrafast-computer-use
npm install
npm run build
```

`LAYA_MLX_PATH` 让 Python worker 能找到本地 checkout，`LAYA_MLX_PYTHON` 指定安装了
`laya-mlx` 的 Python 环境。`LAYA_MLX_MODEL` 可以是本地 checkpoint 目录或 model ID；如果省略，默认
使用 `aac6fef/laya-multilingual-mlx`，首次加载可能从 Hugging Face 下载权重。选择 Laya 时请求始终发给本地
`laya-mlx` worker；要做到完全离线，保持 `ULTRAFAST_SECONDARY_PROVIDER=none`，先下载权重并使用本地目录。

### Dual provider

默认只启用 `jev`，不配置 secondary。`ULTRAFAST_SECONDARY_PROVIDER` 未设置时没有 failback，
也不会自动选择另一个 provider；需要本地回退时显式设置为 `laya`。主 provider 不可用、返回
`BLOCKED`，或执行概率低于 `0.55` 时，只尝试一次显式配置的另一个 provider；如果 failback 也不可用，
调用方继续走本地 Computer Use 判断。可以通过环境变量切换：

```bash
export ULTRAFAST_PRIMARY_PROVIDER=jev
# 不设置 SECONDARY：没有 failback
# export ULTRAFAST_SECONDARY_PROVIDER=laya
# 只使用本地 Laya：
# export ULTRAFAST_PRIMARY_PROVIDER=laya
# export ULTRAFAST_SECONDARY_PROVIDER=none
```

`ULTRAFAST_SECONDARY_PROVIDER=none` 可关闭 failback；也接受兼容名称
`ULTRAFAST_FAILBACK_PROVIDER`。`ULTRAFAST_FALLBACK_THRESHOLD` 和
`ULTRAFAST_COMPLETION_THRESHOLD` 分别控制弱操作与弱 DONE 结果何时切换。

Jev 是 TypeSafe 远程 provider，需要 `TYPESAFE_API_KEY`，默认主用会把当前 AX 文本发送到该服务。
不要把密钥提交到仓库或普通配置；
Computer Use skill 可从权限为 `0600` 的 `~/.config/ultrafast/jev.env` 加载它：

```bash
mkdir -p ~/.config/ultrafast
chmod 700 ~/.config/ultrafast
printf '%s\n' 'export TYPESAFE_API_KEY=...' > ~/.config/ultrafast/jev.env
chmod 600 ~/.config/ultrafast/jev.env
```

如果不希望把页面内容发送到远程服务，请显式设置 `ULTRAFAST_PRIMARY_PROVIDER=laya` 和
`ULTRAFAST_SECONDARY_PROVIDER=none`；这样决策只在本地完成。

### Agent runtime configuration

不要只在某个终端临时执行 `export`：已经启动的 Codex/ChatGPT 进程不会继承之后的 shell 环境。
在本机创建 `~/.config/ultrafast/laya.env`，写入上述三个变量。安装的 skill 入口会在每次决策前
显式加载这份文件；交互式登录 shell 也会加载它，因此 `ultrafast-computer-use` 和
`ultrafast-android-assistant` 共用同一份 Laya 配置。可通过 `ULTRAFAST_LAYA_ENV_FILE` 指定其他
配置文件。该文件只应保存本机路径和模型配置，不要放凭据。

## 在 Computer Use 中使用

### 自动优先使用

仓库包含一个可隐式触发的 Codex skill：`skills/ultrafast-computer-use`。本机通过符号链接安装到：

```text
/Users/sj/.codex/skills/ultrafast-computer-use
```

这是机器级规则，不属于某个会话或某一个 Agent。任何读取同一 `CODEX_HOME` 的 Codex Agent 或
subagent，只要通过 Computer Use 操作原生应用或浏览器，就应自动发现并优先应用该 skill；用户不需要
在每个任务里再次指定。`~/.codex/AGENTS.md` 保存这条全局指令，skill 的
`allow_implicit_invocation: true` 允许自动选择。

skill 会把当前完整 AX 状态写入权限为 `0600` 的随机临时文件，再调用配置的决策 provider。
默认选择 Jev 时，AX 文本会发送到 TypeSafe 远程服务。选择 Laya 时，worker 在同一次 Node 进程内复用模型；
当前 `decide-file` 入口每次启动新的 Node 进程，这种复用不跨调用。请求结束后临时文件立即删除。
含敏感内容的页面应显式设置 `ULTRAFAST_PRIMARY_PROVIDER=laya` 和 `ULTRAFAST_SECONDARY_PROVIDER=none`，
让决策只在本地完成。

主 provider 不可用或结果概率不足时，最多尝试一次配置的备用 provider；两者都无法给出有效结果，
或页面已经变化时，skill 会回退到 Computer Use 自己的本地判断。Ultrafast 不会取代 Computer Use 的执行确认。

这个自动范围依赖 Codex 的全局指令和 skill 发现机制。其他不读取 `~/.codex/AGENTS.md` 与
`~/.codex/skills` 的 Agent 运行时不会因此自动接入；它们需要在自己的 Computer Use 工具层调用本库。

### 代码调用

当前 `cua` 运行时会通过 `cua.getApp()` 或 `cua.getTab()` 返回 app/tab binding。把 binding 注入
`CuaComputer`，不要把业务项目耦合到这个仓库：

```js
const { CuaComputer, ComputerUseAssistant, DualPolicy } =
  await import("file:///Users/sj/projects/ultrafast-computer-use/dist/index.js");

const app = await cua.getApp("Preview");
const assistant = new ComputerUseAssistant(
  new CuaComputer(app, "Preview"),
  new DualPolicy(),
);

// 默认只建议，不执行。
const suggestion = await assistant.step("打开第一份报告，看到报告标题后停止");

// 调用方明确进入执行路径后，仍由 Computer Use 运行时执行并应用其确认规则。
const result = await assistant.step(
  "打开第一份报告，看到报告标题后停止",
  { execute: true },
);
```

上面的 `file://` 示例指向本机 checkout 的绝对路径，只适用于该路径存在的机器。若调用方已经通过
本地依赖安装或 link 了本包，应改用 `import { ... } from "ultrafast-computer-use"`；换机器时也要把
路径改成实际的 `dist/index.js` 位置。

仓库也提供 `SkyComputer`，适配直接注入的 `@oai/sky` 对象：

```js
const { sky } = await import("@oai/sky");
const computer = new SkyComputer(sky, "Preview");
```

### CUA Driver 与 agent-desktop

`CuaDriverComputer` 直接调用本机的 `cua-driver` CLI（默认
`/Applications/CuaDriver.app/Contents/MacOS/cua-driver`，可用 `CUA_DRIVER_BIN` 覆盖）。
它按 `pid` + `windowId` 读取窗口，保留 cua-driver 的 `element_index`：

```js
const { CuaDriverComputer } = await import("file:///Users/sj/projects/ultrafast-computer-use/dist/index.js");
const computer = new CuaDriverComputer({ pid: 2221, windowId: 14328, app: "Calculator" });
```

`AgentDesktopComputer` 调用 `agent-desktop` CLI（默认从 `PATH` 查找，可用
`AGENT_DESKTOP_BIN` 覆盖），按应用名读取；存在多个窗口时传 `windowId`：

```js
const { AgentDesktopComputer } = await import("file:///Users/sj/projects/ultrafast-computer-use/dist/index.js");
const computer = new AgentDesktopComputer({ app: "Calculator" });
```

两个适配器都会排除菜单栏和安全策略拦截的元素，执行前重新快照并比对 fingerprint。CLI 提供同样的
入口，便于在 shell 里直接跑一步：

```bash
source ~/.config/ultrafast/jev.env

ultrafast-computer-use run --driver cua-driver \
  --pid 2221 --window-id 14328 --app Calculator \
  --goal "Click the 7 button" --execute --max-steps 1

ultrafast-computer-use run --driver agent-desktop \
  --app Calculator --goal "Click the 7 button" --execute --max-steps 1
```

`run` 不加 `--execute` 时只返回建议；`--max-steps` 控制自动执行的上限，达到上限会返回
`blocked`。两个驱动都走同一套 `DualPolicy`（默认只用 Jev；显式配置 Laya 才回退）。

## 执行边界

第一版只支持 `CLICK`、四向 `SCROLL`、`WAIT`、`DONE` 和 `BLOCKED`。它不提供文本输入、粘贴、
拖拽、快捷键、二级动作或坐标点击。模型不会收到截图、坐标或命令；无障碍文本中的常见坐标、
手机号、邮箱和长 token 会先清理。

登录、同意、保存、提交、发送、上传、删除、购买、订阅、授权、设置变更等明显写操作不会进入
候选动作空间。这层过滤是额外保护，不能替代 Computer Use 自己的确认机制。库不会压掉、代答或
绕过运行时确认；新增写能力时应由调用方在动作发生前走原有确认流程。

自动执行默认要求操作和目标的最低概率都达到 `0.55`。`DONE` 同时要求操作概率达到该阈值，
完成判断达到 `0.85`。这些是保守初值，应使用真实导航轨迹评估后再调整。

真实 CUA 的无障碍树可能使用 `8 link Learn more` 这样的编号行，而不是带句点的编号。解析器只会把
当前树中可确认的交互角色提升为候选；每次执行前仍必须重新抓取完整 AX 树并通过 freshness 校验。
不要把包含私信、文件、账户或其它敏感内容的 AX 树发送给本地模型以外的服务，也不要把真实 AX dump
或截图提交到 Git。

## 验证

```bash
npm run check
```

测试范围和实时验证记录见 [docs/validation.md](docs/validation.md)。目标选择采用两阶段 typed decision，
并使用选项概率和置信度作为执行前的安全信号。
