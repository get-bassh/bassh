// share-site-worker: Multi-tenant deployment backend for Cloudflare Pages
// Deploy this worker once, then anyone with the CLI can deploy sites to your account

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

// Look up user by username
async function getUserByUsername(env, username) {
  const data = await env.USERS.get(`user:${username}`, 'json');
  return data; // { key: "...", created: "..." } or null
}

// Handle user registration
async function handleRegister(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const username = (body.username || '').toLowerCase().trim();
    const registrationCode = body.registrationCode || '';

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

    // Check if username exists
    const existing = await getUserByUsername(env, username);
    if (existing) {
      return new Response(JSON.stringify({ error: 'Username already taken' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Generate API key and store user
    const apiKey = generateApiKey();
    const created = new Date().toISOString();

    await env.USERS.put(`user:${username}`, JSON.stringify({ key: apiKey, created }));
    await env.USERS.put(`key:${apiKey}`, JSON.stringify({ username }));

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
  const apiKey = request.headers.get('X-API-Key');
  const user = await getUserByKey(env, apiKey);

  if (!user) {
    return new Response(JSON.stringify({ error: 'Invalid API key' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const userData = await getUserByUsername(env, user.username);

  return new Response(JSON.stringify({
    success: true,
    username: user.username,
    created: userData?.created
  }), {
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
  <title>Protected Page</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: white;
      padding: 2.5rem;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.1);
      max-width: 360px;
      width: 90%;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .container.visible { opacity: 1; }
    h1 {
      font-size: 1.25rem;
      font-weight: 600;
      color: #1a1a1a;
      margin-bottom: 0.5rem;
    }
    p {
      color: #666;
      font-size: 0.875rem;
      margin-bottom: 1.5rem;
    }
    input {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 1rem;
      margin-bottom: 1rem;
      transition: border-color 0.2s;
    }
    input:focus {
      outline: none;
      border-color: #0066ff;
    }
    button {
      width: 100%;
      padding: 0.75rem;
      background: #0066ff;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    button:hover { background: #0052cc; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .error {
      color: #dc3545;
      font-size: 0.875rem;
      margin-top: 1rem;
      display: none;
    }
    .icon {
      width: 48px;
      height: 48px;
      background: #f0f0f0;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 1rem;
    }
    .icon svg { width: 24px; height: 24px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    </div>
    <h1>Protected Page</h1>
    <p>Enter the password to view this content.</p>
    <form id="form">
      <input type="password" id="password" placeholder="Password" autofocus required>
      <button type="submit" id="btn">Unlock</button>
    </form>
    <p class="error" id="error">Incorrect password. Please try again.</p>
  </div>

  <script>
    const ENCRYPTED = "${encryptedData}";
    const STORAGE_KEY = 'share-site-pw';

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
// MAIN HANDLER
// ============================================================

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Project-Name, X-Password, X-Emails, X-Domain, X-API-Key, X-Registration-Code',
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

    // All other routes require authentication
    const apiKey = request.headers.get('X-API-Key');
    const user = await getUserByKey(env, apiKey);

    if (!user) {
      return new Response(JSON.stringify({ error: 'Authentication required. Provide X-API-Key header.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const username = user.username;

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
    let projectName = request.headers.get('X-Project-Name') || `site-${Date.now().toString().slice(-6)}`;
    const password = request.headers.get('X-Password') || '';
    const emails = request.headers.get('X-Emails') || '';
    const domain = request.headers.get('X-Domain') || '';

    // Namespace project name with username
    const fullProjectName = `${username}-${projectName}`;

    // Parse JSON payload with files
    const payload = await request.json();
    const files = payload.files;

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

      // Encrypt HTML files if password provided
      if (password && path.endsWith('.html')) {
        const binaryString = atob(content);
        const originalHTML = binaryString;
        const encryptedData = await encryptHTML(originalHTML, password);
        const protectedHTML = getDecryptTemplate(encryptedData);
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

    return new Response(JSON.stringify({
      success: true,
      url: siteUrl,
      project: fullProjectName,
      shortName: projectName,
      deployment: deployResult.result,
      access: accessSetup,
      protection: {
        password: password ? true : false,
        emails: emails || null,
        domain: domain || null
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
      .map(p => ({
        name: p.name,
        shortName: p.name.replace(userPrefix, ''),
        url: `https://${p.name}.pages.dev`,
        created: p.created_on
      }));

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

async function handleDelete(request, env, corsHeaders, username) {
  try {
    let projectName = request.headers.get('X-Project-Name');

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
