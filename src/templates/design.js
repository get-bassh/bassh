// Shared design system for every HTML page the bassh worker renders.
//
// One source of truth for colors, typography, and component patterns. Every
// template (landing, dashboard, oauth, connect, decrypt) imports BASE_HEAD or
// pulls in BASE_CSS so the look matches the bassh.io marketing site exactly.
// If you're tweaking visuals, this is the only place that should change.

// ============================================================
// Tokens (lifted verbatim from bassh-site/public/index.html)
// ============================================================

export const TOKENS = {
  bg: "#0a0a0a",
  surface: "#111111",
  border: "#222222",
  text: "#e0e0e0",
  textDim: "#666666",
  neon: "#00ffd5",
  neonGlow: "rgba(0, 255, 213, 0.15)",
  ok: "#00ffd5",
  err: "#ff5577",
  warn: "#ffd700",
};

const FONT_LINK =
  '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Inconsolata:wght@400;500;600;700&display=swap" rel="stylesheet">';

// ============================================================
// Base CSS — used on every page. Variables, layout, components.
// ============================================================

export const BASE_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  :root {
    --bg: ${TOKENS.bg};
    --surface: ${TOKENS.surface};
    --border: ${TOKENS.border};
    --text: ${TOKENS.text};
    --text-dim: ${TOKENS.textDim};
    --neon: ${TOKENS.neon};
    --neon-glow: ${TOKENS.neonGlow};
    --err: ${TOKENS.err};
    --warn: ${TOKENS.warn};
  }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Inconsolata', ui-monospace, SFMono-Regular, Menlo, monospace;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    font-size: 16px;
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
  }
  a { color: var(--neon); text-decoration: none; transition: opacity 0.2s; }
  a:hover { opacity: 0.8; }

  .container { max-width: 1000px; margin: 0 auto; padding: 0 24px; }
  .container-narrow { max-width: 640px; margin: 0 auto; padding: 0 24px; }

  /* Header / footer (match bassh.io chrome) */
  header { padding: 24px 0; border-bottom: 1px solid var(--border); }
  .header-inner { display: flex; justify-content: space-between; align-items: center; }
  .logo { font-size: 18px; font-weight: 600; color: var(--text); display: inline-flex; align-items: center; gap: 8px; }
  .logo:hover { opacity: 1; }
  .logo svg { color: var(--neon); }
  nav { display: flex; gap: 32px; }
  nav a { color: var(--text-dim); font-size: 14px; }
  nav a:hover { color: var(--text); opacity: 1; }
  nav a.active { color: var(--text); }

  footer { padding: 40px 0; border-top: 1px solid var(--border); text-align: center; margin-top: 80px; }
  .footer-links { display: flex; justify-content: center; gap: 32px; margin-bottom: 16px; flex-wrap: wrap; }
  .footer-links a { color: var(--text-dim); font-size: 14px; }
  .footer-links a:hover { color: var(--text); }
  .copyright { color: var(--text-dim); font-size: 12px; }

  /* Hero / page intros */
  .hero { padding: 80px 0 60px; text-align: center; }
  .hero h1 { font-size: 48px; font-weight: 700; letter-spacing: -1px; margin: 0 0 16px; line-height: 1.1; }
  .hero p { font-size: 18px; color: var(--text-dim); max-width: 540px; margin: 0 auto 40px; }
  .hero p strong { color: var(--text); font-weight: 500; }
  .hero .accent { color: var(--neon); text-shadow: 0 0 30px var(--neon-glow); }
  .cta-group { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }

  /* Headings inside content cards */
  h1 { font-size: 32px; font-weight: 700; letter-spacing: -0.5px; margin: 0 0 8px; }
  h2 { font-size: 22px; font-weight: 600; margin: 28px 0 12px; letter-spacing: -0.2px; }
  h3 { font-size: 16px; font-weight: 600; margin: 16px 0 8px; }

  /* Buttons */
  .btn {
    padding: 12px 24px;
    font-family: inherit; font-size: 14px; font-weight: 500;
    border-radius: 6px; cursor: pointer;
    transition: all 0.2s;
    display: inline-block; text-align: center;
    border: 1px solid transparent;
  }
  .btn-primary { background: var(--neon); color: var(--bg); border: none; }
  .btn-primary:hover { box-shadow: 0 0 20px var(--neon-glow); opacity: 1; }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
  .btn-secondary { background: transparent; color: var(--text); border: 1px solid var(--border); }
  .btn-secondary:hover { border-color: var(--text-dim); opacity: 1; }
  .btn-block { width: 100%; }

  /* Forms */
  label { display: block; font-size: 14px; font-weight: 500; margin: 16px 0 6px; color: var(--text); }
  label.upper {
    font-size: 11px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.5px;
    color: var(--text-dim);
    margin-bottom: 6px;
  }
  input[type="email"], input[type="text"], input[type="password"], textarea {
    width: 100%;
    font: inherit;
    padding: 10px 12px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
  }
  input::placeholder, textarea::placeholder { color: var(--text-dim); }
  input:focus, textarea:focus {
    outline: none;
    border-color: var(--neon);
    box-shadow: 0 0 0 3px var(--neon-glow);
  }

  /* Cards */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    transition: border-color 0.2s;
  }
  .card:hover { border-color: var(--text-dim); }
  .card-lg { padding: 32px; }

  /* Inline code + code blocks */
  code, pre {
    font-family: 'Inconsolata', ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  code.inline {
    font-size: 13px;
    background: var(--surface);
    color: var(--neon);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 2px 6px;
  }
  pre {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 16px;
    font-size: 13px;
    overflow-x: auto;
    color: var(--text);
  }

  /* Copy-row: a code block sat next to a "Copy" button */
  .copy-row { display: flex; align-items: center; gap: 8px; }
  .copy-row code {
    flex: 1;
    overflow: auto;
    white-space: nowrap;
    font-size: 13px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 8px 10px;
    color: var(--neon);
  }
  button.copy {
    font: inherit; font-size: 13px; font-weight: 500;
    padding: 8px 12px;
    background: transparent;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
  }
  button.copy:hover { border-color: var(--neon); color: var(--neon); }
  button.copy.copied { color: var(--neon); border-color: var(--neon); }

  /* Callouts (left-bordered notes) */
  .callout {
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--neon);
    border-radius: 6px;
    padding: 14px 16px;
    margin: 16px 0;
  }
  .callout strong { color: var(--text); }
  .callout.warn { border-left-color: var(--warn); }
  .callout.err  { border-left-color: var(--err); color: var(--text); }

  /* Status messages */
  .status { margin-top: 16px; font-size: 14px; min-height: 20px; color: var(--text-dim); }
  .status.ok { color: var(--neon); }
  .status.err { color: var(--err); }

  .err-box {
    background: rgba(255, 85, 119, 0.06);
    border: 1px solid rgba(255, 85, 119, 0.4);
    border-radius: 6px;
    padding: 10px 12px;
    color: var(--err);
    font-size: 14px;
    margin-top: 16px;
  }

  /* Badges */
  .badge {
    display: inline-block;
    font-size: 11px; font-weight: 600;
    padding: 4px 10px;
    border-radius: 4px;
    text-transform: uppercase; letter-spacing: 0.5px;
  }
  .badge.neon { background: var(--neon); color: var(--bg); }
  .badge.dim  { background: var(--border); color: var(--text); }

  /* Lists */
  ul.checks, ol.steps { padding-left: 0; list-style: none; }
  ul.checks li {
    font-size: 14px; color: var(--text-dim);
    padding: 6px 0;
    display: flex; align-items: flex-start; gap: 10px;
  }
  ul.checks li::before {
    content: "✓"; color: var(--neon);
    flex-shrink: 0;
    font-weight: 700;
  }
  ol.steps { counter-reset: step; }
  ol.steps li {
    font-size: 15px;
    padding: 10px 0 10px 36px;
    position: relative;
    counter-increment: step;
    border-bottom: 1px solid var(--border);
  }
  ol.steps li:last-child { border-bottom: 0; }
  ol.steps li::before {
    content: counter(step);
    position: absolute; left: 0; top: 12px;
    width: 24px; height: 24px;
    background: var(--surface);
    color: var(--neon);
    border: 1px solid var(--border);
    border-radius: 50%;
    text-align: center;
    font-size: 12px; font-weight: 600;
    line-height: 22px;
  }

  /* Section dividers — like the marketing site */
  section { padding: 60px 0; border-top: 1px solid var(--border); }
  section h2 { text-align: center; font-size: 26px; margin-bottom: 24px; }

  @media (max-width: 600px) {
    .hero { padding: 56px 0 32px; }
    .hero h1 { font-size: 34px; }
    nav { gap: 16px; }
  }
