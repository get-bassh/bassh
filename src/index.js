// bassh-worker: Multi-tenant deployment backend for Cloudflare Pages
// Deploy this worker once, then anyone with the CLI can deploy sites to your account

import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";
import { landingPage } from "./templates/landing.js";
import { dashboardPage } from "./templates/dashboard.js";
import { SKILL_MARKDOWN } from "./templates/skill.js";
import { connectPage } from "./templates/connect.js";
import { oauthErrorPage } from "./templates/oauth.js";
import { handleMCP } from "./mcp.js";
import { emailBody } from "./templates/design.js";
import {
  handleOAuthDiscovery,
  handleOAuthAuthorize,
  handleOAuthToken,
  handleOAuthClientCreate,
  getUserByMcpToken,
} from "./oauth.js";

// ============================================================
// AUTHENTICATION & USER MANAGEMENT
// ============================================================

// Generate a secure API key
function generateApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const key = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `sk_${key}`;
}

// Validate username format
function isValidUsername(username) {
  return /^[a-z0-9][a-z0-9_-]{2,19}$/.test(username);
}

// Look up user by API key
async function getUserByKey(env, apiKey) {
  if (!apiKey || !apiKey.startsWith('sk_')) return null;
  const data = await env.USERS.get(`key:${apiKey}`, 'json');
  return data; // { username: "..." } or null
}

// Hybrid authentication: try machine ID first, then API key
async function authenticateRequest(request, env) {
  // Try machine ID first (simplest for CLI users)
  const machineId = request.headers.get('X-Machine-ID');
  if (machineId) {
    const machineUser = await getUserByMachineId(env, machineId);
    if (machineUser) {
      return machineUser; // { username: "..." }
    }
  }

  // Fall back to API key (for CI/CD, scripts, unregistered machines)
  const apiKey = request.headers.get('X-API-Key');
  if (apiKey) {
    const keyUser = await getUserByKey(env, apiKey);
    if (keyUser) {
      return keyUser;
    }
  }

  return null;
}

// Look up user by username
async function getUserByUsername(env, username) {
  const data = await env.USERS.get(`user:${username}`, 'json');
  return data; // { key: "...", created: "..." } or null
}

// Look up user by machine ID
async function getUserByMachineId(env, machineId) {
  if (!machineId) return null;
  const data = await env.USERS.get(`machine:${machineId}`, 'json');
  return data; // { username: "..." } or null
}

// Create a user record in KV. Shared between CLI registration (handleRegister)
// and web magic-link signup (handleSignupVerify). Returns the API key.
async function createUser(env, username, machineId = '') {
  const apiKey = generateApiKey();
  const created = new Date().toISOString();
  await env.USERS.put(`user:${username}`, JSON.stringify({ key: apiKey, created, machineId }));
  await env.USERS.put(`key:${apiKey}`, JSON.stringify({ username }));
  if (machineId) {
    await env.USERS.put(`machine:${machineId}`, JSON.stringify({ username }));
  }
  return apiKey;
}

