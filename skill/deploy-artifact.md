---
name: deploy-artifact
description: Deploy HTML, artifacts, or static sites to a password- or magic-link-protected URL using the bassh CLI. Use when the user asks to "deploy", "share", "host", or "preview" HTML/static content privately, or to manage existing bassh projects (list, delete, view forms).
---

# Deploy Artifact (bassh)

Deploy HTML or a static-site directory to a private URL via the `bassh` CLI. Works only in Claude Code (or any environment with shell access). Does not work in Claude.ai web.

## When to use

- "Deploy this HTML / artifact / page"
- "Share this privately / behind a password / behind email login"
- "Put this online for me to preview"
- "List / delete my bassh projects"
- "Show form submissions for project X"

If the user is on Claude.ai web (no shell), say so and stop.

## Quick decision tree

1. Is `bassh` installed? → if no, give install command, stop.
2. Is the user logged in (`bassh me`)? → if no, walk through registration with an invite code.
3. What protection? → password (`-p`), email magic link (`-o`), Cloudflare Access (`-e` / `-d`), or none. Default to password for ad-hoc artifacts.
4. Build the directory, run `bassh`, report the URL.

## Step 1 — Verify CLI installed

```bash
command -v bassh >/dev/null && bassh --help >/dev/null
```

If `bassh` is missing, tell the user:

> `bassh` isn't installed. Install with:
> ```
> curl -fsSL https://raw.githubusercontent.com/get-bassh/bassh/main/install.sh | bash
> source ~/.zshrc   # or ~/.bashrc
> ```
> Then ask me to deploy again.

Stop until they confirm.

## Step 2 — Verify logged in

```bash
bassh me
```

- Output contains `Logged in as:` → proceed.
- Output contains `Not authenticated` or `BASSH_API not configured` → user needs to register.

If they need an invite code, ask:

> You're not registered. Do you have an invite code? It looks like `subdomain:secret123`. If yes, share the code and your desired username. If no, ask your bassh operator for one.

When they provide both, run:

```bash
bassh register USERNAME --invite SUBDOMAIN:SECRET
```

Common errors:
- `Invalid invite code format` → must be `subdomain:secret`, not just the secret.
- `Invalid registration code` → wrong secret; ask operator.
- `Username already taken` → ask for a different one.
- `This machine is already registered` → run `bassh me` to see the existing account; `bassh uninstall` to reset.

After successful register, the CLI writes `BASSH_KEY` / `BASSH_API` to the user's shell rc. They may need to `source ~/.zshrc` (or open a new shell) before deploys work.

## Step 3 — Determine what to deploy

Pick the source:
- **Inline HTML in the message** → use it as the entire site.
- **Reference to an artifact / previous code block** → use that HTML.
- **Existing directory or file path** → deploy as-is. If it's a single `.html` file, copy it into a temp dir as `index.html`.
- **Nothing clear** → ask:

> What should I deploy? Paste HTML, name an artifact, or give me a directory path.

`bassh` deploys a *directory*. The site root is whatever you pass; `index.html` should exist in it.

## Step 4 — Choose protection

Ask succinctly only if the user hasn't already said:

> Protection: password (`-p`), email magic link (`-o`), or none?
> Project name? (optional, auto-generated)
> Custom domain? (optional)

Validation:
- **Project name** must match `^[a-z0-9-]{1,58}$` and not start/end with `-`. If invalid, show the rules and ask again.
- **Custom domain** must look like a real DNS name (e.g., `docs.example.com`).
- **Random password**: `openssl rand -base64 18 | tr -dc 'a-zA-Z0-9' | head -c 16`.

Default for ad-hoc artifact sharing: generate a random password.

## Step 5 — Build the directory and deploy

**Prefer the Write tool over heredocs** to create `index.html`. Heredocs break on HTML containing the EOF marker, backticks, or `$` substitutions, and silently corrupt content.

```bash
DEPLOY_DIR=$(mktemp -d)
trap 'rm -rf "$DEPLOY_DIR"' EXIT
```

Then use the Write tool to create `$DEPLOY_DIR/index.html` (and any other files) with the literal content. After files are written, deploy:

