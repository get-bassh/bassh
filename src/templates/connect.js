// /connect — generate Cowork connector credentials.
//
// User flow:
//   1. Visit https://bassh.io/connect
//   2. Paste API key, click "Generate"
//   3. Get back client_id + client_secret + connector URL
//   4. Paste those three values into Claude Cowork's Custom Connector form

export function connectPage() {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Connect bassh to Claude — generate connector credentials</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #1a1a1a;
    background: #fafafa;
    min-height: 100vh;
    display: grid;
    place-items: start center;
    padding: 32px 16px;
  }
  main {
    max-width: 640px;
    width: 100%;
    background: white;
    border: 1px solid #e5e5e5;
    border-radius: 16px;
    padding: 40px 32px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -0.02em; }
  p.lede { color: #6b6b6b; margin: 0 0 28px; }
  h2 { font-size: 18px; margin: 24px 0 12px; }
  label { display: block; font-size: 14px; font-weight: 500; margin: 12px 0 4px; }
  input[type="password"], input[type="text"] {
    font: inherit;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #e5e5e5;
    border-radius: 8px;
  }
  input:focus { outline: none; border-color: #0066ff; box-shadow: 0 0 0 3px rgba(0,102,255,0.15); }
  button.primary {
    font: inherit; font-weight: 600;
    padding: 12px 16px;
    background: #0066ff; color: white; border: 0; border-radius: 8px;
    cursor: pointer; margin-top: 16px;
  }
  button.primary:hover { background: #0052cc; }
  button.primary:disabled { opacity: 0.5; cursor: progress; }
  .card {
    background: #f7f7f9;
    border: 1px solid #e5e5e5;
    border-radius: 10px;
    padding: 14px 16px;
    margin: 12px 0;
  }
  .card label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6b6b6b;
    margin: 0 0 6px;
  }
  .row { display: flex; gap: 8px; align-items: center; }
  .row code {
    flex: 1;
    overflow: auto;
    white-space: nowrap;
    font: 13px ui-monospace, SFMono-Regular, Menlo, monospace;
    background: white;
    border: 1px solid #e5e5e5;
    border-radius: 6px;
    padding: 8px 10px;
  }
  button.copy {
    font: inherit; font-size: 13px; font-weight: 500;
    padding: 8px 12px;
    background: white; color: #1a1a1a;
    border: 1px solid #e5e5e5; border-radius: 6px;
    cursor: pointer;
  }
  button.copy:hover { border-color: #1a1a1a; }
  button.copy.copied { color: #117a3b; border-color: #117a3b; }
  .err {
    background: #fef2f2; border: 1px solid #fecaca;
    border-radius: 8px; padding: 10px 12px;
    color: #b91c1c; font-size: 14px; margin-top: 16px;
  }
  .warn {
    background: #fff7e6; border: 1px solid #ffd591;
    border-radius: 8px; padding: 12px 14px;
    font-size: 14px; margin-top: 16px;
  }
  ol { padding-left: 20px; margin: 8px 0 0; }
  ol li { margin-bottom: 8px; }
  .step-vals code { font-size: 12px; }
</style>
</head><body>
<main>
  <h1>Connect bassh to Claude</h1>
  <p class="lede">Generate a credential pair to paste into Claude Cowork or Desktop's Custom Connector setup.</p>

  <section id="form-section">
    <label for="api_key">Your bassh API key</label>
    <input id="api_key" type="password" autocomplete="off" placeholder="sk_…">
    <p style="font-size:13px; color:#6b6b6b; margin:6px 0 0;">From your dashboard email after signup. Don't have one? <a href="/">Sign up</a>.</p>
    <button class="primary" id="gen-btn">Generate connector credentials</button>
    <div class="err" id="err" style="display:none;"></div>
  </section>

  <section id="result-section" style="display:none;">
    <h2>Paste these into Claude</h2>
    <p>In Claude Cowork: <strong>Settings → Connectors → Add custom connector → "I have OAuth credentials"</strong>.</p>

    <div class="card">
      <label>Server URL / MCP endpoint</label>
      <div class="row"><code id="mcp-url"></code><button class="copy" data-target="mcp-url">Copy</button></div>
    </div>

    <div class="card">
      <label>Client ID</label>
      <div class="row"><code id="client-id"></code><button class="copy" data-target="client-id">Copy</button></div>
    </div>

    <div class="card">
      <label>Client Secret</label>
      <div class="row"><code id="client-secret"></code><button class="copy" data-target="client-secret">Copy</button></div>
    </div>

    <div class="card">
      <label>Authorization URL</label>
      <div class="row"><code id="auth-url"></code><button class="copy" data-target="auth-url">Copy</button></div>
    </div>

    <div class="card">
      <label>Token URL</label>
      <div class="row"><code id="token-url"></code><button class="copy" data-target="token-url">Copy</button></div>
    </div>

    <div class="warn">⚠ The client secret is shown <strong>once</strong>. Copy it now. If you lose it, generate a new pair.</div>

    <h2>What happens next</h2>
    <ol>
      <li>Save the connector in Claude. You'll get redirected here for one-time consent.</li>
      <li>Confirm by pasting your API key on the bassh consent screen.</li>
      <li>Done — open any chat in Cowork and say "deploy this artifact".</li>
    </ol>
  </section>
</main>

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
</body></html>`;
}
