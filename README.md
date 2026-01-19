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

> **Operator requirement:** This feature requires Cloudflare Email Routing, which means the operator's domain must have its nameservers pointed to Cloudflare. If your operator hasn't enabled this, use `-p` (password) instead. See Operator Setup for details.

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

**Notes:**
- Subdomains (docs.example.com, www.example.com) work with any DNS provider via CNAME
- Root domains (example.com) require CNAME flattening (Cloudflare DNS) or ALIAS records
- Cloudflare automatically provisions and renews SSL certificates

### Form Submissions

Collect form data from your static sites. No backend needed.

**1. Add a form to your HTML:**

```html
<form action="https://bassh-api.yourname.workers.dev/form/my-project" method="POST">
  <input type="text" name="name" placeholder="Name" required>
  <input type="email" name="email" placeholder="Email" required>
  <textarea name="message" placeholder="Message"></textarea>
  <button type="submit">Send</button>
</form>
```

Get your API URL with `bassh me`.

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

### Quick Setup (Recommended)

One command sets up everything:

```bash
git clone https://github.com/get-bassh/bassh.git
cd bassh
./setup.sh
```

The setup script will:
1. Create KV namespaces (USERS, FORMS)
2. Configure wrangler.toml
3. Set all required secrets
4. Deploy the worker
5. Display your invite code

**Prerequisites:**
- Node.js installed
- [Cloudflare API Token](https://dash.cloudflare.com/profile/api-tokens) with permissions:
  - **Account** > Cloudflare Pages > Edit
  - **Account** > Access: Apps and Policies > Edit

---

### Manual Setup

<details>
<summary>Click to expand manual setup steps</summary>

#### 1. Create Cloudflare API Token

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Create token with permissions:
   - **Account** > Cloudflare Pages > Edit
   - **Account** > Access: Apps and Policies > Edit

#### 2. Create KV Namespaces

```bash
npx wrangler kv namespace create USERS
npx wrangler kv namespace create FORMS
```

#### 3. Configure wrangler.toml

```toml
name = "bassh-api"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "USERS"
id = "your-users-namespace-id"

[[kv_namespaces]]
binding = "FORMS"
id = "your-forms-namespace-id"
```

#### 4. Set Secrets

```bash
npx wrangler secret put CF_API_TOKEN
npx wrangler secret put CF_ACCOUNT_ID
npx wrangler secret put REGISTRATION_CODE  # optional, for invite-only
```

#### 5. Deploy

```bash
npx wrangler deploy
```

</details>

---

### (Optional) Enable Email Magic Links

To support the `-o` flag for email magic links, you need [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/).

**Requirements:**
- Your domain's **nameservers must point to Cloudflare** (not just the worker)
- If your domain is hosted elsewhere, you'll need to change nameservers to Cloudflare
- This is optional - users can still use `-p` (password) without this setup

**Setup steps:**

1. Add your domain to Cloudflare (if not already) and update nameservers
2. Go to your domain → Email → Email Routing → Enable
3. Add the `send_email` binding to wrangler.toml:

```toml
[[send_email]]
name = "EMAIL"
```

4. Set the sender address (must be on your Cloudflare domain):
```bash
npx wrangler secret put EMAIL_FROM
# e.g., access@yourdomain.com
```

**If you skip this step:** The `-o` flag will return an error, but all other features (`-p`, `-e`, `-d`) work normally.

---

### Invite Codes

Your invite code format is `subdomain:secret`. For example, if deployed at `https://bassh-api.bob-rietveld.workers.dev` with registration code `mysecret123`:

```
bob-rietveld:mysecret123
```

Share this with your users:
```bash
bassh register alice --invite bob-rietveld:mysecret123
```

### Registration Modes

| Mode | Setup | Users Need |
|------|-------|------------|
| **Invite Code** | Set `REGISTRATION_CODE` | Just the invite code |
| **Open** | No `REGISTRATION_CODE` | The `BASSH_API` URL |

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
