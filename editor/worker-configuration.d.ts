interface Env {
  CV_EDITOR: DurableObjectNamespace<import("./src/index").CvEditorContainer>;
  CV_DATA: R2Bucket;
}
