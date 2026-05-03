// MCP (Model Context Protocol) endpoint for bassh.
//
// Exposes the bassh deploy/list/delete/forms surface as MCP tools so Claude
// Cowork and Claude Desktop can invoke them via Custom Connectors. Spec:
// https://modelcontextprotocol.io — Streamable HTTP transport, JSON-RPC 2.0.
//
// Auth: Bearer with an existing bassh API key (sk_…). The connector add-flow
// in Cowork prompts the user for the key once; subsequent requests carry it
// in `Authorization: Bearer sk_…`.
//
// We don't re-implement the deploy logic. Each tool call constructs a fake
// Request and hands it to the existing handler with the authenticated
// username already resolved — the handler signatures already take username
// as a parameter and don't re-auth.

const PROTOCOL_VERSION = "2025-03-26";
const SERVER_INFO = { name: "bassh", version: "1.0.0" };

// JSON Schema fragments
const PROJECT_NAME_SCHEMA = {
  type: "string",
  description: "Optional URL slug. Lowercase letters/digits/dashes, 1-58 chars. If omitted, bassh auto-generates one. Subsequent deploys to the same name overwrite.",
  pattern: "^[a-z0-9]([a-z0-9-]{0,56}[a-z0-9])?$",
};

const PASSWORD_SCHEMA = {
  type: "string",
  description: "If set, the page is AES-256-GCM encrypted and visitors must enter this password to view. Default to a random 12-char password unless the user says otherwise — bassh URLs are public, the password is the privacy gate.",
};

const OTP_EMAILS_SCHEMA = {
  type: "string",
  description: "Comma-separated email allowlist for magic-link login. Each visitor enters their email and receives a one-time link. Supports whole-domain entries via '@example.com'. Mutually exclusive with `password`.",
};

const CUSTOM_DOMAIN_SCHEMA = {
  type: "string",
  description: "Optional custom domain to attach (e.g. 'preview.example.com'). The response includes CNAME instructions; DNS must be configured before the domain resolves.",
};

const TOOLS = [
  {
    name: "deploy_html",
    description:
      "Deploy a single HTML page to a private URL on bassh.io. The page is hosted on Cloudflare Pages and protected by a password (default), email magic link, or — only if the user explicitly says so — left public. Returns the URL where the page is hosted plus the password (if any) so you can share both with the user.",
    inputSchema: {
      type: "object",
      properties: {
        html: { type: "string", description: "Full HTML document to deploy." },
        project_name: PROJECT_NAME_SCHEMA,
        password: PASSWORD_SCHEMA,
        otp_emails: OTP_EMAILS_SCHEMA,
        custom_domain: CUSTOM_DOMAIN_SCHEMA,
      },
      required: ["html"],
    },
  },
  {
    name: "deploy_files",
    description:
      "Deploy a multi-file static site. Use this for HTML+CSS+JS bundles, multiple pages, or anything more than a single HTML doc. Each file's content must be base64-encoded. Otherwise identical to deploy_html.",
    inputSchema: {
      type: "object",
      properties: {
        files: {
          type: "array",
          description: "Files to deploy. The site root is the array; if no `index.html` is provided, bassh promotes the first .html file found.",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "Path relative to site root, e.g. 'index.html' or 'styles/main.css'." },
              content_base64: { type: "string", description: "File content, base64-encoded." },
            },
            required: ["path", "content_base64"],
          },
        },
        project_name: PROJECT_NAME_SCHEMA,
        password: PASSWORD_SCHEMA,
        otp_emails: OTP_EMAILS_SCHEMA,
        custom_domain: CUSTOM_DOMAIN_SCHEMA,
      },
      required: ["files"],
    },
  },
  {
    name: "list_projects",
    description: "List the user's deployed bassh projects. Returns name, URL, custom domain (if any), and creation date for each.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "delete_project",
    description: "Delete a deployed bassh project by short name. Irreversible. Confirm with the user before calling.",
    inputSchema: {
      type: "object",
      properties: {
        project_name: { type: "string", description: "Short name (the part after `<username>-`), e.g. 'my-landing-page'." },
      },
      required: ["project_name"],
    },
  },
  {
    name: "get_form_submissions",
    description: "List form submissions captured by a deployed bassh project. Use this when the user has a contact/feedback form on their site and wants to see what's been submitted.",
    inputSchema: {
      type: "object",
      properties: {
        project_name: { type: "string", description: "Short name of the project." },
      },
      required: ["project_name"],
    },
  },
  {
    name: "whoami",
    description: "Sanity check: returns the bassh username that the supplied API key belongs to.",
    inputSchema: { type: "object", properties: {} },
  },
];

