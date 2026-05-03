// Landing page served at GET / when no auth headers are present.
// Mirrors the bassh.io marketing-site aesthetic: dark background, neon-cyan
// accent, monospace Inconsolata. The form posts to /signup/request via fetch.

import { baseHead, siteHeader, siteFooter } from "./design.js";

export function landingPage() {
  return `<!doctype html>
<html lang="en">
<head>
${baseHead("bassh — deploy artifacts privately")}
</head>
<body>
${siteHeader({ active: "" })}

<section class="hero" style="border: 0;">
  <div class="container">
    <h1>Deploy HTML from Claude.<br><span class="accent">Privately.</span></h1>
    <p>Sign up with your email. Get an API key. Deploy any artifact you make in Claude to a password-protected URL — no Cloudflare account, no terminal needed.</p>

    <form id="signup-form" novalidate style="max-width: 420px; margin: 0 auto;">
      <label for="email" class="upper">Your email</label>
      <input id="email" type="email" name="email" required autocomplete="email" placeholder="you@example.com">
      <button class="btn btn-primary btn-block" type="submit" id="submit-btn" style="margin-top: 16px;">Get started</button>
    </form>
    <div class="status" id="status" style="text-align: center;"></div>
  </div>
</section>

<section>
  <div class="container">
    <h2>What you get</h2>
    <ul class="checks" style="max-width: 540px; margin: 0 auto; display: flex; flex-direction: column; gap: 4px;">
      <li>AES-256-GCM password protection on every page you deploy.</li>
      <li>Email magic-link access for private team links.</li>
      <li>One Cowork connector — say "deploy this artifact" and it's live.</li>
      <li>One CLI for terminal users — <code class="inline">bassh ./folder</code>.</li>
      <li>Free up to Cloudflare's generous limits.</li>
    </ul>
    <div style="text-align: center; margin-top: 32px;">
      <a class="btn btn-secondary" href="https://bassh.io/features.html">See full features</a>
    </div>
  </div>
</section>

${siteFooter()}

<script>
  const form = document.getElementById('signup-form');
  const status = document.getElementById('status');
  const btn = document.getElementById('submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    status.className = 'status';
    status.textContent = '';
    const email = document.getElementById('email').value.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      status.className = 'status err';
      status.textContent = 'Please enter a valid email.';
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      const resp = await fetch('/signup/request', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ email })
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        status.className = 'status ok';
        status.textContent = '✓ Check your email for a verification link. It expires in 1 hour.';
        form.reset();
      } else {
        status.className = 'status err';
        status.textContent = data.error || 'Something went wrong. Try again in a minute.';
      }
    } catch (err) {
      status.className = 'status err';
      status.textContent = 'Network error. Check your connection.';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Get started';
    }
  });
</script>
</body>
</html>`;
}
