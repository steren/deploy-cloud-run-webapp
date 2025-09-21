import { CLIENT_ID, REDIRECT_URI } from "./config.js";

function generateCryptoRandomState() {
  const randomValues = new Uint32Array(2);
  window.crypto.getRandomValues(randomValues);
  const utf8Encoder = new TextEncoder();
  const utf8Array = utf8Encoder.encode(
    String.fromCharCode.apply(null, randomValues),
  );
  return btoa(String.fromCharCode.apply(null, utf8Array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function getTokenAndProject() {
  var token = localStorage.getItem("token");
  if (!token) {
    console.error("No access token. Get one by signing in.");
    return;
  }

  let project = document.getElementById("project").value;
  if (!project) {
    console.error("No project ID");
    return;
  }

  return { token, project };
}

export function oauth2SignIn() {
  var state = generateCryptoRandomState();
  localStorage.setItem("state", state);

  var oauth2Endpoint = "https://accounts.google.com/o/oauth2/v2/auth";

  var form = document.createElement("form");
  form.setAttribute("method", "GET");
  form.setAttribute("action", oauth2Endpoint);

  var params = {
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    state: state,
    include_granted_scopes: "true",
    response_type: "token",
  };

  for (var p in params) {
    var input = document.createElement("input");
    input.setAttribute("type", "hidden");
    input.setAttribute("name", p);
    input.setAttribute("value", params[p]);
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}