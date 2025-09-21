import { WEBAPP_NAME, region, artifactRegistryRepo, REQUIRED_APIS } from "./config.js";

function getCloudRunServicePayload(imageUri = "gcr.io/cloud-run/placeholder") {
  const containerImage = imageUri || "gcr.io/cloud-run/placeholder";
  console.log(`Using container image: ${containerImage}`);
  return {
    labels: {
      "created-by": WEBAPP_NAME,
    },
    invokerIamDisabled: true,
    template: {
      containers: [
        {
          image: containerImage,
        },
      ],
    },
  };
}

export async function enableRequiredApis(token, project) {
  console.log("Enabling required APIs...");
  const response = await fetch(
    `https://serviceusage.googleapis.com/v1/projects/${project}/services:batchEnable`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        serviceIds: REQUIRED_APIS,
      }),
    },
  );

  const result = await response.json();
  if (result.error) {
    throw new Error(`Failed to enable APIs: ${result.error.message}`);
  }
  return result;
}

export async function createBucket(token, project) {
  const bucketName = `${project}-folder-deploy-data`;
  console.log(`Ensuring Cloud Storage bucket exists: ${bucketName}`);

  const response = await fetch(
    `https://storage.googleapis.com/storage/v1/b?project=${project}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: bucketName,
        location: region,
        storageClass: "STANDARD",
        labels: {
          "created-by": WEBAPP_NAME,
        },
      }),
    },
  );

  const result = await response.json();
  if (result.error) {
    if (result.error.code === 409) {
      console.log(`Bucket ${bucketName} already exists. Reusing it.`);
      return bucketName;
    }
    throw new Error(
      `Failed to create or verify bucket: ${result.error.message}`,
    );
  }
  console.log(`Bucket ${result.name} created successfully.`);
  return result.name;
}

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

export async function deploy(token, project, imageUri, service, validateOnly = false) {
  console.log(
    `Deploying (Creating) Cloud Run service: ${project} ${region} ${service} with image ${imageUri}`,
  );
  let url = `https://${region}-run.googleapis.com/v2/projects/${project}/locations/${region}/services?serviceId=${service}`;
  if (validateOnly) {
    url += "&validateOnly=true";
  }
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(getCloudRunServicePayload(imageUri)),
  });
  const result = await response.json();
  console.log(result);

  return result;
}

export async function updateService(token, project, imageUri, service) {
  console.log(
    `Updating existing Cloud Run service: ${project} ${region} ${service} with image ${imageUri}`,
  );
  const serviceName = `projects/${project}/locations/${region}/services/${service}`;
  const response = await fetch(
    `https://${region}-run.googleapis.com/v2/${serviceName}`,
    {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(getCloudRunServicePayload(imageUri)),
    },
  );
  const result = await response.json();
  console.log(result);
  return result;
}

export async function waitOperation(token, project, operation) {
  console.log(`Waiting for operation: ${operation}`);
  const response = await fetch(
    `https://${region}-run.googleapis.com/v2/${operation}:wait`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeout: "600s",
      }),
    },
  );
  const result = await response.json();
  console.log(result);

  return result;
}

export async function getService(token, project, service) {
  console.log(`Getting service: ${project} ${region} ${service}`);
  const serviceName = `projects/${project}/locations/${region}/services/${service}`;
  const response = await fetch(
    `https://${region}-run.googleapis.com/v2/${serviceName}`,
    {
      method: "GET",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
    },
  );
  if (!response.ok) {
    let errorPayload;
    try {
      errorPayload = await response.json();
    } catch (e) {}
    const errorMessage =
      errorPayload?.error?.message ||
      response.statusText ||
      `HTTP error ${response.status}`;
    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }
  if (response.status !== 204) {
    const result = await response.json();
    console.log(result);
    return result;
  }
  return null;
}

function getCloudBuildPayload(project, bucketName, zipFileName, targetImage) {
  return {
    source: {
      storageSource: {
        bucket: bucketName,
        object: zipFileName,
      },
    },
    steps: [
      {
        name: "gcr.io/cloud-builders/docker",
        args: ["build", "-t", targetImage, "."],
      },
      {
        name: "gcr.io/cloud-builders/docker",
        args: ["push", targetImage],
      },
    ],
    images: [targetImage],
    options: {
      logging: "CLOUD_LOGGING_ONLY",
    },
  };
}

export async function triggerCloudBuild(
  token,
  project,
  bucketName,
  zipFileName,
  targetImage,
) {
  console.log(
    `Triggering Cloud Build for gs://${bucketName}/${zipFileName} to build ${targetImage}`,
  );
  const buildPayload = getCloudBuildPayload(
    project,
    bucketName,
    zipFileName,
    targetImage,
  );

  const response = await fetch(
    `https://cloudbuild.googleapis.com/v1/projects/${project}/builds`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildPayload),
    },
  );

  const result = await response.json();
  if (result.error) {
    throw new Error(`Failed to trigger Cloud Build: ${result.error.message}`);
  }

  console.log("Cloud Build triggered successfully:", result);
  return result;
}

export async function waitCloudBuildOperation(token, project, buildId, onProgress) {
  console.log(`Waiting for Cloud Build operation: ${buildId}`);
  const buildName = `projects/${project}/builds/${buildId}`;
  let result;
  let attempts = 0;
  const maxAttempts = 60;
  const delay = 10000;

  while (attempts < maxAttempts) {
    const response = await fetch(
      `https://cloudbuild.googleapis.com/v1/${buildName}`,
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
        `Error waiting for Cloud Build operation: ${result.error.message}`,
      );
    }

    console.log(`Build status: ${result.status}`);
    if (onProgress) {
        onProgress(result.status);
    }
    if (result.status === "SUCCESS") {
      console.log("Cloud Build operation finished successfully.", result);
      const builtImageUri = result.results?.images?.[0]?.name;
      if (!builtImageUri) {
        console.warn("Could not extract built image URI from build results.");
      }
      return result;
    } else if (
      ["FAILURE", "INTERNAL_ERROR", "TIMEOUT", "CANCELLED"].includes(
        result.status,
      )
    ) {
      throw new Error(
        `Cloud Build operation failed with status ${result.status}. Check build logs in GCP console (ID: ${buildId}).`,
      );
    }

    attempts++;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error(
    `Cloud Build operation timed out after ${attempts} attempts (Build ID: ${buildId}).`,
  );
}