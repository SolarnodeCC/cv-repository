import { Container, getContainer } from "@cloudflare/containers";

/**
 * Singleton CV editor container (RenderCV + FastAPI UI).
 * Protect this Worker with Cloudflare Access in the dashboard —
 * do not leave write-capable editing open on the public internet.
 *
 * R2 access from inside the container goes through virtual host `cv.r2`
 * (see outboundByHost) — no S3 credentials needed in the image.
 */
export class CvEditorContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "15m";
  enableInternet = true;
  envVars = {
    R2_SYNC: "1",
    R2_HTTP_BASE: "http://cv.r2",
  };

  static outboundByHost = {
    "cv.r2": async (request: Request, env: Env) => {
      const url = new URL(request.url);
      const key = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      if (!key || key.includes("..")) {
        return new Response("Bad key", { status: 400 });
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

      if (request.method === "DELETE") {
        await env.CV_DATA.delete(key);
        return Response.json({ ok: true, key });
      }

      return new Response("Method not allowed", { status: 405 });
    },
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/edge-health") {
      return Response.json({
        ok: true,
        worker: "solarnode-cv-editor",
        r2: "solarnode-cv-data",
        note: "Protect this Worker with Cloudflare Access before sharing the URL.",
      });
    }

    const container = getContainer(env.CV_EDITOR, "default");
    return container.fetch(request);
  },
};
