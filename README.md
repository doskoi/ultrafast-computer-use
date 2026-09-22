# Ultrafast Computer Use Assistant

这是一个独立、可复用的 Computer Use 导航库。它读取 OpenAI Computer Use 的无障碍树，把当前
`element_index` 转成有限动作空间，再让本地 Laya Ultrafast 判断下一步操作及目标。

设计参考 `browser-use/jev-ultrafast` 的
[`1231850a`](https://github.com/browser-use/jev-ultrafast/tree/1231850a0bf1a0c0341fe408ef1668dbbfdfac46)：

- 每一步都从当前完整无障碍树重新生成动作空间；
- 一次 System One 请求同时判断操作、各操作的候选目标和完成状态；
- 代码只校验并读取被选中操作对应的目标分支；
- 执行前再次读取完整页面，页面变化就拒绝使用旧索引。

Ultrafast 不操作界面。Computer Use 负责观察和执行，Ultrafast 只从代码给出的当前候选里做语义判断。
具体调用在 `UltrafastPolicy.decide()`：通过本地 `laya-mlx` 的 Python worker 执行 typed decision。

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
使用 `aac6fef/laya-multilingual-mlx`，首次加载可能从 Hugging Face 下载权重。决策请求始终发给本地
`laya-mlx` worker，不调用任何远程决策 API；要做到完全离线，先下载权重并使用本地目录。

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

skill 会把当前完整 AX 状态写入权限为 `0600` 的随机临时文件，再调用本地 `laya-mlx` worker。
worker 常驻在一次 Node 进程内，模型只加载一次；请求结束后临时文件立即删除，AX 数据不会发送到
其它远程 API。

没有本地模型、本地 Laya 请求失败、结果概率不足或页面已经变化时，skill 会回退到 Computer Use 自己的
本地判断。Ultrafast 不会取代 Computer Use 的执行确认。

这个自动范围依赖 Codex 的全局指令和 skill 发现机制。其他不读取 `~/.codex/AGENTS.md` 与
`~/.codex/skills` 的 Agent 运行时不会因此自动接入；它们需要在自己的 Computer Use 工具层调用本库。

### 代码调用

当前 `cua` 运行时会通过 `cua.getApp()` 或 `cua.getTab()` 返回 app/tab binding。把 binding 注入
`CuaComputer`，不要把业务项目耦合到这个仓库：

```js
const { CuaComputer, ComputerUseAssistant, UltrafastPolicy } =
  await import("file:///Users/sj/projects/ultrafast-computer-use/dist/index.js");

const app = await cua.getApp("Preview");
const assistant = new ComputerUseAssistant(
  new CuaComputer(app, "Preview"),
  new UltrafastPolicy(),
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

测试范围和实时验证记录见 [docs/validation.md](docs/validation.md)。
