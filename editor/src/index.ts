import { Container, ContainerProxy, getContainer } from "@cloudflare/containers";

/** Only these R2 object keys may be read/written by the editor container. */
const ALLOWED_R2_KEYS = new Set([
  "cv.yaml",
  "output/CV.pdf",
  "output/CV.html",
  "output/CV.md",
  "output/CV.png",
  "output/CV_1.png",
]);

/**
 * Singleton CV editor container (RenderCV + FastAPI UI).
 * Intended for private use. Prefer Cloudflare Access in front of this Worker.
 *
 * R2 access uses virtual host `cv.r2` via outbound interception.
 */
export class CvEditorContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "15m";
  // Deny-by-default egress; allow R2 bridge + editor CDN assets only.
  enableInternet = false;
  allowedHosts = [
    "cv.r2",
    "cdn.jsdelivr.net",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
  ];
  envVars = {
    R2_SYNC: "1",
    R2_HTTP_BASE: "http://cv.r2",
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
        const contentType =
          request.headers.get("content-type") ?? "application/octet-stream";
        await env.CV_DATA.put(key, request.body, {
          httpMetadata: { contentType },
        });
        return Response.json({ ok: true, key });
      }

      return new Response("Method not allowed", { status: 405 });
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
      });
    }

    const container = getContainer(env.CV_EDITOR, "default");
    return container.fetch(request);
  },
};
