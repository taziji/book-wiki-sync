# Book Wiki Sync

Book Wiki Sync turns PDF books into linked Obsidian book wikis.

It is inspired by Andrej Karpathy's [LLM Wiki idea](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): instead of asking an LLM for a one-shot summary, use it to build a browsable, interconnected knowledge structure around a source text.

Introduction website: [https://llm-wiki.top/](https://llm-wiki.top/)

## What It Includes

- `plugin/`: Obsidian community plugin for PDF upload, R2 vault sync, and chapter read markers.
- `worker/`: Cloudflare Worker pipeline that extracts PDF text, calls an OpenAI-compatible LLM, and writes generated wiki notes.

## Core Features

- Right-click a PDF in Obsidian and process it as a book wiki.
- Convert PDFs into an inspectable `source.md` before LLM processing.
- Generate chapter notes, character pages, place pages, theme pages, part pages, index, and log files.
- Use Obsidian `[[wikilinks]]` across generated notes.
- Sync generated Markdown back into your Obsidian vault through Cloudflare R2.
- Mark Markdown chapters as read/unread with filename suffixes like `第15章 ✅.md`.
- Configure any OpenAI-compatible chat completions endpoint and model.

## Repository Layout

```text
book-wiki-sync/
├── plugin/    # Obsidian plugin
├── worker/    # Cloudflare Worker processor
└── docs/      # Project docs
```

## Quick Start

### 1. Build The Plugin

```bash
cd plugin
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` into your vault:

```bash
mkdir -p /path/to/your-vault/.obsidian/plugins/book-wiki-sync
cp main.js manifest.json styles.css /path/to/your-vault/.obsidian/plugins/book-wiki-sync/
```

Enable **Book Wiki Sync** in Obsidian community plugin settings.

### 2. Deploy The Worker

```bash
cd worker
npm install
cp wrangler.example.toml wrangler.toml
```

Create Cloudflare resources:

```bash
npx wrangler r2 bucket create book-wiki
npx wrangler kv namespace create STATUS_KV
npx wrangler queues create book-process-queue
```

Update `worker/wrangler.toml` with your bucket, queue, and KV IDs.

Set secrets for the vault R2 destination:

```bash
npx wrangler secret put VAULT_R2_ACCESS_KEY_ID
npx wrangler secret put VAULT_R2_SECRET_ACCESS_KEY
```

Deploy:

```bash
npx wrangler deploy
```

### 3. Configure Obsidian

In Book Wiki Sync settings, set:

- Worker URL
- LLM API endpoint
- LLM API key
- LLM model
- R2 sync endpoint, bucket, access key, and secret key

Then right-click a `.pdf` file and choose **Process as book wiki**.

## LLM Provider Notes

The Worker expects an OpenAI-compatible `/chat/completions` API.

Example DeepSeek settings:

```text
LLM API Endpoint: https://api.deepseek.com/chat/completions
LLM Model: deepseek-chat
```

## Limitations

- PDF-only workflow.
- PDFs must contain selectable text. Scanned PDFs need OCR, which is not built in.
- Long books can require many LLM calls and may cost money depending on your provider.
- Generated quality depends on PDF extraction quality, model capability, context limits, and prompt adherence.
- You are responsible for the copyright and privacy implications of sending book text to your configured LLM provider.

## Security

- Do not commit `worker/wrangler.toml` if it contains real Cloudflare IDs.
- Do not commit R2 access keys, LLM API keys, Obsidian local plugin data, or `.wrangler/` state.
- Store Worker-side secrets with `wrangler secret put`.
- Plugin settings are stored locally by Obsidian.

See [SECURITY.md](SECURITY.md).

## Development

Plugin:

```bash
cd plugin
npm run build
```

Worker:

```bash
cd worker
npm run build
```

## License

MIT
