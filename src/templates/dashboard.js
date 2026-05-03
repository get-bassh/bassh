// Post-signup dashboard. Renders once after the magic-link verify and shows
// the API key + Cowork connector setup steps. Same look as bassh.io.

import { baseHead, siteHeader, siteFooter, escapeHtml } from "./design.js";

export function dashboardPage({ username, apiKey, host }) {
  const safeUser = escapeHtml(username);
  const safeKey = escapeHtml(apiKey);
  const skillUrl = `https://${host}/skill/bassh-deploy.md`;
  const safeSkillUrl = escapeHtml(skillUrl);

  return `<!doctype html>
<html lang="en">
<head>
${baseHead(`You're in — bassh`)}
</head>
<body>
${siteHeader({ active: "" })}

<div class="container-narrow" style="padding-top: 56px; padding-bottom: 56px;">
  <h1><span style="color: var(--neon);">✓</span> You're in.</h1>
  <p style="color: var(--text-dim); margin-top: 0;">Account: <strong style="color: var(--text);">${safeUser}</strong></p>

  <h2>Your API key</h2>
  <div class="card" style="margin-bottom: 8px;">
    <div class="upper" style="font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-dim); margin-bottom: 8px;">BASSH_KEY</div>
    <div class="copy-row">
      <code id="api-key">${safeKey}</code>
      <button class="copy" data-target="api-key">Copy</button>
    </div>
  </div>
  <div class="callout warn">
    ⚠ This is the only time we show this key. Save it. If you lose it, generate a new one with <code class="inline">bassh key --regenerate</code>.
  </div>

  <h2>Add bassh to Claude Cowork</h2>
  <ol class="steps">
    <li>Open <strong>claude.ai</strong> → Settings → Connectors → <em>Add custom connector</em>.</li>
    <li>
      <div style="margin-bottom: 8px;">When asked for the connector URL, paste this and choose "I have OAuth credentials":</div>
      <div class="card">
        <div class="copy-row">
          <code id="mcp-url">https://${escapeHtml(host)}/mcp</code>
          <button class="copy" data-target="mcp-url">Copy</button>
        </div>
      </div>
    </li>
    <li>Visit <a href="/connect">/connect</a> to generate a <strong>client_id</strong> and <strong>client_secret</strong> for the OAuth fields. Paste them, save, and you're done.</li>
    <li>Open any chat and say: <em>"Deploy this artifact behind a password."</em></li>
  </ol>

  <h2>Prefer the terminal?</h2>
  <div class="card">
    <div class="copy-row">
      <code id="cli-cmd">bassh register ${safeUser} --invite ...</code>
      <button class="copy" data-target="cli-cmd">Copy</button>
    </div>
  </div>
  <p style="font-size: 14px; color: var(--text-dim); margin-top: 12px;">
    The CLI uses the same account. Install with
    <code class="inline">curl -fsSL https://raw.githubusercontent.com/get-bassh/bassh/main/install.sh | bash</code>
    and export your key as <code class="inline">BASSH_KEY</code>.
  </p>

  <h2>Skill for Claude Code (CLI)</h2>
  <p style="font-size: 14px; color: var(--text-dim);">If you use Claude Code in your terminal, drop the bassh-deploy skill into <code class="inline">~/.claude/skills/</code>:</p>
  <div class="card">
    <div class="copy-row">
      <code id="skill-url">${safeSkillUrl}</code>
      <button class="copy" data-target="skill-url">Copy</button>
    </div>
  </div>
</div>

${siteFooter()}

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
