const R2_PATHS: Record<string, { key: string; contentType: string }> = {
  "/CV.pdf": { key: "output/CV.pdf", contentType: "application/pdf" },
  "/CV.html": { key: "output/CV.html", contentType: "text/html; charset=utf-8" },
  "/CV.md": { key: "output/CV.md", contentType: "text/markdown; charset=utf-8" },
  "/CV.png": { key: "output/CV.png", contentType: "image/png" },
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const mapping = R2_PATHS[url.pathname];

    if (mapping) {
      const object = await env.CV_DATA.get(mapping.key);
      if (object) {
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        if (!headers.has("content-type")) {
          headers.set("content-type", mapping.contentType);
        }
        headers.set("etag", object.httpEtag);
        headers.set("cache-control", "public, max-age=60");
        return new Response(object.body, { headers });
      }
      // Fall through to bundled static assets from the last deploy.
    }

    return env.ASSETS.fetch(request);
  },
};
