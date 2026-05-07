# Security Policy

## Sensitive Data

Book Wiki Sync can handle private books, Cloudflare credentials, and LLM API keys. Treat all of these as sensitive.

Do not commit:

- LLM API keys
- R2 access keys or secret keys
- `worker/wrangler.toml` with real account-specific IDs
- `.wrangler/` local state
- Obsidian plugin `data.json` or `sync-state.json`
- Generated notes from private or copyrighted books unless you have the right to publish them

## Reporting Security Issues

Please open a private security advisory on GitHub if available, or contact the maintainer privately before disclosing vulnerabilities publicly.

## LLM Privacy

When processing a book, extracted text is sent to the LLM endpoint configured by the user. Review your LLM provider's data retention and training policy before processing private material.
