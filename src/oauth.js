// OAuth 2.0 authorization-code flow with PKCE for the bassh MCP server.
//
// Why: Anthropic's Custom Connector UI in Cowork (and Desktop) prompts for
// `client_id` + `client_secret` and runs a full OAuth dance. Bearer-only auth
// doesn't connect. So the worker grows OAuth endpoints alongside the existing
// API-key path. The CLI keeps using sk_… keys; only Cowork/Desktop use OAuth.
//
// Model:
//   - Each bassh user generates their own (client_id, client_secret) pair on
//     /connect. The client_id is tied to one username for life.
//   - During /oauth/authorize, the user proves they own the account by pasting
//     their API key (one time per consent — v1 has no session cookies).
//   - PKCE (S256) is required.
//   - Access tokens are 30-day prefix `mcp_…`, stored in KV mapped to username.
//   - /mcp accepts either sk_… (legacy/CLI) or mcp_… (OAuth) at the Bearer slot.
//
// KV keys:
//   oauth-client:<client_id>   {client_secret, username, name, created}
//   oauth-code:<code>          {client_id, username, redirect_uri, code_challenge, code_challenge_method}  TTL 600s
//   mcp-token:<token>          {username, client_id, created}                                              TTL 2592000s

import { oauthConsentPage, oauthErrorPage } from "./templates/oauth.js";

const TOKEN_TTL_SECS = 30 * 24 * 60 * 60; // 30 days
const CODE_TTL_SECS = 600;                // 10 min

function randomHex(bytes = 24) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

function corsJson() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };
}

function jsonResponse(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsJson(), ...extraHeaders } });
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Frame-Options": "DENY",
    },
  });
}

