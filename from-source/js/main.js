import { service as defaultService, region, artifactRegistryRepo, builtImageName } from "./config.js";
import { getTokenAndProject, oauth2SignIn } from "./auth.js";
import {
  enableRequiredApis,
  createBucket,
  createArtifactRegistryRepo,
  waitArtifactRegistryOperation,
  triggerCloudBuild,
  waitCloudBuildOperation,
  getService,
  updateService,
  deploy,
  waitOperation,
} from "./gcp.js";

let createdBucketName = null;

async function deployAndWait() {
  let tokenAndProjectResult;
  try {
    tokenAndProjectResult = getTokenAndProject();
  } catch (e) {
    document.getElementById("status-area").textContent = `Error: ${e.message}`;
    return;
  }

  if (!tokenAndProjectResult?.token || !tokenAndProjectResult?.project) {
    document.getElementById("status-area").textContent =
      "Error: Missing token or project ID.";
    return;
  }

  const deployButton = document.getElementById("button-deploy");
  const statusArea = document.getElementById("status-area");
  const waitingMessage = document.getElementById("waiting-message");
  const deployedMessage = document.getElementById("deployed-message");

  deployButton.disabled = true;
  statusArea.textContent =
    "Please select the folder containing your Dockerfile...";
  waitingMessage.hidden = true;
  deployedMessage.hidden = true;

  document.getElementById("folder-input-after-deploy").click();
}

