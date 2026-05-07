# Contributing

Thanks for helping improve Book Wiki Sync.

## Development Setup

Plugin:

```bash
cd plugin
npm install
npm run build
```

Worker:

```bash
cd worker
npm install
npm run build
```

Website:

```bash
open website/index.html
```

## Pull Request Checklist

- Keep the plugin, Worker, and docs aligned.
- Do not commit secrets or local Cloudflare config.
- Run `npm run build` in `plugin/` before submitting plugin changes.
- Run `npm run build` in `worker/` before submitting Worker changes.
- Update README/docs when setup, configuration, or behavior changes.
