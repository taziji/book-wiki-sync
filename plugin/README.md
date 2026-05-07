# Book Wiki Sync

An Obsidian community plugin for PDF book-to-wiki workflows. It sends PDF books to a Cloudflare Worker for Chinese Obsidian-style LLM wiki generation, syncs your vault with Cloudflare R2, and can mark Markdown chapters as read.

中文说明见下方：[中文文档](#中文文档)

## Features

- Mark Markdown files as read/unread from the file explorer context menu.
- Rename chapters using a suffix: `第15章.md` → `第15章 ✅.md`.
- Right sidebar panel showing the active file and read/unread actions.
- Manual and automatic two-way sync with Cloudflare R2.
- Right-click a `.pdf` book and send it to a Worker for LLM wiki generation.
- Worker-generated output is copied to your vault R2 bucket, then pulled into Obsidian through sync.

## Repository Layout

This project currently has two parts:

```text
book-wiki-sync/
├── main.ts                 # Obsidian plugin entry
├── src/                    # Plugin modules
├── manifest.json
├── package.json
└── README.md

../book-wiki-worker/
├── src/                    # Cloudflare Worker service
├── wrangler.toml
├── package.json
└── tsconfig.json
```

## Obsidian Plugin Setup

### Build

```bash
npm install
npm run build
```

### Local Installation

Copy these files into your vault plugin folder:

```bash
mkdir -p /path/to/your-vault/.obsidian/plugins/book-wiki-sync
cp main.js manifest.json styles.css /path/to/your-vault/.obsidian/plugins/book-wiki-sync/
```

Restart Obsidian, then enable **Book Wiki Sync** under **Settings → Community plugins**.

## Read Marker Usage

Right-click a Markdown file in the file explorer:

- **Mark as read** renames `第15章.md` to `第15章 ✅.md`
- **Mark as unread** renames `第15章 ✅.md` to `第15章.md`

Commands:

- `Toggle chapter read status`
- `Open Book Wiki Sync panel`

## R2 Vault Sync

Plugin settings:

- **Endpoint URL**: Cloudflare R2 S3 endpoint, e.g. `https://<account-id>.r2.cloudflarestorage.com`
- **Access Key ID**
- **Secret Access Key**
- **Bucket Name**
- **Auto-sync**
- **Auto-sync debounce**

Commands:

- `Sync vault to R2`
- `Upload current file to R2`

## Book Wiki Worker

The worker receives PDF uploads, converts them to Markdown-ish `source.md`, splits chapters, calls an OpenAI-compatible LLM endpoint, and generates a Chinese Obsidian wiki.

Output structure:

```text
Book Title/
├── 第01章.md
├── 第02章.md
└── wiki/
    ├── characters/
    ├── themes/
    ├── places/
    ├── parts/
    ├── index.md
    └── log.md
```

### Worker Architecture

The Worker uses Cloudflare Queues. Each queue message performs one bounded task:

- extract book text
- detect title
- process one chapter
- extract one entity type
- generate one entity page
- generate part pages
- generate index/log
- copy output to vault R2

This avoids processing a whole book in one Worker invocation.

### Worker Setup

From the worker directory:

```bash
cd ../book-wiki-worker
npm install
```

Create Cloudflare resources:

```bash
npx wrangler r2 bucket create book-wiki
npx wrangler kv namespace create STATUS_KV
npx wrangler queues create book-process-queue
```

Update `wrangler.toml`:

```toml
[vars]
VAULT_R2_ENDPOINT = "https://<account-id>.r2.cloudflarestorage.com"
VAULT_R2_BUCKET = "<your-vault-sync-bucket>"
VAULT_R2_PREFIX = ""

[[kv_namespaces]]
binding = "STATUS_KV"
id = "<your-kv-namespace-id>"
```

Set secrets for writing generated Markdown into your vault R2 bucket:

```bash
npx wrangler secret put VAULT_R2_ACCESS_KEY_ID
npx wrangler secret put VAULT_R2_SECRET_ACCESS_KEY
```

Deploy:

```bash
npx wrangler deploy
```

## Book Processing Setup in Obsidian

In plugin settings, configure:

- **Worker URL**: your deployed Worker URL
- **LLM API Endpoint**: OpenAI-compatible chat completions endpoint
- **LLM API Key**
- **LLM Model**: e.g. `glm-5`, `deepseek-chat`, or `deepseek-v4-flash`

Examples:

```text
DeepSeek endpoint: https://api.deepseek.com/chat/completions
DeepSeek model: deepseek-v4-flash
```

Then right-click a `.pdf` file in Obsidian and choose **Process as book wiki**.

## Monitoring Jobs

Tail Worker logs:

```bash
cd ../book-wiki-worker
npx wrangler tail book-wiki-worker --format pretty
```

List recent jobs:

```bash
curl https://your-worker.workers.dev/jobs
```

Check one job:

```bash
curl https://your-worker.workers.dev/status/<jobId>
```

## Limitations

- PDF extraction depends on selectable embedded text. Scanned PDFs need OCR, which is not implemented.
- LLM quality depends heavily on the model, endpoint latency, and context limits.
- Large books may require many queue messages and can take a long time.
- The worker stores intermediate job state in R2/KV for debugging and recovery.

## Security Notes

- Do not commit real R2 access keys or API keys.
- Store Worker-side vault R2 keys with `wrangler secret put`.
- Obsidian plugin settings are stored locally in Obsidian plugin data.
- Review `wrangler.toml` before publishing to avoid exposing account-specific IDs.

## Development

Plugin:

```bash
npm run build
```

Worker:

```bash
cd ../book-wiki-worker
npm run build
npx wrangler deploy
```

## License

MIT

---

# 中文文档

Book Wiki Sync 是一个面向 PDF 书籍 Wiki 工作流的 Obsidian 社区插件。它可以把 PDF 发送到 Cloudflare Worker 生成中文 Obsidian 风格 LLM Wiki，也可以和 Cloudflare R2 同步 Vault，并通过文件重命名标记章节已读/未读。

## 功能

- 在文件列表右键菜单中标记 Markdown 文件为已读/未读。
- 使用后缀重命名章节：`第15章.md` → `第15章 ✅.md`。
- 右侧面板显示当前文件，并提供已读/未读按钮。
- 支持手动和自动的 Cloudflare R2 双向同步。
- 右键 `.pdf`，发送到 Worker 生成中文书籍 Wiki。
- Worker 生成的 Markdown 会复制到你的 Vault R2 桶，再通过同步拉回本地 Obsidian。

## 项目结构

当前项目包含两个部分：

```text
book-wiki-sync/
├── main.ts                 # Obsidian 插件入口
├── src/                    # 插件模块
├── manifest.json
├── package.json
└── README.md

../book-wiki-worker/
├── src/                    # Cloudflare Worker 服务
├── wrangler.toml
├── package.json
└── tsconfig.json
```

## Obsidian 插件安装

### 构建

```bash
npm install
npm run build
```

### 本地安装

把以下文件复制到你的 Vault 插件目录：

```bash
mkdir -p /path/to/your-vault/.obsidian/plugins/book-wiki-sync
cp main.js manifest.json styles.css /path/to/your-vault/.obsidian/plugins/book-wiki-sync/
```

重启 Obsidian，然后在 **设置 → 第三方插件** 中启用 **Book Wiki Sync**。

## 已读标记用法

在文件列表中右键 Markdown 文件：

- **Mark as read**：`第15章.md` → `第15章 ✅.md`
- **Mark as unread**：`第15章 ✅.md` → `第15章.md`

命令：

- `Toggle chapter read status`
- `Open Book Wiki Sync panel`

## R2 Vault 同步

插件设置项：

- **Endpoint URL**：Cloudflare R2 S3 endpoint，例如 `https://<account-id>.r2.cloudflarestorage.com`
- **Access Key ID**
- **Secret Access Key**
- **Bucket Name**
- **Auto-sync**
- **Auto-sync debounce**

命令：

- `Sync vault to R2`
- `Upload current file to R2`

## 书籍 Wiki Worker

Worker 接收 PDF，先转换成 Markdown-ish `source.md`，再拆分章节，调用 OpenAI-compatible LLM endpoint，然后生成中文 Obsidian Wiki。

输出结构：

```text
书名/
├── 第01章.md
├── 第02章.md
└── wiki/
    ├── characters/
    ├── themes/
    ├── places/
    ├── parts/
    ├── index.md
    └── log.md
```

### Worker 架构

Worker 使用 Cloudflare Queues。每条队列消息只做一个小任务：

- 提取书籍文本
- 判断书名
- 处理一个章节
- 提取一种实体类型
- 生成一个实体页面
- 生成部分概览
- 生成索引和日志
- 复制输出到 Vault R2

这样可以避免一个 Worker invocation 处理整本书导致超时。

### Worker 设置

进入 Worker 目录：

```bash
cd ../book-wiki-worker
npm install
```

创建 Cloudflare 资源：

```bash
npx wrangler r2 bucket create book-wiki
npx wrangler kv namespace create STATUS_KV
npx wrangler queues create book-process-queue
```

更新 `wrangler.toml`：

```toml
[vars]
VAULT_R2_ENDPOINT = "https://<account-id>.r2.cloudflarestorage.com"
VAULT_R2_BUCKET = "<your-vault-sync-bucket>"
VAULT_R2_PREFIX = ""

[[kv_namespaces]]
binding = "STATUS_KV"
id = "<your-kv-namespace-id>"
```

设置 Worker secrets，用于写入你的 Vault R2 桶：

```bash
npx wrangler secret put VAULT_R2_ACCESS_KEY_ID
npx wrangler secret put VAULT_R2_SECRET_ACCESS_KEY
```

部署：

```bash
npx wrangler deploy
```

## 在 Obsidian 中配置书籍处理

插件设置中配置：

- **Worker URL**：部署后的 Worker URL
- **LLM API Endpoint**：OpenAI-compatible chat completions endpoint
- **LLM API Key**
- **LLM Model**：例如 `glm-5`、`deepseek-chat`、`deepseek-v4-flash`

示例：

```text
DeepSeek endpoint: https://api.deepseek.com/chat/completions
DeepSeek model: deepseek-v4-flash
```

然后在 Obsidian 中右键 `.pdf` 文件，选择 **Process as book wiki**。

## 查看任务进度

查看 Worker 实时日志：

```bash
cd ../book-wiki-worker
npx wrangler tail book-wiki-worker --format pretty
```

查看最近任务：

```bash
curl https://your-worker.workers.dev/jobs
```

查看单个任务：

```bash
curl https://your-worker.workers.dev/status/<jobId>
```

## 限制

- PDF 提取依赖 PDF 中可选择的内嵌文本。扫描版 PDF 需要 OCR，目前未实现。
- LLM 输出质量取决于模型、接口延迟和上下文限制。
- 大书可能需要很多队列消息，处理时间较长。
- Worker 会在 R2/KV 中保存中间状态，用于调试和恢复。

## 安全说明

- 不要提交真实 R2 access key 或 LLM API key。
- Worker 侧 Vault R2 key 请用 `wrangler secret put` 保存。
- Obsidian 插件设置保存在本地插件数据中。
- 开源前请检查 `wrangler.toml`，避免暴露账号 ID、KV ID 等个人配置。

## 开发

插件：

```bash
npm run build
```

Worker：

```bash
cd ../book-wiki-worker
npm run build
npx wrangler deploy
```

## 许可证

MIT
