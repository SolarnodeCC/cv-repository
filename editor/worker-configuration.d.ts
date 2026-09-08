interface Env {
  CV_EDITOR: DurableObjectNamespace<import("./src/index").CvEditorContainer>;
  CV_DATA: R2Bucket;
  /** Cloudflare Workers AI binding (default AI provider for the editor). */
  AI: Ai;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  GITHUB_BASE_BRANCH?: string;
  /** Optional Workers AI model id, e.g. @cf/meta/llama-3.1-8b-instruct */
  AI_MODEL?: string;
  /** Optional external OpenAI-compatible upstream (overrides Workers AI). */
  AI_UPSTREAM_BASE?: string;
  /** API key for AI_UPSTREAM_BASE (not needed for Workers AI binding). */
  AI_API_KEY?: string;
}
