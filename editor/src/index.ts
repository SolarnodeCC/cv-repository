import { Container, ContainerProxy, getContainer } from "@cloudflare/containers";
import allowlist from "../../shared/r2-allowlist.json";

/** Only these R2 object keys may be read/written by the editor container. */
const ALLOWED_R2_KEYS = new Set<string>(allowlist.keys);

const GITHUB_REPO_DEFAULT = "SolarnodeCC/cv-repository";
const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";

type ChatMessage = { role: string; content: string };

function isWorkersAiModel(model: string): boolean {
  return model.startsWith("@cf/") || model.startsWith("@hf/");
}

function assistantContentFromWorkersAi(result: unknown): string {
  if (typeof result === "string") return result;
  if (!result || typeof result !== "object") return String(result ?? "");
  const obj = result as Record<string, unknown>;
  if (typeof obj.response === "string") return obj.response;
  if (typeof obj.result === "string") return obj.result;
  if (typeof obj.output_text === "string") return obj.output_text;
  if (Array.isArray(obj.choices) && obj.choices[0]) {
    const choice = obj.choices[0] as Record<string, unknown>;
    const msg = choice.message as Record<string, unknown> | undefined;
    if (msg && typeof msg.content === "string") return msg.content;
    if (typeof choice.text === "string") return choice.text;
  }
  return JSON.stringify(result);
}

