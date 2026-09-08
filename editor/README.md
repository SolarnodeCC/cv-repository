# Private RenderCV editor (Cloudflare Container)

Runs the FastAPI editor from [`web/`](../web/) inside a Cloudflare Container, fronted by Worker `solarnode-cv-editor`.

**Cloudflare Access is required** before exposing this Worker. Without Access, anyone who finds the hostname can save YAML, render (CPU), and publish to R2.

## Access checklist (required)

Protect **all** hostnames for this Worker — not only a custom domain:

1. Cloudflare dashboard → **Zero Trust** → **Access** → **Applications** (or Worker → Access)
2. Protect Worker `solarnode-cv-editor`
3. Include:
   - production route / custom domain (if any)
   - `*.workers.dev` hostname for this Worker
   - **preview URLs** (`preview_urls` is enabled in `wrangler.jsonc`)
4. Allow only your email / `@solarnode.cc` (or account members)
5. Leave public Worker `solarnode-cv` **unprotected**
6. Smoke-test: open the editor URL in a private window → Access login required; `/edge-health` also behind Access

Re-check this list after every deploy that adds a hostname.

## Endpoints

| Path | Purpose |
|------|---------|
| `/` | Editor UI |
| `/api/*` | Validate, save (YAML only), render (+ artifacts → R2), hydrate, health, preview |
| R2 bridge | Allowlisted keys only (`shared/r2-allowlist.json`) via `cv.r2` |

## R2

Bucket binding: `CV_DATA` → `solarnode-cv-data`.

The container talks to R2 via Worker proxy host `cv.r2` (`outboundByHost`). Internet egress is disabled except for that host and font/CDN hosts needed by Typst/CodeMirror.

**Ownership:** the editor is the live writer. CI `seed-r2` only fills **missing** keys unless `R2_SEED_FORCE=1` / `--force` (bootstrap or promote from Git).

## Deploy

Requires GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

```bash
# via Actions (preferred)
# push to main under editor/** or web/**

# or locally
cd editor
npm ci
npx wrangler deploy
```

Container image build context is the **repository root** (`image_build_context = ".."`).

## Local container build smoke test

```bash
docker build -f editor/Dockerfile -t solarnode-cv-editor:local .
docker run --rm -p 8080:8080 solarnode-cv-editor:local
curl -fsS http://127.0.0.1:8080/api/health
```
