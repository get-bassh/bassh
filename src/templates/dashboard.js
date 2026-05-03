// Dashboard rendered after a successful magic-link signup verification.
// Shows the user their API key and step-by-step Cowork connector setup.

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function dashboardPage({ username, apiKey, host }) {
  const safeUser = escapeHtml(username);
  const safeKey = escapeHtml(apiKey);
  const skillUrl = `https://${host}/skill/bassh-deploy.md`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>You're in — bassh</title>
<style>
  :root {
    --fg: #1a1a1a;
    --muted: #6b6b6b;
    --bg: #fafafa;
    --accent: #0066ff;
    --ok: #117a3b;
    --border: #e5e5e5;
  }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: var(--fg);
    background: var(--bg);
    padding: 32px 16px;
  }
  main {
    max-width: 640px;
    margin: 0 auto;
    background: white;
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 40px 32px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  h1 {
    font-size: 26px;
    margin: 0 0 4px;
    letter-spacing: -0.02em;
  }
  h1 .check { color: var(--ok); margin-right: 6px; }
  .sub { color: var(--muted); margin: 0 0 32px; }
  h2 {
    font-size: 18px;
    margin: 28px 0 12px;
  }
  .card {
    background: #f7f7f9;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    margin: 8px 0 16px;
  }
  .card label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .row code {
    flex: 1;
    overflow: auto;
    white-space: nowrap;
    font: 13px ui-monospace, SFMono-Regular, Menlo, monospace;
    background: white;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
  }
  button.copy {
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    padding: 8px 12px;
    background: white;
    color: var(--fg);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
  }
  button.copy:hover { border-color: var(--fg); }
  button.copy.copied { color: var(--ok); border-color: var(--ok); }
  ol {
    padding-left: 20px;
    margin: 0;
  }
  ol li { margin-bottom: 12px; }
  .warn {
    background: #fff7e6;
    border: 1px solid #ffd591;
    border-radius: 8px;
    padding: 12px 14px;
    font-size: 14px;
    margin-top: 24px;
  }
  footer {
    margin-top: 32px;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
  }
  footer a { color: var(--muted); }
</style>
</head>
<body>
<main>
  <h1><span class="check">✓</span> You're in.</h1>
  <p class="sub">Account: <strong>${safeUser}</strong></p>

  <h2>Your API key</h2>
  <div class="card">
    <label>BASSH_KEY</label>
    <div class="row">
      <code id="api-key">${safeKey}</code>
      <button class="copy" data-target="api-key">Copy</button>
    </div>
  </div>
  <div class="warn">⚠️  This is the only time we show this key. Save it. If you lose it, you'll need to rotate.</div>

  <h2>Add bassh to Claude Cowork</h2>
  <ol>
    <li>Open <strong>claude.ai</strong> → Settings → Skills → <em>Add custom skill</em>.</li>
    <li>Paste this URL when asked for the skill source:
      <div class="card">
        <div class="row">
          <code id="skill-url">${escapeHtml(skillUrl)}</code>
          <button class="copy" data-target="skill-url">Copy</button>
        </div>
      </div>
    </li>
    <li>When prompted for <code style="font:13px ui-monospace,Menlo,monospace;background:#f0f0f0;padding:1px 6px;border-radius:4px;">BASSH_KEY</code>, paste the key from above.</li>
    <li>Open any chat in Cowork and say:<br><em>"Deploy this artifact behind a password."</em></li>
  </ol>

  <h2>Prefer the terminal?</h2>
  <div class="card">
    <div class="row">
      <code>bassh register ${safeUser} --invite ...</code>
    </div>
  </div>
  <p class="sub" style="font-size:14px;">The CLI uses the same account. Run <code style="font:13px ui-monospace,Menlo,monospace;background:#f0f0f0;padding:1px 6px;border-radius:4px;">curl -fsSL https://raw.githubusercontent.com/get-bassh/bassh/main/install.sh | bash</code> to install it, then export <code style="font:13px ui-monospace,Menlo,monospace;background:#f0f0f0;padding:1px 6px;border-radius:4px;">BASSH_KEY=${safeKey.slice(0,8)}...</code> in your shell.</p>

  <footer>Need to start over? <a href="/">Back to landing</a></footer>
</main>

<script>
  document.querySelectorAll('button.copy').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      try {
        await navigator.clipboard.writeText(target.textContent);
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = original;
          btn.classList.remove('copied');
        }, 1500);
      } catch (e) {
        // Fallback: select the text
        const range = document.createRange();
        range.selectNode(target);
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      }
    });
  });
</script>
</body>
</html>`;
}
