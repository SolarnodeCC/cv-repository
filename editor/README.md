# Solarnode CV Editor (Cloudflare Containers)

Hosted YAML editor + RenderCV preview. Separate from the **public** Worker `solarnode-cv`.

## Architecture

- **Worker** `solarnode-cv-editor` proxies all requests to a singleton Container
- **Container** runs the FastAPI app (`web/`) with RenderCV + Typst
- **R2** `solarnode-cv-data` via virtual host `cv.r2` (`outboundByHost`) — hydrate on boot, publish on save/render
- **Public CV site** reads `CV.pdf` / HTML / PNG from the same R2 bucket
- **Access**: protect this editor Worker in the Cloudflare dashboard (email allowlist)

## Deploy

Requires Docker on the machine/CI runner (image build) and an API token that can edit Workers **and** Containers.

```bash
cd editor
npm install
npm run deploy
```

GitHub Action: `.github/workflows/deploy-editor.yml` (manual + path filters).

## Secure with Cloudflare Access (required)

1. Cloudflare dashboard → **Workers & Pages** → `solarnode-cv-editor` → **Access**
2. **Protect this Worker** (production + previews)
3. Allow only your email / `@solarnode.cc` (or account members)
4. Leave `solarnode-cv` **public** (do not protect the public CV Worker)

## Persistence (Phase 3)

| Key | Meaning |
| --- | --- |
| `cv.yaml` | Editor source |
| `output/CV.pdf` / `.html` / `.png` / `.md` | Public site artifacts |

Save/Render in the editor writes local disk **and** R2. The public Worker serves R2 first, then falls back to bundled static assets.