```bash
# Password
bassh "$DEPLOY_DIR" -p "$PASSWORD" -n "$PROJECT_NAME"

# Email magic link (specific addresses or whole domain)
bassh "$DEPLOY_DIR" -o "alice@x.com,bob@y.com" -n "$PROJECT_NAME"
bassh "$DEPLOY_DIR" -o "@company.com"          -n "$PROJECT_NAME"

# Cloudflare Access (heavier — requires Cloudflare login)
bassh "$DEPLOY_DIR" -e "alice@x.com" -n "$PROJECT_NAME"
bassh "$DEPLOY_DIR" -d "@company.com" -n "$PROJECT_NAME"

# Custom domain (combine with any protection flag)
bassh "$DEPLOY_DIR" -p "$PASSWORD" -n "$PROJECT_NAME" --custom-domain docs.example.com

# No protection (public)
bassh "$DEPLOY_DIR" -n "$PROJECT_NAME"
```

Project name is optional — bassh auto-generates one. Pass `-n` only if the user named it or wants a stable URL.

## Step 6 — Report the result

Successful output contains `✓ Site deployed successfully!` followed by `URL:` and `Project:` lines. Extract the URL and report:

**Password:**
```
Deployed.

URL:      <url>
Password: <password>

Share the URL and password through different channels.
```

**Magic link:**
```
Deployed.

URL: <url>
Allowed: <emails-or-domain>

Visitors enter their email and receive a one-time link.
```

**Custom domain:** also surface the CNAME record from the CLI output (it prints DNS instructions block). Don't paraphrase — show the exact `Type / Name / Value` lines as the CLI emitted them.

If `Deployment failed` appears, show the response body and:
- `Invalid API key` → `bassh key --regenerate`
- `BASSH_API not configured` → `source ~/.zshrc`
- Network error → check connectivity, retry once.

## Other operations

```bash
bassh -l                       # list projects
bassh -D -n my-project         # delete a project
bassh me                       # current user / API URL / domain
bassh key                      # show API key
bassh key --regenerate         # rotate API key
bassh uninstall                # delete account, all sites, and CLI
```

For destructive actions (`-D`, `uninstall`, `key --regenerate`), confirm with the user before running.

---

## Forms (optional)

If the user wants their deployed site to capture form submissions, post to `{API}/form/{PROJECT_NAME}` where `{API}` is the `API:` value from `bassh me`.

**Resolve the API URL programmatically — never hardcode `bassh-api.yourname.workers.dev`.**

```bash
API_URL=$(bassh me | awk '/^API:/ {print $2}')
USERNAME=$(bassh me | awk '/^Logged in as:/ {print $NF}')
```

Then build the form:

```html
<form action="API_URL/form/PROJECT_NAME" method="POST">
  <!-- spam honeypot — must stay empty -->
  <input type="text" name="_honeypot" style="display:none" tabindex="-1" autocomplete="off">
  <!-- where to redirect after submit -->
  <input type="hidden" name="_redirect" value="https://USERNAME-PROJECT_NAME.pages.dev/thanks.html">

  <input type="text"  name="name"  required>
  <input type="email" name="email" required>
  <textarea name="message"></textarea>
  <button type="submit">Send</button>
</form>
```

Always include a `thanks.html` in the same deploy so the redirect lands somewhere.

View submissions:

```bash
bassh forms -n PROJECT_NAME           # list
bassh forms -n PROJECT_NAME --csv     # CSV export
bassh forms -n PROJECT_NAME --json    # JSON export
bassh forms -n PROJECT_NAME --count   # count only
bassh forms -n PROJECT_NAME --clear   # delete all (confirm first)
```

Limits: 10 submissions/min/IP, 10 KB payload, 90-day retention.

---

## Notes for Claude

- Don't echo the user's invite code or API key back after registration — just confirm success.
- Always clean up `$DEPLOY_DIR` (the `trap` above handles it).
- If the user hasn't asked for protection, default to a random password for ad-hoc HTML — the point of bassh is private sharing.
- The deploy URL is public; the password/magic-link gate is what keeps content private.
- For multi-file deploys, write each file with the Write tool into `$DEPLOY_DIR` before invoking `bassh`.
- Operator setup (running their own bassh worker on Cloudflare) lives in the project README — link there rather than walking through it inline.