// SHA-256 a string and return base64url-encoded digest (no padding).
async function sha256Base64Url(s) {
  const bytes = new TextEncoder().encode(s);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  let bin = "";
  for (const b of digest) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ============================================================
// Discovery — RFC 8414 + MCP convention
// ============================================================
export function handleOAuthDiscovery(request) {
  const origin = new URL(request.url).origin;
  return jsonResponse({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/clients`,
    scopes_supported: ["mcp"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
    code_challenge_methods_supported: ["S256"],
  });
}

// ============================================================
// Client management — POST /oauth/clients
// ============================================================
// Authenticated by the user's existing API key (Authorization: Bearer sk_…
// or X-API-Key). Creates a (client_id, client_secret) pair scoped to that user.
//
// Body (optional): { name, redirect_uris: [string] }
//   name          → display name shown on the consent screen
//   redirect_uris → not enforced as a strict allow-list in v1 (we store
//                   whatever Cowork sends at authorize time and require the
//                   token exchange to round-trip it). Pre-registering is
//                   useful UX so we keep the field, but absence is fine.
export async function handleOAuthClientCreate(request, env, deps) {
  const apiKey =
    (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "") ||
    request.headers.get("X-API-Key") ||
    "";
  const user = await deps.getUserByKey(env, apiKey);
  if (!user) {
    return jsonResponse({ error: "invalid_token" }, 401, { "WWW-Authenticate": 'Bearer realm="bassh"' });
  }
  let body = {};
  try {
    body = (await request.json()) || {};
  } catch { /* allow empty body */ }
  const clientId = `cowork_${randomHex(8)}`;
  const clientSecret = `cs_${randomHex(24)}`;
  const record = {
    client_secret: clientSecret,
    username: user.username,
    name: typeof body.name === "string" ? body.name.slice(0, 80) : "Cowork connector",
    redirect_uris: Array.isArray(body.redirect_uris) ? body.redirect_uris.slice(0, 10) : [],
    created: new Date().toISOString(),
  };
  await env.USERS.put(`oauth-client:${clientId}`, JSON.stringify(record));
  return jsonResponse({
    client_id: clientId,
    client_secret: clientSecret,
    name: record.name,
    redirect_uris: record.redirect_uris,
  });
}

// ============================================================
// /oauth/authorize — GET (consent page) and POST (form submit)
// ============================================================
//
// Required query params (RFC 6749 + RFC 7636):
//   response_type=code, client_id, redirect_uri, scope, state,
//   code_challenge, code_challenge_method=S256
//
// We render a consent page that asks the user to paste their API key as proof
// they own the account. POST /oauth/authorize then mints a code and redirects
// to redirect_uri with ?code=…&state=….

function parseAuthorizeParams(url) {
  const sp = url.searchParams;
  return {
    response_type: sp.get("response_type") || "",
    client_id: sp.get("client_id") || "",
    redirect_uri: sp.get("redirect_uri") || "",
    scope: sp.get("scope") || "mcp",
    state: sp.get("state") || "",
    code_challenge: sp.get("code_challenge") || "",
    code_challenge_method: sp.get("code_challenge_method") || "",
  };
}

function isValidRedirectUri(uri) {
  if (!uri) return false;
  try {
    const u = new URL(uri);
    return u.protocol === "https:" || u.protocol === "http:" && u.hostname === "localhost";
  } catch {
    return false;
  }
}

async function handleOAuthAuthorizeGet(request, env) {
  const url = new URL(request.url);
  const p = parseAuthorizeParams(url);

  if (p.response_type !== "code") {
    return htmlResponse(oauthErrorPage("Unsupported response_type. This server only supports `code`."), 400);
  }
  if (!isValidRedirectUri(p.redirect_uri)) {
    return htmlResponse(oauthErrorPage("Missing or invalid redirect_uri."), 400);
  }
  if (!p.client_id) {
    return htmlResponse(oauthErrorPage("Missing client_id."), 400);
  }
  const client = await env.USERS.get(`oauth-client:${p.client_id}`, "json");
  if (!client) {
    return htmlResponse(oauthErrorPage("Unknown client_id. Generate one at /connect."), 400);
  }
  if (p.code_challenge_method !== "S256" || !p.code_challenge) {
    return htmlResponse(oauthErrorPage("PKCE is required. code_challenge_method must be S256."), 400);
  }

  // Render consent page. Echo the relevant params back through hidden inputs.
  return htmlResponse(
    oauthConsentPage({
      clientName: client.name || "Cowork connector",
      username: client.username,
      params: p,
    })
  );
}

async function handleOAuthAuthorizePost(request, env, deps) {
  const url = new URL(request.url);
  let form;
  try {
    form = await request.formData();
  } catch {
    return htmlResponse(oauthErrorPage("Invalid form submission."), 400);
  }
  const p = {
    response_type: form.get("response_type") || "",
    client_id: form.get("client_id") || "",
    redirect_uri: form.get("redirect_uri") || "",
    scope: form.get("scope") || "mcp",
    state: form.get("state") || "",
    code_challenge: form.get("code_challenge") || "",
    code_challenge_method: form.get("code_challenge_method") || "",
  };
  const action = form.get("action") || "approve";
  const apiKey = (form.get("api_key") || "").trim();

  // Re-validate (defence in depth — a malicious client could POST arbitrary fields).
  if (p.response_type !== "code") return htmlResponse(oauthErrorPage("Bad response_type."), 400);
  if (!isValidRedirectUri(p.redirect_uri)) return htmlResponse(oauthErrorPage("Bad redirect_uri."), 400);
  if (p.code_challenge_method !== "S256" || !p.code_challenge) return htmlResponse(oauthErrorPage("PKCE required."), 400);

  const client = await env.USERS.get(`oauth-client:${p.client_id}`, "json");
  if (!client) return htmlResponse(oauthErrorPage("Unknown client."), 400);

  if (action === "deny") {
    const sep = p.redirect_uri.includes("?") ? "&" : "?";
    return Response.redirect(`${p.redirect_uri}${sep}error=access_denied&state=${encodeURIComponent(p.state)}`, 302);
  }

  // Authenticate the consenting user via the pasted API key.
  const user = await deps.getUserByKey(env, apiKey);
  if (!user) {
    return htmlResponse(
      oauthConsentPage({
        clientName: client.name || "Cowork connector",
        username: client.username,
        params: p,
        error: "That API key didn't match. Double-check it (starts with sk_) and try again.",
      }),
      401
    );
  }
  if (user.username !== client.username) {
    return htmlResponse(
      oauthConsentPage({
        clientName: client.name || "Cowork connector",
        username: client.username,
        params: p,
        error: `That key belongs to a different account (${user.username}). This client was created for ${client.username}.`,
      }),
      403
    );
  }

  // Mint a one-time code, bind to client_id + redirect_uri + PKCE.
  const code = randomHex(20);
  await env.USERS.put(
    `oauth-code:${code}`,
    JSON.stringify({
      client_id: p.client_id,
      username: user.username,
      redirect_uri: p.redirect_uri,
      code_challenge: p.code_challenge,
      code_challenge_method: p.code_challenge_method,
      created: Date.now(),
    }),
    { expirationTtl: CODE_TTL_SECS }
  );

  const sep = p.redirect_uri.includes("?") ? "&" : "?";
  return Response.redirect(`${p.redirect_uri}${sep}code=${code}&state=${encodeURIComponent(p.state)}`, 302);
}

export async function handleOAuthAuthorize(request, env, deps) {
  if (request.method === "GET") return handleOAuthAuthorizeGet(request, env);
  if (request.method === "POST") return handleOAuthAuthorizePost(request, env, deps);
  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
}

// ============================================================
// /oauth/token — code → access token
// ============================================================
export async function handleOAuthToken(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsJson() });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // Parse form-urlencoded (RFC 6749 §3.2) or JSON, accept either.
  let params = {};
  const ct = request.headers.get("Content-Type") || "";
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const fd = await request.formData();
    for (const [k, v] of fd.entries()) params[k] = v;
  } else {
    try { params = await request.json(); } catch { params = {}; }
  }

  // Allow client credentials via Basic auth (RFC 6749 §2.3.1) too.
  const basic = request.headers.get("Authorization") || "";
  if (/^Basic\s+/i.test(basic) && !params.client_id) {
    try {
      const decoded = atob(basic.replace(/^Basic\s+/i, ""));
      const idx = decoded.indexOf(":");
      if (idx > 0) {
        params.client_id = decodeURIComponent(decoded.slice(0, idx));
        params.client_secret = decodeURIComponent(decoded.slice(idx + 1));
      }
    } catch { /* ignore */ }
  }

  const { grant_type, code, redirect_uri, client_id, client_secret, code_verifier } = params;

  if (grant_type !== "authorization_code") {
    return jsonResponse({ error: "unsupported_grant_type" }, 400);
  }
  if (!code || !client_id || !client_secret || !code_verifier || !redirect_uri) {
    return jsonResponse({ error: "invalid_request", error_description: "missing required parameter" }, 400);
  }

  // Validate client
  const client = await env.USERS.get(`oauth-client:${client_id}`, "json");
  if (!client || client.client_secret !== client_secret) {
    return jsonResponse({ error: "invalid_client" }, 401);
  }

  // Validate code
  const codeRec = await env.USERS.get(`oauth-code:${code}`, "json");
  if (!codeRec) {
    return jsonResponse({ error: "invalid_grant", error_description: "code expired or already used" }, 400);
  }
  // One-time use
  await env.USERS.delete(`oauth-code:${code}`);

  if (codeRec.client_id !== client_id) {
    return jsonResponse({ error: "invalid_grant", error_description: "code/client mismatch" }, 400);
  }
  if (codeRec.redirect_uri !== redirect_uri) {
    return jsonResponse({ error: "invalid_grant", error_description: "redirect_uri mismatch" }, 400);
  }

  // PKCE check
  const computed = await sha256Base64Url(code_verifier);
  if (computed !== codeRec.code_challenge) {
    return jsonResponse({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
  }

  // Mint access token
  const accessToken = `mcp_${randomHex(24)}`;
  await env.USERS.put(
    `mcp-token:${accessToken}`,
    JSON.stringify({ username: codeRec.username, client_id, created: Date.now() }),
    { expirationTtl: TOKEN_TTL_SECS }
  );

  return jsonResponse({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: TOKEN_TTL_SECS,
    scope: "mcp",
  });
}

// ============================================================
// MCP token resolution helper (used by /mcp Bearer auth path)
// ============================================================
// Called from src/mcp.js: looks up an mcp_… access token in KV and returns
// the same shape `getUserByKey` returns. Returns null if invalid/expired.
export async function getUserByMcpToken(env, token) {
  if (!token || !token.startsWith("mcp_")) return null;
  const data = await env.USERS.get(`mcp-token:${token}`, "json");
  if (!data) return null;
  return { username: data.username };
}
