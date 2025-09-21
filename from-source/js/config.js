export const WEBAPP_NAME = "web-app-deploy-folder";
export const CLIENT_ID =
  "607903476290-nkeuoe6ojl8oq1f6cgb9rtervt4chao2.apps.googleusercontent.com";
export const REDIRECT_URI = window.location.href.split("#")[0];

export const region = "us-central1";
export const service = "my-app-service";
export const artifactRegistryRepo = "my-app-repo";
export const builtImageName = "custom-app-image";

export const REQUIRED_APIS = [
  "storage.googleapis.com",
  "run.googleapis.com",
  "cloudbuild.googleapis.com",
  "artifactregistry.googleapis.com",
];