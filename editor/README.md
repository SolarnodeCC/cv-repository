# Solarnode CV Editor (Cloudflare Containers)

Hosted YAML editor + RenderCV preview. Separate from the **public** Worker `solarnode-cv`.

## Architecture

- **Worker** `solarnode-cv-editor` proxies all requests to a singleton Container
- **Container** runs the existing FastAPI app (`web/`) with RenderCV + Typst
- **Public CV site** stays open at `solarnode-cv` / custom domain
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

## Persistence note

Container disk is ephemeral. The image bakes in `cv.yaml` / `solarnode/` / `output/` from the repo at build time. GitHub remains the source of truth for now; R2 bucket `solarnode-cv-data` is provisioned for a later sync layer.
