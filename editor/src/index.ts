import { Container, getContainer } from "@cloudflare/containers";

/**
 * Singleton CV editor container (RenderCV + FastAPI UI).
 * Protect this Worker with Cloudflare Access in the dashboard —
 * do not leave write-capable editing open on the public internet.
 */
export class CvEditorContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "15m";
  enableInternet = true;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Lightweight edge health for probes without waking the container.
    if (url.pathname === "/edge-health") {
      return Response.json({
        ok: true,
        worker: "solarnode-cv-editor",
        note: "Protect this Worker with Cloudflare Access before sharing the URL.",
      });
    }

    const container = getContainer(env.CV_EDITOR, "default");
    return container.fetch(request);
  },
};