// JSON-RPC helpers
function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function rpcError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return { jsonrpc: "2.0", id, error: err };
}
const ERR_PARSE = -32700;
const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INVALID_PARAMS = -32602;
const ERR_INTERNAL = -32603;
const ERR_UNAUTHORIZED = -32001;

// Build a minimal CORS header set for /mcp responses.
function mcpCors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
  };
}

function unauthorizedResponse() {
  return new Response(
    JSON.stringify(rpcError(null, ERR_UNAUTHORIZED, "Missing or invalid Bearer token. Get one at https://bassh-api.bassh.workers.dev/.")),
    { status: 401, headers: { ...mcpCors(), "Content-Type": "application/json", "WWW-Authenticate": 'Bearer realm="bassh"' } }
  );
}

// Encode the result of an existing JSON handler as an MCP content array.
function asMcpContent(parsed) {
  const ok = parsed && parsed.success !== false && !parsed.error;
  return {
    content: [{ type: "text", text: JSON.stringify(parsed, null, 2) }],
    isError: !ok,
  };
}

// Tool implementations — call the existing route handlers via synthesized
// Request objects and forward the parsed JSON back to the caller.

async function callDeploy({ env, username, payload, originUrl, handleDeploy }) {
  const body = JSON.stringify(payload);
  const fakeReq = new Request(originUrl + "/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const cors = { "Access-Control-Allow-Origin": "*" };
  const resp = await handleDeploy(fakeReq, env, cors, username);
  return await resp.json();
}

async function callList({ env, username, handleList }) {
  const cors = { "Access-Control-Allow-Origin": "*" };
  const resp = await handleList(env, cors, username);
  return await resp.json();
}

async function callDelete({ env, username, projectName, originUrl, handleDelete }) {
  const fakeReq = new Request(`${originUrl}/?project=${encodeURIComponent(projectName)}`, {
    method: "DELETE",
  });
  const cors = { "Access-Control-Allow-Origin": "*" };
  const resp = await handleDelete(fakeReq, env, cors, username);
  return await resp.json();
}

async function callFormsList({ env, username, projectName, originUrl, handleFormsList }) {
  const fakeReq = new Request(`${originUrl}/forms?project=${encodeURIComponent(projectName)}`, {
    method: "GET",
  });
  const cors = { "Access-Control-Allow-Origin": "*" };
  const resp = await handleFormsList(fakeReq, env, cors, username);
  return await resp.json();
}

async function dispatchToolCall(name, args, ctx) {
  switch (name) {
    case "deploy_html": {
      if (!args || typeof args.html !== "string") {
        throw { code: ERR_INVALID_PARAMS, message: "`html` is required and must be a string." };
      }
      const payload = {
        files: [{ path: "index.html", content: btoa(unescape(encodeURIComponent(args.html))) }],
      };
      if (args.project_name) payload.projectName = args.project_name;
      if (args.password) payload.password = args.password;
      if (args.otp_emails) payload.otpEmails = args.otp_emails;
      if (args.custom_domain) payload.customDomain = args.custom_domain;
      return asMcpContent(await callDeploy({ ...ctx, payload }));
    }

    case "deploy_files": {
      if (!args || !Array.isArray(args.files) || args.files.length === 0) {
        throw { code: ERR_INVALID_PARAMS, message: "`files` is required and must be a non-empty array." };
      }
      const files = args.files.map((f) => {
        if (!f || typeof f.path !== "string" || typeof f.content_base64 !== "string") {
          throw { code: ERR_INVALID_PARAMS, message: "Each file needs `path` and `content_base64`." };
        }
        return { path: f.path, content: f.content_base64 };
      });
      const payload = { files };
      if (args.project_name) payload.projectName = args.project_name;
      if (args.password) payload.password = args.password;
      if (args.otp_emails) payload.otpEmails = args.otp_emails;
      if (args.custom_domain) payload.customDomain = args.custom_domain;
      return asMcpContent(await callDeploy({ ...ctx, payload }));
    }

    case "list_projects":
      return asMcpContent(await callList(ctx));

    case "delete_project": {
      if (!args || typeof args.project_name !== "string") {
        throw { code: ERR_INVALID_PARAMS, message: "`project_name` is required." };
      }
      return asMcpContent(await callDelete({ ...ctx, projectName: args.project_name }));
    }

    case "get_form_submissions": {
      if (!args || typeof args.project_name !== "string") {
        throw { code: ERR_INVALID_PARAMS, message: "`project_name` is required." };
      }
      return asMcpContent(await callFormsList({ ...ctx, projectName: args.project_name }));
    }

    case "whoami":
      return {
        content: [{ type: "text", text: JSON.stringify({ username: ctx.username }) }],
        isError: false,
      };

    default:
      throw { code: ERR_METHOD_NOT_FOUND, message: `Unknown tool: ${name}` };
  }
}

// Entry point. Wired into src/index.js as `POST /mcp` (and OPTIONS for CORS).
//
// Imports `getUserByKey` and the four `handle*` functions via the deps argument
// so this module stays decoupled from src/index.js's exact export shape.
export async function handleMCP(request, env, deps) {
  const cors = mcpCors();
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json", Allow: "POST, OPTIONS" },
    });
  }

  // Auth: Authorization: Bearer sk_…
  const authHeader = request.headers.get("Authorization") || "";
  const m = /^Bearer\s+(\S+)$/i.exec(authHeader);
  if (!m) return unauthorizedResponse();
  const apiKey = m[1];
  const user = await deps.getUserByKey(env, apiKey);
  if (!user) return unauthorizedResponse();
  const username = user.username;

  // Parse JSON-RPC body
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify(rpcError(null, ERR_PARSE, "Parse error")), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Batch support — MCP allows arrays of requests
  const isBatch = Array.isArray(body);
  const requests = isBatch ? body : [body];
  const responses = [];

  const ctx = {
    env,
    username,
    originUrl: new URL(request.url).origin,
    handleDeploy: deps.handleDeploy,
    handleList: deps.handleList,
    handleDelete: deps.handleDelete,
    handleFormsList: deps.handleFormsList,
  };

  for (const msg of requests) {
    if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      responses.push(rpcError(msg?.id ?? null, ERR_INVALID_REQUEST, "Invalid Request"));
      continue;
    }
    const { id, method, params } = msg;

    // Notifications carry no id and don't expect a response.
    if (id === undefined || id === null) {
      // notifications/initialized, notifications/cancelled, etc. — ignore.
      continue;
    }

    try {
      let result;
      switch (method) {
        case "initialize":
          result = {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO,
            instructions:
              "Use this connector to deploy HTML artifacts and static sites to bassh.io with private URLs. Default to password protection unless the user says otherwise — bassh URLs are public, the password is the privacy gate. Never echo the user's API key back.",
          };
          break;
        case "ping":
          result = {};
          break;
        case "tools/list":
          result = { tools: TOOLS };
          break;
        case "tools/call":
          if (!params || typeof params.name !== "string") {
            throw { code: ERR_INVALID_PARAMS, message: "`name` is required" };
          }
          result = await dispatchToolCall(params.name, params.arguments || {}, ctx);
          break;
        default:
          throw { code: ERR_METHOD_NOT_FOUND, message: `Unknown method: ${method}` };
      }
      responses.push(rpcResult(id, result));
    } catch (e) {
      const code = typeof e?.code === "number" ? e.code : ERR_INTERNAL;
      const message = e?.message || "Internal error";
      responses.push(rpcError(id, code, message));
    }
  }

  // If every request was a notification, return 202 with no body.
  if (responses.length === 0) {
    return new Response(null, { status: 202, headers: cors });
  }

  const out = isBatch ? responses : responses[0];
  return new Response(JSON.stringify(out), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
