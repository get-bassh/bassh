# share-site

Deploy static sites to Cloudflare Pages with one command. No Cloudflare account needed.

There are two roles:
- **Operator** - Runs the share-site infrastructure on Cloudflare
- **User** - Deploys sites using an invite code from an operator

---

## For Users

### Get Started

```bash
# Install
curl -fsSL https://raw.githubusercontent.com/bob-rietveld/share-site/main/install.sh | bash
source ~/.zshrc

# Register (get invite code from your operator)
share-site register myusername --invite subdomain:secret123

# Deploy
share-site ./my-folder
```

### Deploy Options

```bash
# Deploy current directory
share-site

# Deploy specific folder
share-site ./my-site

# Custom project name
share-site ./my-site -n my-project

# Password protected
share-site ./my-site -p secret123

# Email-restricted access
share-site ./my-site -e "alice@gmail.com,bob@company.com"

# Domain-restricted access
share-site ./my-site -d "@company.com"

# With custom domain
share-site ./my-site --custom-domain docs.example.com
```

### Custom Domains

Attach your own domain to any deployed site:

```bash
share-site ./my-site -n my-project --custom-domain docs.example.com
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

### Manage Your Sites

```bash
# List your projects
share-site -l

# Delete a project
share-site -D -n my-project

# Check who you're logged in as
share-site me

# Show your API key (for CI/CD)
share-site key

# Delete your account and all sites
share-site uninstall
```

### CI/CD Usage

For automated deployments, set these environment variables:

```bash
export SHARE_SITE_API=https://share-site-api.example.workers.dev
export SHARE_SITE_KEY=sk_your_api_key_here
share-site ./dist
```

Get your API key with `share-site key`.

---

## For Operators

### Get Started

#### 1. Create Cloudflare API Token

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Create token with permissions:
   - **Account** > Cloudflare Pages > Edit
   - **Account** > Access: Apps and Policies > Edit

#### 2. Create KV Namespace

```bash
npx wrangler kv namespace create USERS
```

#### 3. Configure wrangler.toml

```toml
name = "share-site-api"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "USERS"
id = "your-namespace-id"
```

#### 4. Set Secrets

```bash
npx wrangler secret put CF_API_TOKEN
npx wrangler secret put CF_ACCOUNT_ID
```

#### 5. Deploy

```bash
npx wrangler deploy
```

#### 6. Create Invite Code

```bash
npx wrangler secret put REGISTRATION_CODE
# Enter a secret, e.g.: mysecret123
```

Your invite code is `subdomain:secret`. For example, if deployed at `https://share-site-api.bob-rietveld.workers.dev` with secret `mysecret123`:

```
bob-rietveld:mysecret123
```

Share this with your users.

### Registration Modes

| Mode | Setup | Users Need |
|------|-------|------------|
| **Invite Code** | Set `REGISTRATION_CODE` | Just the invite code |
| **Open** | No `REGISTRATION_CODE` | The `SHARE_SITE_API` URL |

---

## How It Works

```
share-site ./my-folder
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
curl -fsSL https://raw.githubusercontent.com/bob-rietveld/share-site/main/skill/deploy-artifact.md \
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
