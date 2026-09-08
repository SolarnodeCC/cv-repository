# Solarnode CV site (Cloudflare Workers)

Publieke landingspagina + CV-artifacts (`PDF` / `HTML` / `PNG`).

## Lokaal

```bash
npm install
npm run sync    # kopieert ../output → ./public
npm run dev     # wrangler dev
npm run deploy  # wrangler deploy (CLOUDFLARE_API_TOKEN + ACCOUNT_ID)
```

Worker-naam: `solarnode-cv` (`wrangler.jsonc`).
