import { REQUIRED_APIS } from "../config.js";

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