// Handle user registration
async function handleRegister(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const username = (body.username || '').toLowerCase().trim();
    const registrationCode = body.registrationCode || '';
    const machineId = body.machineId || '';

    // Check registration code if configured
    if (env.REGISTRATION_CODE && registrationCode !== env.REGISTRATION_CODE) {
      return new Response(JSON.stringify({ error: 'Invalid registration code' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate username
    if (!isValidUsername(username)) {
      return new Response(JSON.stringify({
        error: 'Invalid username. Must be 3-20 characters, lowercase alphanumeric, can include _ and -, must start with letter or number.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if machine already has an account (one-account-per-computer)
    if (machineId) {
      const existingMachine = await getUserByMachineId(env, machineId);
      if (existingMachine) {
        return new Response(JSON.stringify({
          error: `This computer already has an account: ${existingMachine.username}. Use 'bassh me' to check your current account.`
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Check if username exists
    const existing = await getUserByUsername(env, username);
    if (existing) {
      return new Response(JSON.stringify({ error: 'Username already taken' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate API key and store user (shared with web signup path)
    const apiKey = await createUser(env, username, machineId);

    return new Response(JSON.stringify({
      success: true,
      username,
      key: apiKey,
      message: 'Registration successful! Save your API key - it cannot be recovered.'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Handle /me endpoint
async function handleMe(request, env, corsHeaders) {
  const user = await authenticateRequest(request, env);

  if (!user) {
    return new Response(JSON.stringify({
      error: 'Not authenticated. Register this machine or provide API key.'
    }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const userData = await getUserByUsername(env, user.username);

  // Build invite code if REGISTRATION_CODE is set
  let inviteCode = null;
  if (env.REGISTRATION_CODE) {
    const url = new URL(request.url);
    // Extract subdomain from hostname (e.g., "bassh-api.bob-rietveld.workers.dev" -> "bob-rietveld")
    const hostParts = url.hostname.split('.');
    if (hostParts.length >= 3 && hostParts.slice(-2).join('.') === 'workers.dev') {
      const subdomain = hostParts.slice(0, -2).join('.').replace(/^[^.]+\./, '');
      inviteCode = `${subdomain}:${env.REGISTRATION_CODE}`;
    }
  }

  return new Response(JSON.stringify({
    success: true,
    username: user.username,
    created: userData?.created,
    inviteCode: inviteCode
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Handle /key endpoint - get or regenerate API key
async function handleKey(request, env, corsHeaders) {
  const user = await authenticateRequest(request, env);

  if (!user) {
    return new Response(JSON.stringify({
      error: 'Not authenticated. Register this machine or provide API key.'
    }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const username = user.username;
  const userData = await getUserByUsername(env, username);

  if (!userData) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // GET = show current key, POST = regenerate
  if (request.method === 'GET') {
    return new Response(JSON.stringify({
      success: true,
      username,
      key: userData.key
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (request.method === 'POST') {
    const oldKey = userData.key;
    const newKey = generateApiKey();

    // Update user record with new key
    await env.USERS.put(`user:${username}`, JSON.stringify({
      ...userData,
      key: newKey
    }));

    // Delete old key mapping, create new one
    if (oldKey) {
      await env.USERS.delete(`key:${oldKey}`);
    }
    await env.USERS.put(`key:${newKey}`, JSON.stringify({ username }));

    return new Response(JSON.stringify({
      success: true,
      username,
      key: newKey,
      message: 'API key regenerated. Old key is now invalid.'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// ============================================================
// ENCRYPTION (PageCrypt-style AES-256-GCM)
// ============================================================

async function encryptHTML(htmlContent, password) {
  const encoder = new TextEncoder();

  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encoder.encode(htmlContent)
  );

  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);

  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < combined.length; i += chunkSize) {
    const chunk = combined.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function getDecryptTemplate(encryptedData) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Protected — bassh</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inconsolata:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    :root {
      --bg: #0a0a0a; --surface: #111111; --border: #222222;
      --text: #e0e0e0; --text-dim: #666666;
      --neon: #00ffd5; --neon-glow: rgba(0, 255, 213, 0.15);
      --err: #ff5577;
    }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: 'Inconsolata', ui-monospace, SFMono-Regular, Menlo, monospace;
      background: var(--bg); color: var(--text);
      line-height: 1.6; font-size: 16px;
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
    }
    .container {
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 32px 28px;
      border-radius: 12px;
      max-width: 380px; width: 100%;
      opacity: 0; transition: opacity 0.2s;
    }
    .container.visible { opacity: 1; }
    h1 { font-size: 20px; font-weight: 700; color: var(--text); margin: 0 0 6px; letter-spacing: -0.2px; }
    p { color: var(--text-dim); font-size: 14px; margin: 0 0 20px; }
    input {
      width: 100%; padding: 10px 12px;
      background: var(--bg); color: var(--text);
      border: 1px solid var(--border); border-radius: 6px;
      font-family: inherit; font-size: 15px;
      margin-bottom: 12px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input::placeholder { color: var(--text-dim); }
    input:focus { outline: none; border-color: var(--neon); box-shadow: 0 0 0 3px var(--neon-glow); }
    button {
      width: 100%; padding: 12px;
      background: var(--neon); color: var(--bg);
      border: 0; border-radius: 6px;
      font-family: inherit; font-size: 14px; font-weight: 600;
      cursor: pointer;
      transition: box-shadow 0.2s, opacity 0.2s;
    }
    button:hover { box-shadow: 0 0 20px var(--neon-glow); }
    button:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
    .error {
      color: var(--err); font-size: 13px;
      margin: 12px 0 0; display: none;
    }
    .icon {
      width: 44px; height: 44px;
      background: var(--bg); border: 1px solid var(--border);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 16px;
    }
    .icon svg { width: 22px; height: 22px; color: var(--neon); }
    .brand {
      font-size: 11px; font-weight: 600;
      color: var(--text-dim);
      text-transform: uppercase; letter-spacing: 1px;
      margin-top: 24px; text-align: center;
    }
    .brand a { color: var(--text-dim); text-decoration: none; }
    .brand a:hover { color: var(--neon); }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    </div>
    <h1>Protected page</h1>
    <p>Enter the password to view this content.</p>
    <form id="form">
      <input type="password" id="password" placeholder="Password" autofocus required>
      <button type="submit" id="btn">Unlock</button>
    </form>
    <p class="error" id="error">Incorrect password. Try again.</p>
    <div class="brand"><a href="https://bassh.io" target="_blank">via bassh</a></div>
  </div>

  <script>
    const ENCRYPTED = "${encryptedData}";
    const STORAGE_KEY = 'bassh-pw';

    async function decrypt(password) {
      try {
        const data = Uint8Array.from(atob(ENCRYPTED), c => c.charCodeAt(0));
        const salt = data.slice(0, 32);
        const iv = data.slice(32, 48);
        const ciphertext = data.slice(48);

        const keyMaterial = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(password),
          'PBKDF2',
          false,
          ['deriveKey']
        );

        const key = await crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
          keyMaterial,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt']
        );

        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          key,
          ciphertext
        );

        return new TextDecoder().decode(decrypted);
      } catch (e) {
        return null;
      }
    }

    async function tryDecrypt(password, saveOnSuccess) {
      const html = await decrypt(password);
      if (html) {
        if (saveOnSuccess) {
          sessionStorage.setItem(STORAGE_KEY, password);
        }
        document.open();
        document.write(html);
        document.close();
        return true;
      }
      return false;
    }

    (async () => {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored && await tryDecrypt(stored, false)) return;

      document.querySelector('.container').classList.add('visible');
      document.getElementById('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn');
        const error = document.getElementById('error');
        const password = document.getElementById('password').value;

        btn.disabled = true;
        btn.textContent = 'Decrypting...';
        error.style.display = 'none';

        if (!await tryDecrypt(password, true)) {
          error.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Unlock';
        }
      });
    })();
  </script>
</body>
</html>`;
}

// ============================================================
// EMAIL OTP ENCRYPTION (Key-based AES-256-GCM)
// ============================================================

// Generate a random encryption key (hex string)
function generateEncryptionKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Generate a random OTP code
function generateOTP() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

// Encrypt HTML with a raw key (not password-derived)
async function encryptHTMLWithKey(htmlContent, hexKey) {
  const encoder = new TextEncoder();

  // Convert hex key to bytes
  const keyBytes = new Uint8Array(hexKey.match(/.{2}/g).map(b => parseInt(b, 16)));
  const iv = crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encoder.encode(htmlContent)
  );

  // Combine IV + encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < combined.length; i += chunkSize) {
    const chunk = combined.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

// Template for email OTP protected pages
function getOTPDecryptTemplate(encryptedData, projectName, apiUrl, allowedEmails) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Protected — bassh</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inconsolata:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    :root {
      --bg: #0a0a0a; --surface: #111111; --border: #222222;
      --text: #e0e0e0; --text-dim: #666666;
      --neon: #00ffd5; --neon-glow: rgba(0, 255, 213, 0.15);
      --err: #ff5577; --ok: #00ffd5;
    }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: 'Inconsolata', ui-monospace, SFMono-Regular, Menlo, monospace;
      background: var(--bg); color: var(--text);
      line-height: 1.6; font-size: 16px;
      min-height: 100vh;
      display: flex; align-items: center; justify-content: center;
      padding: 24px;
    }
    .container {
      background: var(--surface);
      border: 1px solid var(--border);
      padding: 32px 28px;
      border-radius: 12px;
      max-width: 380px; width: 100%;
      text-align: center;
    }
    h1 { font-size: 20px; font-weight: 700; color: var(--text); margin: 0 0 6px; letter-spacing: -0.2px; }
    p { color: var(--text-dim); font-size: 14px; margin: 0 0 20px; }
    input {
      width: 100%; padding: 10px 12px;
      background: var(--bg); color: var(--text);
      border: 1px solid var(--border); border-radius: 6px;
      font-family: inherit; font-size: 15px;
      margin-bottom: 12px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    input::placeholder { color: var(--text-dim); }
    input:focus { outline: none; border-color: var(--neon); box-shadow: 0 0 0 3px var(--neon-glow); }
    button {
      width: 100%; padding: 12px;
      background: var(--neon); color: var(--bg);
      border: 0; border-radius: 6px;
      font-family: inherit; font-size: 14px; font-weight: 600;
      cursor: pointer;
      transition: box-shadow 0.2s, opacity 0.2s;
    }
    button:hover { box-shadow: 0 0 20px var(--neon-glow); }
    button:disabled { opacity: 0.5; cursor: not-allowed; box-shadow: none; }
    .error { color: var(--err); font-size: 13px; margin: 12px 0 0; display: none; }
    .success { color: var(--ok); font-size: 13px; margin: 12px 0 0; display: none; }
    .icon {
      width: 44px; height: 44px;
      background: var(--bg); border: 1px solid var(--border);
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 16px;
    }
    .icon svg { width: 22px; height: 22px; color: var(--neon); }
    .hidden { display: none; }
    .brand {
      font-size: 11px; font-weight: 600;
      color: var(--text-dim);
      text-transform: uppercase; letter-spacing: 1px;
      margin-top: 24px;
    }
    .brand a { color: var(--text-dim); text-decoration: none; }
    .brand a:hover { color: var(--neon); }
  </style>
</head>
<body>
  <div class="container" id="emailForm">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    </div>
    <h1>Protected page</h1>
    <p>Enter your email to receive an access link.</p>
    <form id="form">
      <input type="email" id="email" placeholder="Email address" autofocus required>
      <button type="submit" id="btn">Send access link</button>
    </form>
    <p class="error" id="error"></p>
    <p class="success" id="success">Check your inbox for the access link.</p>
    <div class="brand"><a href="https://bassh.io" target="_blank">via bassh</a></div>
  </div>

  <div class="container hidden" id="verifying">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    </div>
    <h1>Verifying…</h1>
    <p>Please wait while we verify your access.</p>
    <p class="error" id="verifyError"></p>
    <div class="brand"><a href="https://bassh.io" target="_blank">via bassh</a></div>
  </div>

  <script>
    (async function() {
      const ENCRYPTED = "${encryptedData}";
      const PROJECT = "${projectName}";
      const API_URL = "${apiUrl}";
      const ALLOWED = ${JSON.stringify(allowedEmails)};
      const SESSION_KEY = 'bassh_session_' + PROJECT;
      const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours

      function showLoginForm() {
        document.body.style.visibility = 'visible';
      }

      function replaceWithDecryptedContent(html) {
        // Parse the decrypted HTML
        const parser = new DOMParser();
        const newDoc = parser.parseFromString(html, 'text/html');

        // Replace entire document content
        document.head.innerHTML = newDoc.head.innerHTML;
        document.body.innerHTML = newDoc.body.innerHTML;

        // Copy body attributes (class, style, etc.)
        Array.from(newDoc.body.attributes).forEach(attr => {
          document.body.setAttribute(attr.name, attr.value);
        });

        // Re-execute scripts (they don't run when added via innerHTML)
        document.querySelectorAll('script').forEach(oldScript => {
          const newScript = document.createElement('script');
          Array.from(oldScript.attributes).forEach(attr => {
            newScript.setAttribute(attr.name, attr.value);
          });
          newScript.textContent = oldScript.textContent;
          oldScript.parentNode.replaceChild(newScript, oldScript);
        });
      }

      try {
        // Check for existing session first (with expiry)
        const storedData = localStorage.getItem(SESSION_KEY);
        if (storedData) {
          try {
            const session = JSON.parse(storedData);
            // Check if session expired
            if (session.expires && session.expires > Date.now()) {
              const html = await decrypt(session.key);
              if (html) {
                // Session valid, show content immediately
                replaceWithDecryptedContent(html);
                return;
              }
            }
          } catch (e) {
            console.error('Session parse error:', e);
          }
          // Session invalid or expired, clear it
          localStorage.removeItem(SESSION_KEY);
        }

        // Check for OTP in URL
        const params = new URLSearchParams(window.location.search);
        const otp = params.get('otp');

        if (otp) {
          // Verify OTP and decrypt
          showLoginForm();
          document.getElementById('emailForm').classList.add('hidden');
          document.getElementById('verifying').classList.remove('hidden');
          verifyAndDecrypt(otp);
          return;
        }
      } catch (e) {
        console.error('Session error:', e);
        localStorage.removeItem(SESSION_KEY);
      }

      // No session, no OTP, or error - show login form
      showLoginForm();

      async function verifyAndDecrypt(otp) {
        try {
          const res = await fetch(API_URL + '/otp/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ otp, project: PROJECT })
          });

          const data = await res.json();

          if (!res.ok || !data.key) {
            document.getElementById('verifyError').textContent = data.error || 'Invalid or expired link';
            document.getElementById('verifyError').style.display = 'block';
            return;
          }

          // Store session key for future page loads (with 24h expiry, works across tabs)
          localStorage.setItem(SESSION_KEY, JSON.stringify({
            key: data.key,
            expires: Date.now() + SESSION_DURATION
          }));

          // Decrypt with the key
          const html = await decrypt(data.key);
          if (html) {
            // Clear URL params and replace page
            window.history.replaceState({}, '', window.location.pathname);
            replaceWithDecryptedContent(html);
          } else {
            document.getElementById('verifyError').textContent = 'Failed to decrypt content';
            document.getElementById('verifyError').style.display = 'block';
          }
        } catch (e) {
          document.getElementById('verifyError').textContent = 'Network error. Please try again.';
          document.getElementById('verifyError').style.display = 'block';
        }
      }

      async function decrypt(hexKey) {
        try {
          const combined = Uint8Array.from(atob(ENCRYPTED), c => c.charCodeAt(0));
          const iv = combined.slice(0, 16);
          const data = combined.slice(16);

          const keyBytes = new Uint8Array(hexKey.match(/.{2}/g).map(b => parseInt(b, 16)));

          const key = await crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
          );

          const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            data
          );

          return new TextDecoder().decode(decrypted);
        } catch (e) {
          return null;
        }
      }

      // Email form submission
      document.getElementById('form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value.trim().toLowerCase();
        const btn = document.getElementById('btn');
        const error = document.getElementById('error');
        const success = document.getElementById('success');

        // Client-side allowlist check
        let allowed = false;
        for (const pattern of ALLOWED) {
          if (pattern.startsWith('@')) {
            if (email.endsWith(pattern)) allowed = true;
          } else {
            if (email === pattern.toLowerCase()) allowed = true;
          }
        }

        if (!allowed) {
          error.textContent = 'This email is not authorized to access this page.';
          error.style.display = 'block';
          success.style.display = 'none';
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Sending...';
        error.style.display = 'none';

        try {
          const res = await fetch(API_URL + '/otp/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              project: PROJECT,
              pageUrl: window.location.origin + window.location.pathname
            })
          });

          const data = await res.json();

          if (res.ok) {
            success.style.display = 'block';
            btn.textContent = 'Link Sent';
          } else {
            error.textContent = data.error || 'Failed to send link';
            error.style.display = 'block';
            btn.disabled = false;
            btn.textContent = 'Send Access Link';
          }
        } catch (e) {
          error.textContent = 'Network error. Please try again.';
          error.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Send Access Link';
        }
      });
    })();
  </script>
</body>
</html>`;
}

// Handle OTP request - send magic link email
async function handleOTPRequest(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { email, project, pageUrl } = body;

    if (!email || !project || !pageUrl) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if project exists and has OTP protection
    const keyData = await env.USERS.get(`otp-key:${project}`, 'json');
    if (!keyData) {
      return new Response(JSON.stringify({ error: 'Invalid project' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check email against allowlist
    const allowedEmails = keyData.emails || [];
    let allowed = false;
    const emailLower = email.toLowerCase();
    for (const pattern of allowedEmails) {
      if (pattern.startsWith('@')) {
        if (emailLower.endsWith(pattern.toLowerCase())) allowed = true;
      } else {
        if (emailLower === pattern.toLowerCase()) allowed = true;
      }
    }

    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Email not authorized' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Rate limit: 10 requests per email per 15 minutes
    const rateLimitKey = `otp-rate:${project}:${emailLower}`;
    const rateCount = parseInt(await env.USERS.get(rateLimitKey) || '0');
    if (rateCount >= 10) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please wait 15 minutes.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    await env.USERS.put(rateLimitKey, String(rateCount + 1), { expirationTtl: 900 });

    // Generate OTP and store it
    const otp = generateOTP();
    const otpKey = `otp:${project}:${otp}`;
    await env.USERS.put(otpKey, JSON.stringify({
      email: emailLower,
      created: new Date().toISOString()
    }), { expirationTtl: 10800 }); // 3 hour expiry

    // Build magic link
    const magicLink = `${pageUrl}?otp=${otp}`;

    // Send email via Resend
    if (!env.RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'Email service not configured. Set RESEND_API_KEY secret.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const senderEmail = env.EMAIL_FROM || 'access@bassh.io';

    try {
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: `bassh <${senderEmail}>`,
          to: [email],
          subject: 'Your access link',
          html: emailBody({
            headline: 'Access requested',
            bodyHtml: `<p>Click the button below to open the protected page. This link expires in 3 hours and can only be used once.</p>`,
            cta: { href: magicLink, label: 'Open page' }
          })
        })
      });

      if (!resendResponse.ok) {
        const errorData = await resendResponse.json();
        console.error('Resend error:', errorData);
        return new Response(JSON.stringify({ error: 'Failed to send email', details: errorData.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    } catch (emailError) {
      console.error('Email error:', emailError);
      return new Response(JSON.stringify({ error: 'Failed to send email', details: emailError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal error', message: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Handle OTP verify - check OTP and return decryption key
async function handleOTPVerify(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const { otp, project } = body;

    if (!otp || !project) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Look up OTP
    const otpKey = `otp:${project}:${otp}`;
    const otpData = await env.USERS.get(otpKey, 'json');

    if (!otpData) {
      return new Response(JSON.stringify({ error: 'Invalid or expired link' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Delete OTP (one-time use)
    await env.USERS.delete(otpKey);

    // Get encryption key
    const keyData = await env.USERS.get(`otp-key:${project}`, 'json');
    if (!keyData || !keyData.key) {
      return new Response(JSON.stringify({ error: 'Key not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      key: keyData.key
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal error', message: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ============================================================
// WEB SIGNUP (magic link)
// ============================================================
// Lets non-terminal users get a bassh API key from a browser.
// Reuses the same Resend integration that powers the per-page OTP flow.

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Rate-limit signup magic-link requests: 3 per hour per email.
async function checkSignupRateLimit(env, email) {
  const key = `signup-rate:${email}`;
  const current = parseInt(await env.USERS.get(key) || '0');
  if (current >= 3) return false;
  await env.USERS.put(key, String(current + 1), { expirationTtl: 3600 });
  return true;
}

// Derive a username from an email local-part. Suffix with digits if taken.
async function deriveUsername(env, email) {
  const local = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_-]/g, '');
  const base = local.length >= 3 ? local : (local + 'user').slice(0, 20);
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? base : `${base}${i + 1}`;
    if (candidate.length > 20) continue;
    if (!isValidUsername(candidate)) continue;
    const existing = await getUserByUsername(env, candidate);
    if (!existing) return candidate;
  }
  return null; // give up after 100 tries
}

// POST /signup/request — body {email}. Sends magic link via Resend.
async function handleSignupRequest(request, env, corsHeaders, origin) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = (body.email || '').toLowerCase().trim();
    if (!isValidEmail(email)) {
      return new Response(JSON.stringify({ error: 'Please enter a valid email address.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (!(await checkSignupRateLimit(env, email))) {
      return new Response(JSON.stringify({ error: 'Too many requests for this email. Try again in an hour.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (!env.RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'Email service not configured.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate token and store mapping. 1-hour TTL.
    const tokenBytes = crypto.getRandomValues(new Uint8Array(24));
    const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    await env.USERS.put(`signup:${token}`, JSON.stringify({ email, ts: Date.now() }), { expirationTtl: 3600 });

    const verifyLink = `${origin}/signup/verify?token=${token}`;
    const senderEmail = env.EMAIL_FROM || 'access@bassh.io';

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `bassh <${senderEmail}>`,
        to: [email],
        subject: 'Verify your bassh account',
        html: emailBody({
          headline: 'Welcome to bassh',
          bodyHtml: `<p>Click the button below to finish creating your account. This link expires in 1 hour and can only be used once.</p>`,
          cta: { href: verifyLink, label: 'Verify email' }
        })
      })
    });
    if (!resendResponse.ok) {
      const errorData = await resendResponse.json().catch(() => ({}));
      return new Response(JSON.stringify({ error: 'Failed to send verification email.', details: errorData.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Internal error', message: e.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// GET /signup/verify?token=… — creates the account and renders the dashboard.
async function handleSignupVerify(request, env, corsHeaders, host) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const htmlHeaders = { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' };
  const errorPage = (msg) => new Response(oauthErrorPage(msg), { status: 400, headers: htmlHeaders });
  if (!token) {
    return errorPage('Missing token. Open the link from your email.');
  }
  const data = await env.USERS.get(`signup:${token}`, 'json');
  if (!data) {
    return errorPage('This verification link is invalid or has expired. Request a new one from the home page.');
  }
  // One-time use
  await env.USERS.delete(`signup:${token}`);

  const email = data.email;
  const username = await deriveUsername(env, email);
  if (!username) {
    return new Response(oauthErrorPage('Could not derive a username from your email. Please try a different address.'), {
      status: 500, headers: htmlHeaders
    });
  }
  const apiKey = await createUser(env, username, /* machineId */ '');

  // Map email → username for future "find my account" flows.
  await env.USERS.put(`email:${email}`, JSON.stringify({ username }));

  return new Response(dashboardPage({ username, apiKey, host }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// ============================================================
// MAIN HANDLER
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      // Sensitive params (password, otpEmails, emails) now travel in the request body
      // for POST or as query string for GET/DELETE — never as headers (which get logged).
      // Auth headers (X-API-Key, X-Machine-ID) and project-name fallback header remain
      // for backward compatibility with older CLIs.
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, X-Machine-ID, X-Project-Name',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Route: POST /register - Create new user account
    if (path === '/register' && request.method === 'POST') {
      return handleRegister(request, env, corsHeaders);
    }

    // Route: GET /me - Get current user info
    if (path === '/me' && request.method === 'GET') {
      return handleMe(request, env, corsHeaders);
    }

    // Route: GET/POST /key - Get or regenerate API key
    if (path === '/key' && (request.method === 'GET' || request.method === 'POST')) {
      return handleKey(request, env, corsHeaders);
    }

    // Route: POST /form/:projectName - Form submission (public, no auth)
    if (path.startsWith('/form/') && request.method === 'POST') {
      const projectName = path.replace('/form/', '');
      if (!projectName) {
        return new Response(JSON.stringify({ error: 'Project name required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      return handleFormSubmit(request, env, corsHeaders, projectName);
    }

    // Route: POST /otp/request - Request magic link email (public, no auth)
    if (path === '/otp/request' && request.method === 'POST') {
      return handleOTPRequest(request, env, corsHeaders);
    }

    // Route: POST /otp/verify - Verify OTP and get decryption key (public, no auth)
    if (path === '/otp/verify' && request.method === 'POST') {
      return handleOTPVerify(request, env, corsHeaders);
    }

    // Route: POST /signup/request - Request signup magic link (public, no auth)
    if (path === '/signup/request' && request.method === 'POST') {
      return handleSignupRequest(request, env, corsHeaders, url.origin);
    }

    // Route: GET /signup/verify - Verify magic link, create account, render dashboard
    if (path === '/signup/verify' && request.method === 'GET') {
      return handleSignupVerify(request, env, corsHeaders, url.host);
    }

    // Route: POST /mcp - MCP (Model Context Protocol) Streamable HTTP endpoint.
    // Bearer-authenticated; lets Claude Cowork / Desktop call deploy/list/delete
    // tools via Custom Connectors. Auth and dispatch live in src/mcp.js.
    // Bearer can be either an sk_… API key (CLI users) or an mcp_… OAuth
    // access token issued by /oauth/token (Cowork/Desktop users).
    if (path === '/mcp') {
      return handleMCP(request, env, {
        getUserByKey: async (env, token) => {
          if (!token) return null;
          if (token.startsWith('mcp_')) return getUserByMcpToken(env, token);
          return getUserByKey(env, token);
        },
        handleDeploy,
        handleList,
        handleDelete,
        handleFormsList,
      });
    }

    // ============================================================
    // OAuth 2.0 endpoints (for Custom Connector add-flow)
    // ============================================================

    // Route: GET /.well-known/oauth-authorization-server - OAuth discovery
    if (path === '/.well-known/oauth-authorization-server' && request.method === 'GET') {
      return handleOAuthDiscovery(request);
    }

    // Route: GET/POST /oauth/authorize - consent screen + form submission
    if (path === '/oauth/authorize') {
      return handleOAuthAuthorize(request, env, { getUserByKey });
    }

    // Route: POST /oauth/token - exchange code for access_token
    if (path === '/oauth/token') {
      return handleOAuthToken(request, env);
    }

    // Route: POST /oauth/clients - create a (client_id, client_secret) pair.
    // Authenticated by API key (Bearer or X-API-Key header).
    if (path === '/oauth/clients' && request.method === 'POST') {
      return handleOAuthClientCreate(request, env, { getUserByKey });
    }

    // Route: GET /connect - public page where the user generates connector creds
    if (path === '/connect' && request.method === 'GET') {
      return new Response(connectPage(), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store'
        }
      });
    }

    // Route: GET /skill/bassh-deploy.md - Hosted skill markdown for Cowork install
    if (path === '/skill/bassh-deploy.md' && request.method === 'GET') {
      return new Response(SKILL_MARKDOWN, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/markdown; charset=utf-8',
          'Cache-Control': 'public, max-age=300'
        }
      });
    }

    // Route: GET / - landing page when unauthenticated, project list when authed.
    // The list path falls through to the auth check below; here we only intercept
    // browser visits that have no auth headers at all.
    if (path === '/' && request.method === 'GET'
        && !request.headers.get('X-API-Key')
        && !request.headers.get('X-Machine-ID')
        && !request.headers.get('Authorization')) {
      return new Response(landingPage(), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=60'
        }
      });
    }

    // All other routes require authentication (hybrid: machine ID or API key)
    const user = await authenticateRequest(request, env);

    if (!user) {
      return new Response(JSON.stringify({
        error: 'Authentication required. Register this machine with "bassh register <username>" or provide X-API-Key header.'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const username = user.username;

    // Route: POST /uninstall - Delete account and all resources
    if (path === '/uninstall' && request.method === 'POST') {
      return handleUninstall(request, env, corsHeaders, username);
    }

    // Route: GET /forms - List form submissions
    if (path === '/forms' && request.method === 'GET') {
      return handleFormsList(request, env, corsHeaders, username);
    }

    // Route: DELETE /forms - Delete form submissions
    if (path === '/forms' && request.method === 'DELETE') {
      return handleFormsDelete(request, env, corsHeaders, username);
    }

    // Route: GET / - List user's projects
    if (request.method === 'GET') {
      return handleList(env, corsHeaders, username);
    }

    // Route: DELETE / - Delete a project
    if (request.method === 'DELETE') {
      return handleDelete(request, env, corsHeaders, username);
    }

    // Route: POST / - Deploy a site
    if (request.method === 'POST') {
      return handleDeploy(request, env, corsHeaders, username);
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};

// ============================================================
// DEPLOYMENT HANDLER
// ============================================================

async function handleDeploy(request, env, corsHeaders, username) {
  try {
    // Parse JSON payload (files + deploy metadata).
    // New CLIs put sensitive params in the body; old CLIs sent them as headers.
    // Body wins; header is a fallback so old clients keep working during rollout.
    const payload = await request.json();
    const files = payload.files;

    let projectName =
      payload.projectName ||
      request.headers.get('X-Project-Name') ||
      `site-${Date.now().toString().slice(-6)}`;
    const password     = payload.password     ?? request.headers.get('X-Password')      ?? '';
    const emails       = payload.emails       ?? request.headers.get('X-Emails')        ?? '';
    const domain       = payload.domain       ?? request.headers.get('X-Domain')        ?? '';
    const customDomain = payload.customDomain ?? request.headers.get('X-Custom-Domain') ?? '';
    const otpEmails    = payload.otpEmails    ?? request.headers.get('X-OTP-Emails')    ?? '';

    // Namespace project name with username
    const fullProjectName = `${username}-${projectName}`;

    if (!files || files.length === 0) {
      return new Response(JSON.stringify({ error: 'No files provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Ensure project exists
    await ensureProject(env, fullProjectName);

    // Get upload token
    const tokenResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${fullProjectName}/upload-token`,
      {
        headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` }
      }
    );

    const tokenResult = await tokenResponse.json();
    if (!tokenResponse.ok) {
      return new Response(JSON.stringify({
        error: 'Failed to get upload token',
        details: tokenResult
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const uploadToken = tokenResult.result.jwt;

    // Process files
    const manifest = {};
    const uploadPayload = [];
    const hashes = [];

    for (const file of files) {
      const path = file.path.startsWith('/') ? file.path : '/' + file.path;
      let content = file.content;
      let finalContent;

      // Encrypt HTML files if password or OTP emails provided
      if (password && path.endsWith('.html')) {
        const binaryString = atob(content);
        const originalHTML = binaryString;
        const encryptedData = await encryptHTML(originalHTML, password);
        const protectedHTML = getDecryptTemplate(encryptedData);
        finalContent = btoa(protectedHTML);
      } else if (otpEmails && path.endsWith('.html')) {
        // OTP-based email protection
        const binaryString = atob(content);
        const originalHTML = binaryString;

        // Generate encryption key if not exists, or reuse existing
        let keyData = await env.USERS.get(`otp-key:${fullProjectName}`, 'json');
        if (!keyData) {
          keyData = { key: generateEncryptionKey() };
        }
        // Update emails list and save key
        const emailList = otpEmails.split(',').map(e => e.trim()).filter(e => e);
        keyData.emails = emailList;
        await env.USERS.put(`otp-key:${fullProjectName}`, JSON.stringify(keyData));

        // Get API URL from request
        const apiUrl = new URL(request.url).origin;

        const encryptedData = await encryptHTMLWithKey(originalHTML, keyData.key);
        const protectedHTML = getOTPDecryptTemplate(encryptedData, fullProjectName, apiUrl, emailList);
        finalContent = btoa(protectedHTML);
      } else {
        finalContent = content;
      }

      // Hash for manifest
      const binaryString = atob(finalContent);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
      const hashArray = new Uint8Array(hashBuffer);
      const hash = Array.from(hashArray).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);

      manifest[path] = hash;
      hashes.push(hash);

      const contentType = getContentType(path);

      uploadPayload.push({
        key: hash,
        value: finalContent,
        metadata: { contentType },
        base64: true
      });
    }

    // Upload files
    const uploadResponse = await fetch(
      'https://api.cloudflare.com/client/v4/pages/assets/upload',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${uploadToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(uploadPayload)
      }
    );

    if (!uploadResponse.ok) {
      const uploadError = await uploadResponse.text();
      return new Response(JSON.stringify({
        error: 'File upload failed',
        details: uploadError
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Register hashes
    const upsertResponse = await fetch(
      'https://api.cloudflare.com/client/v4/pages/assets/upsert-hashes',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${uploadToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ hashes })
      }
    );

    if (!upsertResponse.ok) {
      const upsertError = await upsertResponse.text();
      return new Response(JSON.stringify({
        error: 'Hash registration failed',
        details: upsertError
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create deployment
    const manifestFormData = new FormData();
    manifestFormData.append('manifest', JSON.stringify(manifest));

    const deployResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${fullProjectName}/deployments`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CF_API_TOKEN}`,
        },
        body: manifestFormData
      }
    );

    const deployResult = await deployResponse.json();

    if (!deployResponse.ok) {
      return new Response(JSON.stringify({
        error: 'Deployment creation failed',
        details: deployResult
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const siteUrl = `https://${fullProjectName}.pages.dev`;

    // Set up Cloudflare Access if needed
    let accessSetup = null;
    if (emails || domain) {
      accessSetup = await setupAccess(env, fullProjectName, emails, domain);
    }

    // Set up custom domain if provided
    let customDomainResult = null;
    if (customDomain) {
      customDomainResult = await addCustomDomain(env, fullProjectName, customDomain);
    }

    return new Response(JSON.stringify({
      success: true,
      url: siteUrl,
      project: fullProjectName,
      shortName: projectName,
      deployment: deployResult.result,
      access: accessSetup,
      customDomain: customDomainResult,
      protection: {
        password: password ? true : false,
        emails: emails || null,
        domain: domain || null,
        otpEmails: otpEmails || null
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Internal error',
      message: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function getContentType(path) {
  const ext = path.split('.').pop().toLowerCase();
  const types = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'eot': 'application/vnd.ms-fontobject',
    'txt': 'text/plain',
    'xml': 'application/xml',
    'pdf': 'application/pdf',
    'webp': 'image/webp',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
  };
  return types[ext] || 'application/octet-stream';
}

async function addCustomDomain(env, projectName, domain) {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${projectName}/domains`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: domain }),
      }
    );

    const result = await response.json();

    if (!result.success) {
      // Check for common errors
      const errorMsg = result.errors?.[0]?.message || 'Unknown error';
      return {
        success: false,
        domain: domain,
        error: errorMsg,
        cname: `${projectName}.pages.dev`,
      };
    }

    return {
      success: true,
      domain: domain,
      status: result.result?.status || 'pending',
      cname: `${projectName}.pages.dev`,
    };
  } catch (error) {
    return {
      success: false,
      domain: domain,
      error: error.message,
      cname: `${projectName}.pages.dev`,
    };
  }
}

async function ensureProject(env, projectName) {
  const checkResponse = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${projectName}`,
    {
      headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` }
    }
  );

  if (checkResponse.status === 404) {
    const createResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: projectName,
          production_branch: 'main'
        })
      }
    );

    if (!createResponse.ok) {
      const error = await createResponse.json();
      throw new Error(`Failed to create project: ${JSON.stringify(error)}`);
    }
  }
}

async function setupAccess(env, projectName, emails, domain) {
  const appDomain = `${projectName}.pages.dev`;

  const include = [];

  if (emails) {
    const emailList = emails.split(',').map(e => e.trim());
    for (const email of emailList) {
      include.push({ email: { email: email } });
    }
  }

  if (domain) {
    const cleanDomain = domain.replace(/^@/, '');
    include.push({ email_domain: { domain: cleanDomain } });
  }

  const listResponse = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/apps`,
    {
      headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` }
    }
  );

  const listResult = await listResponse.json();
  const existingApp = listResult.result?.find(app =>
    app.domain === appDomain || app.name === projectName
  );

  if (existingApp) {
    const policiesResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/apps/${existingApp.id}/policies`,
      {
        headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` }
      }
    );

    const policiesResult = await policiesResponse.json();
    const existingPolicy = policiesResult.result?.[0];

    if (existingPolicy) {
      await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/apps/${existingApp.id}/policies/${existingPolicy.id}`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${env.CF_API_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Allowed Users',
            decision: 'allow',
            include: include
          })
        }
      );
    }

    return { status: 'updated', appId: existingApp.id };
  }

  const createAppResponse = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/apps`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: projectName,
        domain: appDomain,
        type: 'self_hosted',
        session_duration: '24h',
        auto_redirect_to_identity: false
      })
    }
  );

  const appResult = await createAppResponse.json();

  if (!createAppResponse.ok) {
    return { status: 'failed', error: appResult };
  }

  const appId = appResult.result.id;

  const createPolicyResponse = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/apps/${appId}/policies`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Allowed Users',
        decision: 'allow',
        include: include
      })
    }
  );

  const policyResult = await createPolicyResponse.json();

  if (!createPolicyResponse.ok) {
    return { status: 'partial', appId: appId, policyError: policyResult };
  }

  return { status: 'created', appId: appId };
}

async function handleList(env, corsHeaders, username) {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects`,
      {
        headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` }
      }
    );

    const result = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({
        error: 'Failed to list projects',
        details: result
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Filter to only this user's projects (prefixed with username-)
    const userPrefix = `${username}-`;
    const projects = result.result
      .filter(p => p.name.startsWith(userPrefix))
      .map(p => {
        // Get custom domain if configured (exclude *.pages.dev)
        const customDomain = (p.domains || []).find(d => !d.endsWith('.pages.dev'));
        return {
          name: p.name,
          shortName: p.name.replace(userPrefix, ''),
          url: customDomain ? `https://${customDomain}` : `https://${p.name}.pages.dev`,
          customDomain: customDomain || null,
          created: p.created_on
        };
      });

    return new Response(JSON.stringify({
      success: true,
      username,
      projects
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Internal error',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

async function handleUninstall(request, env, corsHeaders, username) {
  try {
    const deletedProjects = [];
    const deletedApps = [];
    let errors = [];

    // Get user record to find API key and machine ID
    const userData = await getUserByUsername(env, username);
    const apiKey = userData?.key;
    const machineId = userData?.machineId;

    // 1. Get all user's Pages projects
    const projectsResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects`,
      {
        headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` }
      }
    );

    const projectsResult = await projectsResponse.json();

    if (projectsResponse.ok) {
      const userPrefix = `${username}-`;
      const userProjects = projectsResult.result.filter(p => p.name.startsWith(userPrefix));

      // Delete each project
      for (const project of userProjects) {
        const deleteResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${project.name}`,
          {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` }
          }
        );

        if (deleteResponse.ok) {
          deletedProjects.push(project.name);
        } else {
          const errorResult = await deleteResponse.json();
          errors.push({ type: 'project', name: project.name, error: errorResult });
        }
      }
    }

    // 2. Get and delete all user's Access apps
    const appsResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/apps`,
      {
        headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` }
      }
    );

    const appsResult = await appsResponse.json();

    if (appsResponse.ok) {
      const userPrefix = `${username}-`;
      const userApps = appsResult.result.filter(app =>
        app.name.startsWith(userPrefix) ||
        (app.domain && app.domain.startsWith(userPrefix))
      );

      for (const app of userApps) {
        const deleteResponse = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/apps/${app.id}`,
          {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` }
          }
        );

        if (deleteResponse.ok) {
          deletedApps.push(app.name);
        } else {
          const errorResult = await deleteResponse.json();
          errors.push({ type: 'access_app', name: app.name, error: errorResult });
        }
      }
    }

    // 3. Delete user from KV
    await env.USERS.delete(`user:${username}`);
    if (apiKey) {
      await env.USERS.delete(`key:${apiKey}`);
    }
    if (machineId) {
      await env.USERS.delete(`machine:${machineId}`);
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Account and all resources deleted',
      deleted: {
        projectsCount: deletedProjects.length,
        appsCount: deletedApps.length,
        userRecord: true
      },
      projects: deletedProjects,
      accessApps: deletedApps,
      errors: errors.length > 0 ? errors : undefined
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Internal error during uninstall',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ============================================================
// FORM SUBMISSION HANDLERS
// ============================================================

// Hash IP for privacy (we don't store raw IPs)
async function hashIP(ip) {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + 'bassh-salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

// Check rate limit for form submissions (10/min per IP per project)
async function checkFormRateLimit(env, ip, projectName) {
  const hashedIP = await hashIP(ip);
  const key = `ratelimit:form:${projectName}:${hashedIP}`;
  const current = parseInt(await env.USERS.get(key) || '0');

  if (current >= 10) {
    return false;
  }

  await env.USERS.put(key, String(current + 1), { expirationTtl: 60 });
  return true;
}

// Parse form data from request (supports urlencoded and JSON)
async function parseFormData(request) {
  const contentType = request.headers.get('Content-Type') || '';

  if (contentType.includes('application/json')) {
    return await request.json();
  }

  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const data = {};
    for (const [key, value] of formData.entries()) {
      data[key] = value;
    }
    return data;
  }

  // Try JSON as fallback
  try {
    return await request.json();
  } catch {
    return {};
  }
}

// Handle form submission (public endpoint - no auth required)
async function handleFormSubmit(request, env, corsHeaders, projectName) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

    // Rate limit check
    const allowed = await checkFormRateLimit(env, ip, projectName);
    if (!allowed) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Rate limit exceeded. Please try again later.'
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse form data
    const formData = await parseFormData(request);

    // Check payload size (10KB limit)
    const payloadSize = JSON.stringify(formData).length;
    if (payloadSize > 10240) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Payload too large. Maximum 10KB allowed.'
      }), {
        status: 413,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check honeypot field (spam protection)
    if (formData._honeypot) {
      // Silently accept but don't store (looks like spam)
      const redirect = formData._redirect || formData._next;
      if (redirect) {
        return Response.redirect(redirect, 302);
      }
      return new Response(JSON.stringify({ success: true, id: 'ignored' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Separate special fields from user data
    const userData = {};
    let redirect = null;

    for (const [key, value] of Object.entries(formData)) {
      if (key.startsWith('_')) {
        if (key === '_redirect' || key === '_next') {
          redirect = value;
        }
        // Skip other special fields (_honeypot, _subject, etc.)
      } else {
        userData[key] = value;
      }
    }

    // Build submission record
    const timestamp = Date.now();
    const uuid = crypto.randomUUID();
    const submission = {
      _meta: {
        submitted: new Date(timestamp).toISOString(),
        ip: await hashIP(ip),
        userAgent: request.headers.get('User-Agent') || '',
        referer: request.headers.get('Referer') || ''
      },
      data: userData
    };

    // Store in FORMS KV with 90-day TTL
    const key = `${projectName}:${timestamp}:${uuid}`;
    await env.FORMS.put(key, JSON.stringify(submission), {
      expirationTtl: 90 * 24 * 60 * 60 // 90 days
    });

    // Respond based on request type
    const acceptHeader = request.headers.get('Accept') || '';

    if (redirect) {
      return Response.redirect(redirect, 302);
    }

    if (acceptHeader.includes('application/json')) {
      return new Response(JSON.stringify({
        success: true,
        id: uuid,
        message: 'Form submitted successfully'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Default: return simple HTML thank you page
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Thank You</title>
        <style>
          body { font-family: system-ui; text-align: center; padding: 50px; }
          h1 { color: #22c55e; }
        </style>
      </head>
      <body>
        <h1>Thank You!</h1>
        <p>Your submission has been received.</p>
      </body>
      </html>
    `, {
      headers: { ...corsHeaders, 'Content-Type': 'text/html' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to process form submission',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Handle form listing (authenticated)
async function handleFormsList(request, env, corsHeaders, username) {
  try {
    const url = new URL(request.url);
    const projectName = url.searchParams.get('project') || request.headers.get('X-Project-Name');

    if (!projectName) {
      return new Response(JSON.stringify({ error: 'Project name required (?project= query param)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Build full project name and verify ownership
    const fullProjectName = projectName.startsWith(`${username}-`)
      ? projectName
      : `${username}-${projectName}`;

    if (!fullProjectName.startsWith(`${username}-`)) {
      return new Response(JSON.stringify({ error: 'You can only access your own project forms' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // List submissions from FORMS KV
    const listResult = await env.FORMS.list({ prefix: `${fullProjectName}:` });

    // Fetch all submissions
    const submissions = [];
    for (const key of listResult.keys) {
      const value = await env.FORMS.get(key.name, 'json');
      if (value) {
        submissions.push({
          id: key.name.split(':')[2], // Extract UUID
          ...value
        });
      }
    }

    // Sort by timestamp descending (newest first)
    submissions.sort((a, b) =>
      new Date(b._meta.submitted) - new Date(a._meta.submitted)
    );

    return new Response(JSON.stringify({
      success: true,
      project: fullProjectName,
      count: submissions.length,
      submissions
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to list forms',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// Handle form deletion (authenticated)
async function handleFormsDelete(request, env, corsHeaders, username) {
  try {
    const url = new URL(request.url);
    const projectName = url.searchParams.get('project') || request.headers.get('X-Project-Name');

    if (!projectName) {
      return new Response(JSON.stringify({ error: 'Project name required (?project= query param)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Build full project name and verify ownership
    const fullProjectName = projectName.startsWith(`${username}-`)
      ? projectName
      : `${username}-${projectName}`;

    if (!fullProjectName.startsWith(`${username}-`)) {
      return new Response(JSON.stringify({ error: 'You can only delete your own project forms' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // List and delete all submissions for this project
    const listResult = await env.FORMS.list({ prefix: `${fullProjectName}:` });

    let deleted = 0;
    for (const key of listResult.keys) {
      await env.FORMS.delete(key.name);
      deleted++;
    }

    return new Response(JSON.stringify({
      success: true,
      project: fullProjectName,
      deleted,
      message: `Deleted ${deleted} submission(s)`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Failed to delete forms',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

// ============================================================
// DELETE HANDLER
// ============================================================

async function handleDelete(request, env, corsHeaders, username) {
  try {
    const url = new URL(request.url);
    let projectName = url.searchParams.get('project') || request.headers.get('X-Project-Name');

    if (!projectName) {
      return new Response(JSON.stringify({ error: 'Project name required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Add username prefix if not already present
    const fullProjectName = projectName.startsWith(`${username}-`)
      ? projectName
      : `${username}-${projectName}`;

    // Verify project belongs to user
    if (!fullProjectName.startsWith(`${username}-`)) {
      return new Response(JSON.stringify({ error: 'You can only delete your own projects' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Delete the Pages project
    const deleteResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${fullProjectName}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` }
      }
    );

    const deleteResult = await deleteResponse.json();

    if (!deleteResponse.ok) {
      return new Response(JSON.stringify({
        error: 'Delete failed',
        details: deleteResult
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Also delete any Access app
    const appDomain = `${fullProjectName}.pages.dev`;
    const listResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/apps`,
      {
        headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` }
      }
    );

    const listResult = await listResponse.json();
    const existingApp = listResult.result?.find(app =>
      app.domain === appDomain || app.name === fullProjectName
    );

    if (existingApp) {
      await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/apps/${existingApp.id}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` }
        }
      );
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Project '${fullProjectName}' deleted`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: 'Internal error',
      message: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
