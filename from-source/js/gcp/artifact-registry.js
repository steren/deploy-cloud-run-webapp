import { WEBAPP_NAME, region, artifactRegistryRepo } from "../config.js";

export async function createArtifactRegistryRepo(token, project) {
  console.log(
    `Creating Artifact Registry repository: ${project}/${region}/${artifactRegistryRepo}`,
  );
  const response = await fetch(
    `https://artifactregistry.googleapis.com/v1/projects/${project}/locations/${region}/repositories?repositoryId=${artifactRegistryRepo}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `projects/${project}/locations/${region}/repositories/${artifactRegistryRepo}`,
        format: "DOCKER",
        description: "Container images built from folder deployer",
        labels: {
          "created-by": WEBAPP_NAME,
        },
      }),
    },
  );
  const result = await response.json();
  if (result.error) {
    if (result.error.code === 409) {
      console.warn(
        `Artifact Registry repository ${artifactRegistryRepo} already exists: ${result.error.message}`,
      );
      return null;
    }
    throw new Error(
      `Failed to create Artifact Registry repository: ${result.error.message}`,
    );
  }
  console.log(
    `Artifact Registry repository creation initiated. Operation: ${result.name}`,
  );
  return result.name;
}

export async function waitArtifactRegistryOperation(token, operationName) {
  if (!operationName) {
    console.log(
      "No Artifact Registry operation to wait for (repository might have existed).",
    );
    return;
  }
  console.log(`Waiting for Artifact Registry operation: ${operationName}`);
  let result;
  let attempts = 0;
  const maxAttempts = 10;
  const delay = 5000;

  while (attempts < maxAttempts) {
    const response = await fetch(
      `https://artifactregistry.googleapis.com/v1/${operationName}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
    );
    result = await response.json();

    if (result.error) {
      throw new Error(
        `Error waiting for Artifact Registry operation: ${result.error.message}`,
      );
    }

    if (result.done) {
      console.log("Artifact Registry operation finished.", result);
      if (result.response) {
        return result.response;
      } else if (result.error) {
        throw new Error(
          `Artifact Registry operation failed: ${JSON.stringify(result.error)}`,
        );
      }
      return;
    }

    console.log("Artifact Registry operation still in progress...");
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error(
    `Artifact Registry operation timed out after ${attempts} attempts.`,
  );
}