// /connect — generate Cowork connector credentials. Bassh-branded.

import { baseHead, siteHeader, siteFooter } from "./design.js";

export function connectPage() {
  return `<!doctype html>
<html lang="en">
<head>
${baseHead("Connect bassh to Claude — generate connector credentials")}
</head>
<body>
${siteHeader({ active: "connect" })}

<div class="container-narrow" style="padding-top: 56px; padding-bottom: 56px;">
  <h1>Connect bassh to Claude</h1>
  <p style="color: var(--text-dim); margin-top: 0;">Generate a credential pair to paste into Claude Cowork or Desktop's Custom Connector setup.</p>

  <section id="form-section" style="border: 0; padding: 0; margin-top: 32px;">
    <label for="api_key" class="upper">Your bassh API key</label>
    <input id="api_key" type="password" autocomplete="off" placeholder="sk_…">
    <p style="font-size: 13px; color: var(--text-dim); margin: 6px 0 0;">From your dashboard email after signup. Don't have one? <a href="/">Sign up first</a>.</p>
    <button class="btn btn-primary btn-block" id="gen-btn" style="margin-top: 16px;">Generate connector credentials</button>
    <div class="err-box" id="err" style="display: none;"></div>
  </section>

  <section id="result-section" style="display: none; border: 0; padding: 0; margin-top: 32px;">
    <h2 style="text-align: left;">Paste these into Claude</h2>
    <p style="color: var(--text-dim);">In Cowork: <strong style="color: var(--text);">Settings → Connectors → Add custom connector → "I have OAuth credentials"</strong>.</p>

    <div class="card" style="margin-top: 16px;">
      <div class="upper" style="margin-bottom: 8px;">SERVER URL / MCP ENDPOINT</div>
      <div class="copy-row"><code id="mcp-url"></code><button class="copy" data-target="mcp-url">Copy</button></div>
    </div>

    <div class="card" style="margin-top: 12px;">
      <div class="upper" style="margin-bottom: 8px;">CLIENT ID</div>
      <div class="copy-row"><code id="client-id"></code><button class="copy" data-target="client-id">Copy</button></div>
    </div>

    <div class="card" style="margin-top: 12px;">
      <div class="upper" style="margin-bottom: 8px;">CLIENT SECRET</div>
      <div class="copy-row"><code id="client-secret"></code><button class="copy" data-target="client-secret">Copy</button></div>
    </div>

    <div class="card" style="margin-top: 12px;">
      <div class="upper" style="margin-bottom: 8px;">AUTHORIZATION URL</div>
      <div class="copy-row"><code id="auth-url"></code><button class="copy" data-target="auth-url">Copy</button></div>
    </div>

    <div class="card" style="margin-top: 12px;">
      <div class="upper" style="margin-bottom: 8px;">TOKEN URL</div>
      <div class="copy-row"><code id="token-url"></code><button class="copy" data-target="token-url">Copy</button></div>
    </div>

    <div class="callout warn" style="margin-top: 16px;">
      <strong>Heads up.</strong> The client secret is shown <strong>once</strong>. Copy it now. If you lose it, generate a new pair.
    </div>

    <h2 style="text-align: left; margin-top: 32px;">What happens next</h2>
    <ol class="steps">
      <li>Save the connector in Claude. You'll get redirected here for one-time consent.</li>
      <li>Confirm by pasting your API key on the bassh consent screen.</li>
      <li>Done — open any chat in Cowork and say "deploy this artifact".</li>
    </ol>
  </section>
</div>

${siteFooter()}

<script>
  const origin = location.origin;
  document.getElementById('mcp-url').textContent = origin + '/mcp';
  document.getElementById('auth-url').textContent = origin + '/oauth/authorize';
  document.getElementById('token-url').textContent = origin + '/oauth/token';

  document.getElementById('gen-btn').addEventListener('click', async () => {
    const key = document.getElementById('api_key').value.trim();
    const err = document.getElementById('err');
    err.style.display = 'none';
    if (!key.startsWith('sk_')) {
      err.textContent = 'Enter a valid bassh API key (starts with sk_).';
      err.style.display = 'block';
      return;
    }
    const btn = document.getElementById('gen-btn');
    btn.disabled = true;
    btn.textContent = 'Generating…';
    try {
      const r = await fetch('/oauth/clients', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: 'Cowork connector' })
      });
      const data = await r.json();
      if (!r.ok) {
        err.textContent = data.error || 'Could not generate credentials.';
        err.style.display = 'block';
        return;
      }
      document.getElementById('client-id').textContent = data.client_id;
      document.getElementById('client-secret').textContent = data.client_secret;
      document.getElementById('form-section').style.display = 'none';
      document.getElementById('result-section').style.display = 'block';
    } catch (e) {
      err.textContent = 'Network error. Try again.';
      err.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate connector credentials';
    }
  });

  document.querySelectorAll('button.copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      try {
        await navigator.clipboard.writeText(target.textContent);
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
      } catch (e) {}
    });
  });
</script>
</body>
</html>`;
}