`;

// ============================================================
// Reusable HTML fragments
// ============================================================

// Inline SVG used as the bassh logo (matches the upload-arrow on marketing site)
const LOGO_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`;

export function siteHeader({ active = "" } = {}) {
  const item = (slug, label) =>
    `<a href="https://bassh.io/${slug === "" ? "" : slug + ".html"}"${active === slug ? ' class="active"' : ""}>${label}</a>`;
  return `<header>
  <div class="container">
    <div class="header-inner">
      <a href="https://bassh.io/" class="logo">${LOGO_SVG}<span>bassh</span></a>
      <nav>
        ${item("features", "Features")}
        ${item("pricing", "Pricing")}
        ${item("docs", "Docs")}
        <a href="/connect"${active === "connect" ? ' class="active"' : ""}>Connect</a>
        <a href="https://github.com/get-bassh/bassh">GitHub</a>
      </nav>
    </div>
  </div>
</header>`;
}

export function siteFooter() {
  const year = new Date().getFullYear();
  return `<footer>
  <div class="container">
    <div class="footer-links">
      <a href="https://bassh.io/features.html">Features</a>
      <a href="https://bassh.io/pricing.html">Pricing</a>
      <a href="https://bassh.io/docs.html">Docs</a>
      <a href="/connect">Connect</a>
      <a href="https://github.com/get-bassh/bassh">GitHub</a>
    </div>
    <div class="copyright">bassh — deploy artifacts privately. © ${year}</div>
  </div>
</footer>`;
}

