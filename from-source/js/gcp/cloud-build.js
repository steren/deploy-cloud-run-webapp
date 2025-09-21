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