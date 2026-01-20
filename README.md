# bassh

Deploy static sites to Cloudflare Pages with one command. No Cloudflare account needed.

There are two roles:
- **Operator** - Runs the bassh infrastructure on Cloudflare
- **User** - Deploys sites using an invite code from an operator

---

## For Users

### Get Started

```bash
# Install
curl -fsSL https://raw.githubusercontent.com/get-bassh/bassh/main/install.sh | bash
source ~/.zshrc

# Register (get invite code from your operator)
bassh register myusername --invite subdomain:secret123

# Deploy
bassh ./my-folder
```

### Deploy Options

```bash
# Deploy current directory
bassh

# Deploy specific folder
bassh ./my-site

# Custom project name
bassh ./my-site -n my-project

# Password protected
bassh ./my-site -p secret123

# Email magic link (visitors get link via email)
bassh ./my-site -o "alice@gmail.com,bob@company.com"

# Email magic link for domain
bassh ./my-site -o "@company.com"

# Cloudflare Access email restriction
bassh ./my-site -e "alice@gmail.com,bob@company.com"

# Cloudflare Access domain restriction
bassh ./my-site -d "@company.com"

# With custom domain
bassh ./my-site --custom-domain docs.example.com
```

### Email Magic Links (Optional)

Protect your site with email verification. Visitors enter their email and receive a magic link to access.

```bash
bassh ./my-site -o "alice@gmail.com,bob@company.com"
```

**How it works:**
1. Visitor enters their email on the protected page
2. If email is in the allowlist, they receive a magic link
3. Clicking the link decrypts and shows the content
4. Links expire after 5 minutes

**Supports domains:**
```bash
bassh ./my-site -o "@company.com"
```

