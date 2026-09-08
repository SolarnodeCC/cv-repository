# Private RenderCV editor (Cloudflare Container)

Runs the FastAPI editor from [`web/`](../web/) inside a Cloudflare Container, fronted by Worker `solarnode-cv-editor`.

**Cloudflare Access is required** before exposing this Worker. Without Access, anyone who finds the hostname can save YAML, render (CPU), publish to R2, and open GitHub PRs (if `GITHUB_TOKEN` is set).

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
| `/api/wake` | Worker probe that wakes the container (cold-start UX) |
| `/api/*` | Validate, save (YAML), render (+ R2), sync-git, hydrate, health, preview |
| R2 bridge | Allowlisted keys (`shared/r2-allowlist.json`) via `cv.r2` (+ etag If-Match) |
| GitHub bridge | `github.api` → `api.github.com` (repo-scoped; token on Worker only) |

## R2

Bucket binding: `CV_DATA` → `solarnode-cv-data`.

The container talks to R2 via Worker proxy host `cv.r2` (`outboundByHost`). Internet egress is disabled except for `cv.r2`, `github.api`, and font/CDN hosts.

**Ownership:** the editor is the live writer. CI `seed-r2` only fills **missing** keys unless `R2_SEED_FORCE=1` / `--force` (bootstrap or promote from Git).

## Git sync (fase 2)

UI button **Sync Git** → `POST /api/sync-git` creates branch `editor/cv-sync-*` + **draft PR** with `cv.yaml`.

### Required secrets (GitHub Actions → repo secrets)

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Deploy Worker/Container + Access API |
| `CLOUDFLARE_ACCOUNT_ID` | Account id |
| `CV_EDITOR_GITHUB_TOKEN` | PAT with `contents:write` + `pull_requests:write` → written to Worker as `GITHUB_TOKEN` on each deploy |
| `ACCESS_ALLOWED_EMAILS` | Optional comma-separated allowlist (default `info@solarnode.cc`) |
| `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` | Optional Access service token for authenticated smoke tests |

Deploy runs [`scripts/post-deploy-ops.mjs`](scripts/post-deploy-ops.mjs): puts the GitHub token, upserts an Access app that protects Worker `solarnode-cv-editor` (production + previews), and smoke-checks that unauthenticated `/edge-health` is no longer public JSON.

Locally:

```bash
export GITHUB_TOKEN=...   # for make web
# or after deploy:
cd editor
CV_EDITOR_GITHUB_TOKEN=... CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... npm run post-deploy-ops
```

Happy path: edit → **Render** (R2) → **Sync Git** → review/merge → optional **Promote** (`R2_SEED_FORCE=1` on Render/Deploy workflow_dispatch).

## Cold start (fase 3)

Container `sleepAfter` is **45m**. The UI shows a wake banner when requests take >2s; `/api/wake` measures wake latency.

## Deploy

Requires GitHub secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Optional: Worker secret `GITHUB_TOKEN` for Sync Git.

```bash
# via Actions (preferred) — triggers on editor/**, web/**, shared/**, solarnode/**
# (not on cv.yaml content alone — live YAML comes from R2)

# or locally
cd editor
npm ci
npx wrangler secret put GITHUB_TOKEN   # once
npx wrangler deploy
```

Container image build context is the **repository root** (`image_build_context = ".."`).

## Local container build smoke test

```bash
docker build -f editor/Dockerfile -t solarnode-cv-editor:local .
docker run --rm -p 8080:8080 solarnode-cv-editor:local
curl -fsS http://127.0.0.1:8080/api/health
```