// Standard <head> block. Pages just supply the title.
export function baseHead(title) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
${FONT_LINK}
<style>${BASE_CSS}</style>`;
}

// ============================================================
// HTML escape helper (consolidated from dashboard.js + oauth.js)
// ============================================================
export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================================
// Email styles — emails are LIGHT-themed and use inline styles only
// (Gmail strips <style> blocks; dark backgrounds break in many clients).
// We keep the brand reading via the neon button color and the monospace font
// stack with a Google-Fonts web font + system-mono fallback.
// ============================================================

export const EMAIL_TOKENS = {
  bg: "#ffffff",
  surface: "#fafafa",
  text: "#1a1a1a",
  textDim: "#5b5b5b",
  border: "#e5e5e5",
  neon: "#0aaa8e",          // a darker version of #00ffd5 for legibility on white
  buttonText: "#ffffff",
};

const EMAIL_FONT = "'Inconsolata', ui-monospace, SFMono-Regular, Menlo, monospace";

// Build an HTML email body. `headline` is shown bold, `bodyHtml` is the message,
// `cta` is { href, label } for the action button (optional).
export function emailBody({ headline, bodyHtml, cta }) {
  const button = cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 24px 0;"><tr><td>
        <a href="${cta.href}"
           style="display:inline-block;background:${EMAIL_TOKENS.neon};color:${EMAIL_TOKENS.buttonText};padding:12px 24px;border-radius:6px;text-decoration:none;font-family:${EMAIL_FONT};font-weight:600;">
          ${escapeHtml(cta.label)}
        </a>
      </td></tr></table>`
    : "";
  return `<div style="font-family:${EMAIL_FONT};max-width:520px;margin:0 auto;padding:32px 24px;color:${EMAIL_TOKENS.text};background:${EMAIL_TOKENS.bg};">
    <div style="font-size:14px;color:${EMAIL_TOKENS.neon};font-weight:600;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:8px;">bassh</div>
    <h1 style="font-family:${EMAIL_FONT};font-size:22px;font-weight:700;margin:0 0 12px;color:${EMAIL_TOKENS.text};letter-spacing:-0.3px;">${escapeHtml(headline)}</h1>
    <div style="font-size:15px;color:${EMAIL_TOKENS.textDim};line-height:1.6;">${bodyHtml}</div>
    ${button}
    <hr style="border:0;border-top:1px solid ${EMAIL_TOKENS.border};margin:32px 0 16px;">
    <p style="font-size:12px;color:${EMAIL_TOKENS.textDim};margin:0;">If you didn't request this, you can safely ignore this email.</p>
  </div>`;
}
