// Templates for the OAuth 2.0 consent and error pages.

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SHARED_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1a1a1a;
    background: #fafafa;
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  main {
    max-width: 480px;
    width: 100%;
    background: white;
    border: 1px solid #e5e5e5;
    border-radius: 16px;
    padding: 32px 28px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  h1 { font-size: 22px; margin: 0 0 8px; letter-spacing: -0.02em; }
  p { color: #6b6b6b; }
  .scopes {
    background: #f7f7f9;
    border: 1px solid #e5e5e5;
    border-radius: 10px;
    padding: 12px 16px;
    margin: 16px 0;
  }
  .scopes ul { margin: 0; padding-left: 18px; }
  .scopes li { color: #1a1a1a; }
  label { display: block; font-size: 14px; font-weight: 500; margin-top: 16px; }
  input[type="password"], input[type="text"] {
    font: inherit;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    margin-top: 4px;
  }
  input:focus {
    outline: none;
    border-color: #0066ff;
    box-shadow: 0 0 0 3px rgba(0,102,255,0.15);
  }
  .row { display: flex; gap: 8px; margin-top: 20px; }
  button {
    flex: 1;
    font: inherit;
    font-weight: 600;
    padding: 12px 16px;
    border-radius: 8px;
    cursor: pointer;
    border: 1px solid #e5e5e5;
    background: white;
    color: #1a1a1a;
  }
  button.primary { background: #0066ff; color: white; border-color: #0066ff; }
  button.primary:hover { background: #0052cc; }
  button:hover { border-color: #1a1a1a; }
  .err {
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    padding: 10px 12px;
    color: #b91c1c;
    font-size: 14px;
    margin-top: 16px;
  }
  .meta { font-size: 13px; color: #999; margin-top: 24px; word-break: break-all; }
`;

export function oauthConsentPage({ clientName, username, params, error }) {
  const hidden = (k) => `<input type="hidden" name="${k}" value="${escapeHtml(params[k])}">`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize ${escapeHtml(clientName)} — bassh</title>
<style>${SHARED_CSS}</style>
</head><body>
<main>
  <h1>Authorize ${escapeHtml(clientName)}?</h1>
  <p>This connector is requesting access to deploy on behalf of <strong>${escapeHtml(username)}</strong>.</p>

  <div class="scopes">
    <strong style="display:block; font-size:13px; text-transform:uppercase; letter-spacing:0.06em; color:#6b6b6b; margin-bottom:6px;">It will be able to</strong>
    <ul>
      <li>Deploy HTML and static sites to your bassh account</li>
      <li>List, view, and delete your projects</li>
      <li>Read form submissions on your projects</li>
    </ul>
  </div>

  <form method="POST" action="/oauth/authorize">
    ${hidden("response_type")}
    ${hidden("client_id")}
    ${hidden("redirect_uri")}
    ${hidden("scope")}
    ${hidden("state")}
    ${hidden("code_challenge")}
    ${hidden("code_challenge_method")}

    <label for="api_key">Paste your bassh API key to confirm</label>
    <input type="password" id="api_key" name="api_key" autocomplete="off" required placeholder="sk_…">
    ${error ? `<div class="err">${escapeHtml(error)}</div>` : ""}

    <div class="row">
      <button type="submit" name="action" value="deny">Cancel</button>
      <button class="primary" type="submit" name="action" value="approve">Authorize</button>
    </div>
  </form>

  <div class="meta">Don't have a key? <a href="/">Sign up at bassh.io</a> first.</div>
</main>
</body></html>`;
}

export function oauthErrorPage(message) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorization error — bassh</title>
<style>${SHARED_CSS}</style>
</head><body>
<main>
  <h1>Authorization error</h1>
  <p>${escapeHtml(message)}</p>
  <div class="meta"><a href="/">Back to bassh.io</a></div>
</main>
</body></html>`;
}
