# Book Wiki Worker

Cloudflare Worker service for turning PDF books into a Chinese Obsidian-style LLM wiki.

中文说明见下方：[中文文档](#中文文档)

## What It Does

- Receives book uploads from the Book Wiki Sync Obsidian plugin.
- Converts uploaded PDFs into Markdown-ish `source.md` with page markers before LLM processing.
- Splits content into chapters.
- Sends each chapter or wiki-generation step to an OpenAI-compatible LLM API.
- Generates Markdown chapters, character pages, theme pages, place pages, part overview pages, `wiki/index.md`, and `wiki/log.md`.
- Stores output in R2 and optionally copies final Markdown files to your vault sync R2 bucket.

## Architecture

This service uses Cloudflare Queues. It does not process a full book in one invocation. Instead, it chains small jobs:

```text
upload
  -> extract
  -> detect-title
  -> process-chapter N
  -> extract-entities
  -> generate-entity-page N
  -> extract-parts
  -> generate-index
  -> finalize
```

Intermediate state is stored in R2 under `jobs/{jobId}/...`.

## Required Cloudflare Resources

- R2 bucket: `book-wiki`
- KV namespace: `STATUS_KV`
- Queue: `book-process-queue`

Create them:

```bash
npx wrangler r2 bucket create book-wiki
npx wrangler kv namespace create STATUS_KV
npx wrangler queues create book-process-queue
```

## Configuration

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

Set secrets:

```bash
npx wrangler secret put VAULT_R2_ACCESS_KEY_ID
npx wrangler secret put VAULT_R2_SECRET_ACCESS_KEY
```

## Development

```bash
npm install
npm run build
npx wrangler dev --remote
```

Use `--remote` because the worker depends on real Cloudflare R2, KV, and Queue bindings.

## Deployment

```bash
npx wrangler deploy
```

## API

### `POST /upload`

Multipart form fields:

- `file`: PDF file
- `filename`: original filename
- `llmEndpoint`: OpenAI-compatible chat-completions endpoint
- `llmKey`: API key
- `llmModel`: model name, e.g. `glm-5`, `deepseek-chat`, `deepseek-v4-flash`

Response:

```json
{ "jobId": "...", "status": "queued" }
```

### `GET /status/:jobId`

Returns job progress and errors.

### `GET /jobs`

Returns the latest 20 jobs from KV.

### `GET /output/:jobId`

Returns output paths when the job is complete.

## Debugging

Tail logs:

```bash
npx wrangler tail book-wiki-worker --format pretty
```

Purge queue:

```bash
npx wrangler queues purge book-process-queue
```

Delete one job status:

```bash
npx wrangler kv key delete <jobId> --binding STATUS_KV
```

## Limitations

- Scanned PDFs require OCR and are not supported yet.
- PDF extraction quality varies across publishers and embedded font encodings.
- LLM calls may be slow. The queue pipeline isolates each step so one slow chapter does not kill the whole book.
- Generated wiki quality depends on model capability and prompt adherence.

## License

MIT

---

# 中文文档

Book Wiki Worker 是一个 Cloudflare Worker 服务，用于把 PDF 书籍转换成中文 Obsidian 风格的 LLM Wiki。

## 功能

- 接收 Book Wiki Sync Obsidian 插件上传的书籍。
- 先把上传的 PDF 转成带页码标记的 Markdown-ish `source.md`，再交给 LLM 处理。
- 按章节拆分内容。
- 把每个章节或 Wiki 生成步骤发送给 OpenAI-compatible LLM API。
- 生成 Markdown 章节、人物页、主题页、地点页、部分概览页、`wiki/index.md` 和 `wiki/log.md`。
- 把输出保存到 R2，并可选复制到你的 Vault 同步 R2 桶。

## 架构

服务使用 Cloudflare Queues。它不会在一个 invocation 中处理整本书，而是把任务拆成多个小步骤：

```text
upload
  -> extract
  -> detect-title
  -> process-chapter N
  -> extract-entities
  -> generate-entity-page N
  -> extract-parts
  -> generate-index
  -> finalize
```

中间状态保存在 R2 的 `jobs/{jobId}/...` 路径下。

## 需要的 Cloudflare 资源

- R2 bucket：`book-wiki`
- KV namespace：`STATUS_KV`
- Queue：`book-process-queue`

创建资源：

```bash
npx wrangler r2 bucket create book-wiki
npx wrangler kv namespace create STATUS_KV
npx wrangler queues create book-process-queue
```

## 配置

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

设置密钥：

```bash
npx wrangler secret put VAULT_R2_ACCESS_KEY_ID
npx wrangler secret put VAULT_R2_SECRET_ACCESS_KEY
```

## 开发

```bash
npm install
npm run build
npx wrangler dev --remote
```

建议使用 `--remote`，因为服务依赖真实的 Cloudflare R2、KV 和 Queue 绑定。

## 部署

```bash
npx wrangler deploy
```

## API

### `POST /upload`

Multipart form 字段：

- `file`：PDF 文件
- `filename`：原始文件名
- `llmEndpoint`：OpenAI-compatible chat-completions endpoint
- `llmKey`：API key
- `llmModel`：模型名，例如 `glm-5`、`deepseek-chat`、`deepseek-v4-flash`

响应：

```json
{ "jobId": "...", "status": "queued" }
```

### `GET /status/:jobId`

返回任务进度和错误。

### `GET /jobs`

返回 KV 中最近 20 个任务。

### `GET /output/:jobId`

任务完成后返回输出路径。

## 调试

查看实时日志：

```bash
npx wrangler tail book-wiki-worker --format pretty
```

清空队列：

```bash
npx wrangler queues purge book-process-queue
```

删除某个任务状态：

```bash
npx wrangler kv key delete <jobId> --binding STATUS_KV
```

## 限制

- 扫描版 PDF 需要 OCR，目前不支持。
- PDF 文本提取质量取决于出版社和字体编码方式。
- LLM 调用可能很慢。队列流水线会把每一步拆开，避免一个慢章节拖垮整本书。
- Wiki 质量取决于模型能力和模型对 prompt 的遵循程度。

## 许可证

MIT