document
  .getElementById("folder-input-after-deploy")
  .addEventListener("change", async (event) => {
    const files = event.target.files;
    const statusArea = document.getElementById("status-area");
    const deployButton = document.getElementById("button-deploy");
    const waitingMessage = document.getElementById("waiting-message");
    const deployedMessage = document.getElementById("deployed-message");

    deployButton.disabled = true;
    waitingMessage.hidden = false;
    deployedMessage.hidden = true;

    if (!files || files.length === 0) {
      statusArea.textContent =
        "Folder selection cancelled. Ready for next deployment attempt.";
      deployButton.disabled = false;
      waitingMessage.hidden = true;
      event.target.value = null;
      return;
    }

    let token, project;
    try {
      const tokenAndProjectResult = getTokenAndProject();
      if (!tokenAndProjectResult?.token || !tokenAndProjectResult?.project) {
        throw new Error("Missing token or project ID.");
      }
      token = tokenAndProjectResult.token;
      project = tokenAndProjectResult.project;
    } catch (e) {
      statusArea.textContent = `Error: ${e.message}`;
      deployButton.disabled = false;
      waitingMessage.hidden = true;
      event.target.value = null;
      return;
    }

    try {
      statusArea.textContent = "Starting deployment process...";

      statusArea.textContent = "Creating/Verifying Cloud Storage bucket...";
      createdBucketName = await createBucket(token, project);
      console.log(`Using bucket: ${createdBucketName}`);

      statusArea.textContent = "Enabling required Google Cloud APIs...";
      await enableRequiredApis(token, project);

      statusArea.textContent =
        "Creating/Verifying Artifact Registry repository...";
      const repoOperationName = await createArtifactRegistryRepo(
        token,
        project,
      );
      await waitArtifactRegistryOperation(token, repoOperationName);
      console.log("Setup complete.");

      statusArea.textContent = "Validating folder contents...";
      let dockerfileFound = false;
      let topLevelFolder = "";
      if (files.length > 0 && files[0].webkitRelativePath) {
        const pathParts = files[0].webkitRelativePath.split("/");
        if (pathParts.length > 1) {
          topLevelFolder = pathParts[0] + "/";
        }
      }

      for (const file of files) {
        if (file.webkitRelativePath === "Dockerfile") {
          dockerfileFound = true;
          break;
        }
        if (
          topLevelFolder &&
          file.webkitRelativePath.startsWith(topLevelFolder)
        ) {
          const pathInZip = file.webkitRelativePath.substring(
            topLevelFolder.length,
          );
          if (pathInZip === "Dockerfile") {
            dockerfileFound = true;
            break;
          }
        } else if (
          !topLevelFolder &&
          file.webkitRelativePath === "Dockerfile"
        ) {
          dockerfileFound = true;
          break;
        }
      }

      if (!dockerfileFound) {
        throw new Error(
          "Validation failed: No file named 'Dockerfile' found at the root of the selected folder.",
        );
      }
      console.log("Dockerfile found.");

      statusArea.textContent = "Processing folder contents... Zipping files...";
      const zip = new JSZip();
      let fileCount = 0;
      for (const file of files) {
        let pathInZip = file.webkitRelativePath;
        if (topLevelFolder && pathInZip.startsWith(topLevelFolder)) {
          pathInZip = pathInZip.substring(topLevelFolder.length);
        }

        if (pathInZip) {
          zip.file(pathInZip, file);
          fileCount++;
        }
      }
      if (fileCount === 0)
        throw new Error(
          "Selected directory appears to be empty or contains only the top-level folder.",
        );

      statusArea.textContent = `Generating zip archive (${fileCount} files)...`;
      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      const zipFileName = `uploaded_source_${Date.now()}.zip`;

      statusArea.textContent = `Uploading ${zipFileName} to gs://${createdBucketName}...`;
      const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${createdBucketName}/o?uploadType=media&name=${encodeURIComponent(zipFileName)}`;
      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/zip",
        },
        body: zipBlob,
      });
      const uploadResult = await uploadResponse.json();
      if (uploadResult.error)
        throw new Error(`Upload failed: ${uploadResult.error.message}`);
      console.log("Upload successful:", uploadResult);

      statusArea.textContent = `Successfully uploaded ${uploadResult.name}. Triggering Cloud Build...`;
      const targetImage = `${region}-docker.pkg.dev/${project}/${artifactRegistryRepo}/${builtImageName}:latest`;
      const buildOperation = await triggerCloudBuild(
        token,
        project,
        createdBucketName,
        uploadResult.name,
        targetImage,
      );
      const buildId = buildOperation.metadata?.build?.id;
      if (!buildId)
        throw new Error("Could not get Cloud Build ID from trigger response.");

      statusArea.textContent = `Cloud Build started (ID: ${buildId}). Waiting for completion...`;
      const onBuildProgress = (status) => {
        statusArea.textContent = `Cloud Build in progress (Status: ${status})... Waiting...`;
      };
      const buildResult = await waitCloudBuildOperation(
        token,
        project,
        buildId,
        onBuildProgress,
      );

      const builtImageUriWithDigest = buildResult.results?.images?.[0]?.name;
      const finalImageUri = builtImageUriWithDigest || targetImage;
      statusArea.textContent = `Cloud Build successful. Built image: ${finalImageUri}. Deploying to Cloud Run...`;

      let deployOrUpdateResult;
      let serviceExists = false;
      try {
        console.log("Checking if service exists before final deploy/update...");
        await getService(token, project, defaultService);
        serviceExists = true;
        statusArea.textContent = `Updating existing Cloud Run service with new image...`;
        deployOrUpdateResult = await updateService(
          token,
          project,
          finalImageUri,
          defaultService,
        );
      } catch (error) {
        if (error.status === 404) {
          statusArea.textContent = `Deploying new Cloud Run service with built image...`;
          serviceExists = false;
          deployOrUpdateResult = await deploy(token, project, finalImageUri, defaultService);
        } else {
          throw error;
        }
      }
      if (deployOrUpdateResult.error) {
        throw new Error(
          `Error during Cloud Run ${serviceExists ? "update" : "deployment"}: ${deployOrUpdateResult.error.message}`,
        );
      }

      const runOperation = deployOrUpdateResult.name;
      statusArea.textContent = `Cloud Run ${serviceExists ? "update" : "deployment"} initiated (${runOperation}). Waiting for completion...`;
      await waitOperation(token, project, runOperation);

      const serviceResult = await getService(token, project, defaultService);
      const url =
        serviceResult.uri || (serviceResult.urls && serviceResult.urls[0]);
      document.getElementById("service-url").textContent = url;
      document.getElementById("service-url").href = url;
      deployedMessage.hidden = false;
      waitingMessage.hidden = true;
      statusArea.textContent = `Cloud Run service ${serviceExists ? "updated" : "deployed"} successfully with the custom image! Ready for next deployment.`;
      console.log("Full process successful.");
    } catch (error) {
      console.error("Full deployment process failed:", error);
      statusArea.textContent = `Error: ${error.message}`;
      waitingMessage.hidden = true;
    } finally {
      deployButton.disabled = false;
      event.target.value = null;
    }
  });

document
  .getElementById("button-signin")
  .addEventListener("click", oauth2SignIn);

document
  .getElementById("button-deploy")
  .addEventListener("click", deployAndWait);