> **Operator requirement:** This feature requires the operator to set up [Resend](https://resend.com) for email sending. If your operator hasn't enabled this, use `-p` (password) instead. See Operator Setup for details.

### Custom Domains

Attach your own domain to any deployed site:

```bash
bassh ./my-site -n my-project --custom-domain docs.example.com
```

After deployment, the CLI shows DNS instructions:

```
Custom domain: docs.example.com
Status: pending

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Add this DNS record at your domain provider:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    Type:  CNAME
    Name:  docs
    Value: username-my-project.pages.dev

Once DNS is configured, https://docs.example.com will be live.
(SSL is provisioned automatically by Cloudflare)
```

**Two-step process:**
1. **CLI registers the domain** with Cloudflare Pages (status: "pending")
2. **You add the DNS record** to point to Pages (status: "active")

This is by design - bassh won't auto-modify your DNS records for safety.

**Notes:**
- Subdomains (docs.example.com, www.example.com) work with any DNS provider via CNAME
- Root domains (example.com) require Cloudflare DNS (CNAME flattening) or ALIAS records
- Cloudflare automatically provisions and renews SSL certificates
- If your domain is on Cloudflare, enable the orange proxy cloud for best performance

### Form Submissions

Collect form data from your static sites. No backend needed.

**1. Add a form to your HTML:**

```html
<form action="https://bassh-api.yoursubdomain.workers.dev/form/username-projectname" method="POST">
  <input type="text" name="name" placeholder="Name" required>
  <input type="email" name="email" placeholder="Email" required>
  <textarea name="message" placeholder="Message"></textarea>
  <button type="submit">Send</button>
</form>
```

**Important:** The form action URL must use the **full project name** format: `username-projectname`

- Run `bassh -l` to see your full project names (e.g., `bob-site`, `alice-docs`)
- Run `bassh me` to get your API URL and username

**2. View submissions:**

```bash
# List submissions (human-readable)
bassh forms -n my-project

# Export as CSV
bassh forms -n my-project --csv > submissions.csv

# Export as JSON
bassh forms -n my-project --json

# Count submissions
bassh forms -n my-project --count

# Clear all submissions
bassh forms -n my-project --clear
```

**Optional features:**

```html
<!-- Redirect after submission -->
<input type="hidden" name="_redirect" value="https://mysite.com/thanks.html">

<!-- Honeypot spam protection (hidden field) -->
<input type="hidden" name="_honeypot" value="">
```

**Limits:**
- 10 submissions/minute per IP per project (rate limited)
- 10KB max payload size
- 90-day retention (auto-deleted)
- Submissions require a valid project owned by you

### Manage Your Sites

```bash
# List your projects (shows custom domains)
bassh -l

# Example output:
# Projects for alice:
#   • my-site
#     https://alice-my-site.pages.dev
#   • docs
#     https://docs.example.com (custom domain)

# Delete a project
bassh -D -n my-project

# Check who you're logged in as
bassh me

# Example output:
# Logged in as: alice
# API: https://bassh-api.example.workers.dev
# Domain: alice-{project}.pages.dev
# Created: 2024-01-15T10:30:00.000Z

# Show your API key (for CI/CD)
bassh key

# Delete your account and all sites
bassh uninstall
```

### GitHub Actions (Auto-Deploy)

Deploy automatically when you push to GitHub.

**1. Add workflow to your repo:**

```bash
mkdir -p .github/workflows
curl -fsSL https://raw.githubusercontent.com/get-bassh/bassh/main/examples/github-actions/deploy.yml \
  -o .github/workflows/deploy.yml
```

**2. Edit the workflow:**

```yaml
env:
  DEPLOY_DIR: "./public"      # Your build output folder
  PROJECT_NAME: "my-site"     # Your project name
```

**3. Add GitHub Secrets** (repo → Settings → Secrets → Actions):

| Secret | Value |
|--------|-------|
| `BASSH_API` | Your worker URL (e.g., `https://bassh-api.bob-rietveld.workers.dev`) |
| `BASSH_KEY` | Your API key (run `bassh key` to get it) |

**4. Push to deploy:**

```bash
git push
```

See [examples/github-actions](examples/github-actions) for advanced workflows with build steps, PR previews, and more.

### CI/CD (Manual)

For other CI systems, set environment variables:

```bash
export BASSH_API=https://bassh-api.example.workers.dev
export BASSH_KEY=sk_your_api_key_here
bassh ./dist -n my-project
```

Get your API key with `bassh key`.

---

## For Operators

### Prerequisites

- **Node.js** (v18+) - includes npm and npx
- **Cloudflare account** - free tier works
- **Resend account** (optional) - for email magic links, free tier: 3k emails/month

---

### Step 1: Clone and Setup Location

```bash
# Clone to ~/bassh (important - alias depends on this location)
git clone https://github.com/get-bassh/bassh.git ~/bassh
cd ~/bassh
```

---

### Step 2: Create Cloudflare API Token

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click **Create Token** → **Create Custom Token**
3. Configure permissions:

| Permission | Access |
|------------|--------|
| Account → **Workers KV Storage** | Edit |
| Account → **Cloudflare Pages** | Edit |
| Account → **Access: Apps and Policies** | Edit |
| Account → **Account Settings** | Read |
| Zone → **Email Routing Rules** | Edit (optional, for emails) |

4. Account Resources: **Include → Your account**
5. Zone Resources: **Include → All zones**
6. Create and **copy the token** (you only see it once!)

---

### Step 3: Set Environment Variables

```bash
export CLOUDFLARE_API_TOKEN="your-api-token"
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
```

To find your Account ID: run `npx wrangler whoami` or check the Cloudflare dashboard URL.

---

### Step 4: Create KV Namespaces

```bash
npx wrangler kv namespace create USERS
npx wrangler kv namespace create FORMS
```

Copy the **ID** from each output (32-character hex string).

Update `wrangler.toml` with your namespace IDs:

```toml
[[kv_namespaces]]
binding = "USERS"
id = "your-users-namespace-id-here"

[[kv_namespaces]]
binding = "FORMS"
id = "your-forms-namespace-id-here"
```

---

### Step 5: Set Workers.dev Subdomain

New Cloudflare accounts get an auto-generated subdomain (e.g., `bob-9d5`). To change it:

1. Go to **Workers & Pages** in Cloudflare dashboard
2. Click **Account Settings** or the subdomain area
3. Change to something memorable (e.g., `bassh`, `mycompany`)

> **Note:** This cannot be set via CLI - dashboard only. Changes may take a few minutes to propagate.

---

### Step 6: Set Worker Secrets

```bash
# Required: Your account ID
echo "your-account-id" | npx wrangler secret put CF_ACCOUNT_ID --name bassh-api

# Required: Your API token (same one from Step 2)
npx wrangler secret put CF_API_TOKEN --name bassh-api

# Optional: Registration code for invite-only mode
# Make it memorable - users need this to register
npx wrangler secret put REGISTRATION_CODE --name bassh-api
```

---

### Step 7: Deploy

```bash
npx wrangler deploy
```

Note the output URL: `https://bassh-api.<subdomain>.workers.dev`

---

### Step 8: Add Deploy Alias (Convenience)

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
echo 'alias bassh-deploy="npx wrangler deploy --config ~/bassh/wrangler.toml"' >> ~/.zshrc
source ~/.zshrc
```

Now you can run `bassh-deploy` from anywhere to update the worker.

---

### (Optional) Enable Email Magic Links

To support the `-o` flag for email-protected sites, set up [Resend](https://resend.com).

**Why Resend?** Cloudflare Email Routing can only send to pre-verified addresses. Resend allows sending to any email.

#### 1. Create Resend Account

1. Sign up at https://resend.com
2. Add and verify your domain (e.g., `email.yourdomain.com`)
3. Add the DNS records Resend provides (SPF, DKIM)
4. Create an API key at https://resend.com/api-keys

#### 2. Set Secrets

```bash
# Resend API key (starts with re_...)
npx wrangler secret put RESEND_API_KEY --name bassh-api

# Sender email - MUST be on your verified Resend domain
npx wrangler secret put EMAIL_FROM --name bassh-api
# e.g., noreply@email.yourdomain.com
```

> **Important:** The EMAIL_FROM domain must match the domain verified in Resend. If you verified `email.bassh.io`, use `noreply@email.bassh.io` (not `noreply@bassh.io`).

#### 3. Redeploy

```bash
bassh-deploy
```

**If you skip this step:** The `-o` flag will return an error, but all other features (`-p`, `-e`, `-d`) work normally.

---

### Invite Codes

Your invite code format is `subdomain:secret`.

For example, if deployed at `https://bassh-api.bassh.workers.dev` with registration code `welcome123`:

```
bassh:welcome123
```

Share this with your users:
```bash
bassh register alice --invite bassh:welcome123
```

> **Tip:** Choose a memorable registration code - users will need to type it.

### Registration Modes

| Mode | Setup | Users Need |
|------|-------|------------|
| **Invite Code** | Set `REGISTRATION_CODE` secret | Just the invite code |
| **Open** | Don't set `REGISTRATION_CODE` | The `BASSH_API` URL |

---

### Quick Reference: All Secrets

| Secret | Required | Description |
|--------|----------|-------------|
| `CF_ACCOUNT_ID` | Yes | Your Cloudflare account ID |
| `CF_API_TOKEN` | Yes | API token with Pages/KV/Access permissions |
| `REGISTRATION_CODE` | No | Invite code for users (omit for open registration) |
| `RESEND_API_KEY` | No | Resend API key for magic link emails |
| `EMAIL_FROM` | No | Sender email (must match Resend verified domain) |

---

## How It Works

```
bassh ./my-folder
        |
        v
  +-----------------+
  |  CLI packages   |
  |  files as JSON  |
  +-----------------+
        |
        v
  +-----------------+
  |  Cloudflare     |
  |  Worker API     |
  +-----------------+
        |
        v
  +-----------------+
  |  Cloudflare     |
  |  Pages          |
  +-----------------+
        |
        v
  https://user-project.pages.dev
```

## Security

**Password Protection** - AES-256-GCM encryption with PBKDF2 key derivation (100k iterations). HTML files are encrypted server-side, decrypted client-side in the browser.

**Email Access Control** - Uses Cloudflare Access. Visitors verify via email code before accessing.

**One Account Per Computer** - Each machine can only have one account, tied to hardware ID.

## Costs

All on Cloudflare free tier:
- Workers: 100k requests/day
- Pages: unlimited sites, 500 builds/month
- Access: 50 users
- KV: 100k reads/day, 1k writes/day

**$0/month** for small teams.

## Claude Code Skill

Deploy HTML artifacts directly from Claude Code conversations.

> **Note:** Only works with Claude Code (CLI), not Claude.ai web.

### Install Skill

```bash
mkdir -p ~/.claude/skills
curl -fsSL https://raw.githubusercontent.com/get-bassh/bassh/main/skill/deploy-artifact.md \
  -o ~/.claude/skills/deploy-artifact.md
```

### Usage

In Claude Code:
```
Deploy this HTML with password "demo123":
<html><body><h1>Hello</h1></body></html>
```

Claude handles setup, deployment, and returns the protected URL.

See [skill/README.md](skill/README.md) for details.

## License

MIT
