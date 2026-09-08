interface Env {
  CV_EDITOR: DurableObjectNamespace<import("./src/index").CvEditorContainer>;
  CV_DATA: R2Bucket;
  GITHUB_TOKEN?: string;
  GITHUB_REPO?: string;
  GITHUB_BASE_BRANCH?: string;
}
