import { WEBAPP_NAME, region } from "../config.js";

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