async function workersAiChatCompletions(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  let body: {
    model?: string;
    messages?: ChatMessage[];
    temperature?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  const defaultModel = env.AI_MODEL || DEFAULT_WORKERS_AI_MODEL;
  let model = (body.model || defaultModel).trim();
  if (!isWorkersAiModel(model)) {
    model = defaultModel;
  }

  try {
    const result = await env.AI.run(model as keyof AiModels, {
      messages: body.messages || [],
      temperature: body.temperature ?? 0.2,
      max_tokens: 2048,
    } as Record<string, unknown>);

    // Some Workers AI models already return OpenAI-shaped payloads.
    if (
      result &&
      typeof result === "object" &&
      Array.isArray((result as { choices?: unknown }).choices)
    ) {
      return Response.json(result);
    }

    const content = assistantContentFromWorkersAi(result);
    return Response.json({
      id: `cf-workers-ai-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { message: `Workers AI error: ${message}` },
      { status: 502 },
    );
  }
}

/**
 * Singleton CV editor container (RenderCV + FastAPI UI).
 * Intended for private use. Cloudflare Access on this Worker is required.
 *
 * R2 access uses virtual host `cv.r2`; GitHub API uses `github.api`;
 * Workers AI uses `ai.api` (no external API key — AI binding on the Worker).
 */
export class CvEditorContainer extends Container {
  defaultPort = 8080;
  // Longer idle keeps a working session warm (fewer cold starts).
  sleepAfter = "45m";
  // Deny-by-default egress; allow R2 bridge + GitHub proxy + editor CDN assets only.
  enableInternet = false;
  allowedHosts = [
    "cv.r2",
    "github.api",
    "ai.api",
    "cdn.jsdelivr.net",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
  ];
  envVars = {
    R2_SYNC: "1",
    R2_HTTP_BASE: "http://cv.r2",
    GITHUB_API_BASE: "http://github.api",
    GITHUB_REPO: GITHUB_REPO_DEFAULT,
    GITHUB_BASE_BRANCH: "main",
    AI_BASE_URL: "http://ai.api/v1",
    AI_MODEL: DEFAULT_WORKERS_AI_MODEL,
  };

  static outboundByHost = {
    "cv.r2": async (request: Request, env: Env) => {
      const url = new URL(request.url);
      const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      if (!ALLOWED_R2_KEYS.has(key)) {
        return new Response("Forbidden key", { status: 403 });
      }

      if (request.method === "GET") {
        const object = await env.CV_DATA.get(key);
        if (!object) {
          return new Response("Not found", { status: 404 });
        }
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("etag", object.httpEtag);
        return new Response(object.body, { headers });
      }

      if (request.method === "PUT") {
        const ifMatch = request.headers.get("if-match");
        if (ifMatch) {
          const current = await env.CV_DATA.head(key);
          if (current && current.httpEtag && current.httpEtag !== ifMatch) {
            return new Response("Precondition Failed", { status: 412 });
          }
        }
        const contentType =
          request.headers.get("content-type") ?? "application/octet-stream";
        const putResult = await env.CV_DATA.put(key, request.body, {
          httpMetadata: { contentType },
        });
        const headers = new Headers({ "content-type": "application/json" });
        if (putResult?.httpEtag) {
          headers.set("etag", putResult.httpEtag);
        }
        return new Response(JSON.stringify({ ok: true, key }), {
          status: 200,
          headers,
        });
      }

      return new Response("Method not allowed", { status: 405 });
    },

    "github.api": async (request: Request, env: Env) => {
      const token = env.GITHUB_TOKEN;
      if (!token) {
        return Response.json(
          { message: "GITHUB_TOKEN secret not configured on Worker" },
          { status: 503 },
        );
      }
      const repo = env.GITHUB_REPO || GITHUB_REPO_DEFAULT;
      const url = new URL(request.url);
      const allowed = `/repos/${repo}`;
      if (url.pathname !== allowed && !url.pathname.startsWith(`${allowed}/`)) {
        return new Response("Forbidden GitHub path", { status: 403 });
      }
      const target = `https://api.github.com${url.pathname}${url.search}`;
      const headers = new Headers(request.headers);
      headers.set("Authorization", `Bearer ${token}`);
      headers.set("Accept", "application/vnd.github+json");
      headers.set("X-GitHub-Api-Version", "2022-11-28");
      headers.set("User-Agent", "solarnode-cv-editor");
      headers.delete("host");
      return fetch(target, {
        method: request.method,
        headers,
        body: request.body,
      });
    },

    "ai.api": async (request: Request, env: Env) => {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/v1/")) {
        return new Response("Forbidden AI path", { status: 403 });
      }

      // Default: Cloudflare Workers AI binding (no API key required).
      // Set AI_UPSTREAM_BASE (+ optional AI_API_KEY) to use an external provider.
      if (!env.AI_UPSTREAM_BASE) {
        if (url.pathname !== "/v1/chat/completions") {
          return Response.json(
            { message: "Workers AI proxy supports only /v1/chat/completions" },
            { status: 404 },
          );
        }
        return workersAiChatCompletions(request, env);
      }

      const token = env.AI_API_KEY;
      if (!token) {
        return Response.json(
          { message: "AI_API_KEY secret required when AI_UPSTREAM_BASE is set" },
          { status: 503 },
        );
      }
      const upstream = env.AI_UPSTREAM_BASE.replace(/\/$/, "");
      const target = `${upstream}${url.pathname}${url.search}`;
      const headers = new Headers(request.headers);
      headers.set("Authorization", `Bearer ${token}`);
      headers.set("User-Agent", "solarnode-cv-editor");
      headers.delete("host");
      return fetch(target, {
        method: request.method,
        headers,
        body: request.body,
      });
    },
  };
}

// Required for Containers outbound interception (R2 bridge).
export { ContainerProxy };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/edge-health") {
      return Response.json({
        ok: true,
        worker: "solarnode-cv-editor",
        r2: "solarnode-cv-data",
        allowed_r2_keys: [...ALLOWED_R2_KEYS],
        git_sync: Boolean(env.GITHUB_TOKEN),
        ai: true,
        ai_provider: env.AI_UPSTREAM_BASE ? "upstream" : "workers-ai",
        ai_model: env.AI_MODEL || DEFAULT_WORKERS_AI_MODEL,
        sleep_after: "45m",
      });
    }

    // Warm path: light probe that still wakes the container for /api/health.
    if (url.pathname === "/api/wake") {
      const container = getContainer(env.CV_EDITOR, "default");
      const started = Date.now();
      const res = await container.fetch(
        new Request(new URL("/api/health", request.url), { method: "GET" }),
      );
      const ms = Date.now() - started;
      const body = await res.json().catch(() => ({}));
      return Response.json({
        ok: res.ok,
        wake_ms: ms,
        coldish: ms > 2500,
        health: body,
      });
    }

    const container = getContainer(env.CV_EDITOR, "default");
    return container.fetch(request);
  },
};
