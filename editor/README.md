# Private RenderCV editor (Cloudflare Container)

Runs the FastAPI editor from [`web/`](../web/) inside a Cloudflare Container, fronted by Worker `solarnode-cv-editor`.

Intended for **private / team-only** use. Protect the Worker hostname with [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) in the dashboard (Zero Trust → Access → Applications).

## Endpoints

| Path | Purpose |
|------|---------|
| `/` | Editor UI |
| `/api/*` | Validate, save, render, hydrate, health, preview |
| R2 bridge | Allowlisted keys only (`cv.yaml`, `output/CV.*`) via `cv.r2` |

## R2

Bucket binding: `CV_DATA` → `solarnode-cv-data`.

The container talks to R2 via Worker proxy host `cv.r2` (`outboundByHost`). Internet egress is disabled except for that host and font/CDN hosts needed by Typst/CodeMirror.

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
