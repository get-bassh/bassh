// OAuth 2.0 consent + error pages. Bassh-branded to match bassh.io.

import { baseHead, siteHeader, siteFooter, escapeHtml } from "./design.js";

export function oauthConsentPage({ clientName, username, params, error }) {
  const hidden = (k) => `<input type="hidden" name="${k}" value="${escapeHtml(params[k])}">`;
  return `<!doctype html>
<html lang="en">
<head>
${baseHead(`Authorize ${clientName} — bassh`)}
</head>
<body>
${siteHeader({ active: "" })}

<div class="container-narrow" style="padding-top: 56px; padding-bottom: 56px;">
  <h1>Authorize ${escapeHtml(clientName)}?</h1>
  <p style="color: var(--text-dim);">This connector is requesting access to deploy on behalf of <strong style="color: var(--text);">${escapeHtml(username)}</strong>.</p>

  <div class="callout">
    <div class="upper" style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 8px;">It will be able to</div>
    <ul class="checks" style="margin: 0;">
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

    <label for="api_key" class="upper">Paste your bassh API key to confirm</label>
    <input type="password" id="api_key" name="api_key" autocomplete="off" required placeholder="sk_…">
    ${error ? `<div class="err-box">${escapeHtml(error)}</div>` : ""}

    <div style="display: flex; gap: 12px; margin-top: 24px;">
      <button class="btn btn-secondary btn-block" type="submit" name="action" value="deny">Cancel</button>
      <button class="btn btn-primary btn-block" type="submit" name="action" value="approve">Authorize</button>
    </div>
  </form>

  <p style="font-size: 13px; color: var(--text-dim); margin-top: 24px; text-align: center;">
    Don't have a key? <a href="/">Sign up at bassh.io</a> first.
  </p>
</div>

${siteFooter()}
</body>
</html>`;
}

export function oauthErrorPage(message) {
  return `<!doctype html>
<html lang="en">
<head>
${baseHead("Authorization error — bassh")}
</head>
<body>
${siteHeader({ active: "" })}

<div class="container-narrow" style="padding-top: 80px; padding-bottom: 80px; text-align: center;">
  <h1 style="color: var(--err);">Authorization error</h1>
  <p style="color: var(--text-dim); max-width: 480px; margin: 16px auto 32px;">${escapeHtml(message)}</p>
  <a class="btn btn-secondary" href="/">Back to bassh.io</a>
</div>

${siteFooter()}
</body>
</html>`;
}
