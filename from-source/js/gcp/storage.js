import { WEBAPP_NAME, region } from "../config.js";

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