// Landing page served at GET / when no auth headers are present.
// Single-screen email signup. Form posts to /signup/request via fetch.

export function landingPage() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>bassh — deploy HTML from Claude</title>
<style>
  :root {
    --fg: #1a1a1a;
    --muted: #6b6b6b;
    --bg: #fafafa;
    --accent: #0066ff;
    --border: #e5e5e5;
  }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: var(--fg);
    background: var(--bg);
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
  }
  main {
    max-width: 480px;
    width: 100%;
    background: white;
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 40px 32px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  h1 {
    font-size: 28px;
    margin: 0 0 12px;
    letter-spacing: -0.02em;
  }
  .lede {
    color: var(--muted);
    margin: 0 0 32px;
  }
  form { display: flex; flex-direction: column; gap: 12px; }
  label { font-size: 14px; font-weight: 500; }
  input[type="email"] {
    font: inherit;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: white;
  }
  input[type="email"]:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(0,102,255,0.15);
  }
  button {
    font: inherit;
    font-weight: 600;
    padding: 12px 16px;
    background: var(--accent);
    color: white;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
  }
  button:hover { background: #0052cc; }
  button:disabled { opacity: 0.5; cursor: progress; }
  .status {
    margin-top: 16px;
    font-size: 14px;
    color: var(--muted);
    min-height: 20px;
  }
  .status.ok { color: #117a3b; }
  .status.err { color: #b3261e; }
  .features {
    margin-top: 28px;
    padding-top: 24px;
    border-top: 1px solid var(--border);
    font-size: 14px;
    color: var(--muted);
  }
  .features p { margin: 0 0 8px; }
  code {
    font: 13px ui-monospace, SFMono-Regular, Menlo, monospace;
    background: #f0f0f0;
    padding: 1px 6px;
    border-radius: 4px;
  }
  footer {
    margin-top: 24px;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
  }
  footer a { color: var(--muted); }
</style>
</head>
<body>
<main>
  <h1>Deploy HTML from Claude.</h1>
  <p class="lede">Sign up with your email. Get an API key. Deploy any artifact you make in Claude to a private password-protected URL.</p>

  <form id="signup-form" novalidate>
    <label for="email">Email</label>
    <input id="email" type="email" name="email" required autocomplete="email" placeholder="you@example.com">
    <button type="submit" id="submit-btn">Get started</button>
  </form>
  <div class="status" id="status"></div>

  <div class="features">
    <p>✓ AES-256 encrypted password protection.</p>
    <p>✓ Email magic-link access for private team links.</p>
    <p>✓ One Cowork skill, one click in your conversation.</p>
  </div>

  <footer>Already have an account? Add the <a href="/skill/bassh-deploy.md">bassh-deploy skill</a> to Cowork and paste your key.</footer>
</main>

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
