# Deploy Artifact Skill

Deploy HTML artifacts to a password-protected URL using bassh.

**Important:** This skill only works in Claude Code (the CLI tool). It does not work in Claude.ai web or Claude Desktop without shell access.

## When to Use

Use this skill when the user asks to:
- Deploy an HTML artifact
- Share an HTML page privately
- Create a password-protected preview
- Host HTML content temporarily

## Workflow

### Step 1: Check if bassh CLI is installed

Run:
```bash
which bassh
```

**If not found**, tell the user:
```
bassh CLI is not installed.

Install it with:
  curl -fsSL https://raw.githubusercontent.com/get-bassh/bassh/main/install.sh | bash
  source ~/.zshrc

Then ask me to deploy again.
```
Stop here until user installs.

### Step 2: Check if user is registered

Run:
```bash
bassh me 2>&1
```

**If output contains "Logged in as"**, proceed to Step 3.

**If output contains "Not logged in" or error**, the user needs to register:

Ask the user:
```
You're not registered with bassh yet.

Do you have an invite code? It looks like: subdomain:secret123

If yes, tell me your invite code and desired username.
If no, contact your bassh operator to get one.
```

Wait for user response.

**When user provides invite code and username**, run:
```bash
bassh register USERNAME --invite INVITE_CODE
```

Check output:
- If "Registered as USERNAME" → proceed to Step 3
- If "Invalid invite code" → ask user to check the code
- If "Username already taken" → ask for different username
- If "machine already registered" → tell user this computer already has an account, run `bassh me` to see it

### Step 3: Prepare the HTML content

Determine what HTML to deploy:
- If user provided HTML content, use that
- If user refers to a previous artifact, use that HTML
- If user refers to a file, read that file

**If no HTML content can be determined**, ask:
```
What HTML would you like to deploy? You can:
- Paste the HTML directly
- Tell me which artifact from our conversation
- Provide a file path
```

### Step 4: Ask for deployment options

Ask the user:
```
Ready to deploy. Options:

Protection:
  • Password (-p): Anyone with password can access
  • Email magic link (-o): Only listed emails can access (receives link via email)

Project name: (optional, auto-generated if not provided)
Custom domain: (optional, e.g., docs.example.com)

How would you like to protect this? Password or email addresses?
```

**If user provides a project name**, validate it first:
- 1-58 characters long
- Lowercase letters, numbers, and dashes only
- Cannot start or end with a dash

**If invalid**, tell the user:
```
Invalid project name. Names must be:
• 1-58 characters long
• Lowercase letters, numbers, and dashes only
• Cannot start or end with a dash

Example: my-project-123
```

**If user says "generate" or similar for password**, generate a random password:
```bash
openssl rand -base64 12 | tr -dc 'a-zA-Z0-9' | head -c 12
```

### Step 5: Deploy

Create temp directory and write HTML:
```bash
DEPLOY_DIR=$(mktemp -d)
cat > "$DEPLOY_DIR/index.html" << 'HTMLEOF'
[HTML CONTENT HERE]
HTMLEOF
```

**With password protection:**
```bash
bassh "$DEPLOY_DIR" -p "PASSWORD" -n "PROJECT_NAME"
```

**With email magic link:**
```bash
bassh "$DEPLOY_DIR" -o "alice@gmail.com,bob@company.com" -n "PROJECT_NAME"
```

**With domain-based email access:**
```bash
bassh "$DEPLOY_DIR" -o "@company.com" -n "PROJECT_NAME"
```

**With custom domain:**
```bash
bassh "$DEPLOY_DIR" -p "PASSWORD" -n "PROJECT_NAME" --custom-domain "CUSTOM_DOMAIN"
```

Clean up:
```bash
rm -rf "$DEPLOY_DIR"
```

### Step 6: Report result

**If deployment succeeded** (output contains "Site deployed successfully"):

Extract the URL from output and tell the user:

**For password protection:**
```
Deployed successfully!

URL: [extracted URL]
Password: [the password used]

Share the URL and password separately for security.
```

**For email magic link:**
```
Deployed successfully!

URL: [extracted URL]
Allowed emails: [the emails/domains]

Only these emails can request a magic link to access.
```

**If custom domain was used**, also include the DNS instructions shown in the output:
```
Custom domain: docs.example.com

Add this DNS record at your domain provider:
  Type:  CNAME
  Name:  docs
  Value: username-project.pages.dev

Once configured, https://docs.example.com will be live.
```

**If deployment failed**, check the error:
- "not logged in" → go back to Step 2
- "Invalid API key" → tell user to re-register or run `bassh key --regenerate`
- Network error → ask user to check internet connection
- Other error → show the error and suggest running `bassh me` to verify setup

## Error Recovery

### "command not found: bassh"
CLI not installed. Guide user through installation.

### "Not logged in" or auth errors
Registration issue. Guide user through registration with invite code.

### "Invalid invite code"
User provided wrong code. Ask them to verify with their operator.

### "Username already taken"
Ask for a different username.

### "This machine is already registered"
Computer has existing account. Run `bassh me` to see current user.
If user wants different account, they must run `bassh uninstall` first.

### Deployment returns no URL
Unexpected error. Show full output and suggest:
1. Check `bassh me` works
2. Try `bassh -l` to list projects
3. Check internet connection

## Example Conversation

**User:** Deploy this HTML with password "demo123"
```html
<html><body><h1>Hello World</h1></body></html>
```

**Assistant:**
1. Checks `bassh me` → user is logged in
2. Creates temp dir, writes HTML
3. Runs `bassh /tmp/xxx -p demo123`
4. Reports:
   ```
   Deployed successfully!

   URL: https://bob-demo-site-12345.pages.dev
   Password: demo123
   ```

## Notes

- Always use password protection for artifacts (the whole point is private sharing)
- Clean up temp directories after deployment
- Never log or display the user's invite code after registration
- The URL is public but content is encrypted - password required to view

## Forms (Optional)

If the user wants to collect form submissions from their deployed site, you can add a form that posts to the bassh API.

### Adding a Form

First, get the user's info:
```bash
bassh me
```

Output shows:
```
Logged in as: username
API: https://bassh-api.yourname.workers.dev
Domain: username-{project}.pages.dev
```

Use this info to construct the form:

**Form action URL:** `{API}/form/{PROJECT_NAME}`

**Redirect URL after submission:**
- If custom domain used: `https://{custom-domain}/thanks.html`
- If no custom domain: `https://{username}-{project}.pages.dev/thanks.html`

### Example Form HTML

```html
<form action="https://bassh-api.yourname.workers.dev/form/my-project" method="POST">
  <input type="hidden" name="_redirect" value="https://username-my-project.pages.dev/thanks.html">
  <input type="hidden" name="_honeypot" value="" style="display:none">

  <input type="text" name="name" required>
  <input type="email" name="email" required>
  <textarea name="message"></textarea>
  <button type="submit">Send</button>
</form>
```

**With custom domain:**
```html
<form action="https://bassh-api.yourname.workers.dev/form/my-project" method="POST">
  <input type="hidden" name="_redirect" value="https://docs.example.com/thanks.html">
  ...
</form>
```

### Creating a Thank You Page

When deploying a site with a form, include a `thanks.html` file:
```html
<!DOCTYPE html>
<html>
<head><title>Thank You</title></head>
<body>
  <h1>Thank you!</h1>
  <p>Your submission has been received.</p>
  <a href="/">Back to home</a>
</body>
</html>
```

### Viewing Submissions

```bash
# Human-readable list
bassh forms -n my-project

# Export as CSV
bassh forms -n my-project --csv

# Export as JSON
bassh forms -n my-project --json

# Count only
bassh forms -n my-project --count

# Clear all
bassh forms -n my-project --clear
```

### Limits

- 10 submissions/minute per IP
- 10KB max payload
- 90-day retention

---

## Operator Setup

Use this section when a user wants to run their own bassh infrastructure on Cloudflare.

### Prerequisites

- Node.js installed
- Cloudflare account (free tier works)
- Cloudflare API Token with permissions:
  - **Account** > Cloudflare Pages > Edit
  - **Account** > Access: Apps and Policies > Edit

### Step 1: Clone and Setup

```bash
git clone https://github.com/get-bassh/bassh.git
cd bassh
./setup.sh
```

The setup script will interactively:
1. Log in to Cloudflare (if needed)
2. Create KV namespaces (USERS, FORMS)
3. Update wrangler.toml with namespace IDs
4. Prompt for secrets:
   - `CF_ACCOUNT_ID` (auto-detected)
   - `CF_API_TOKEN` (user provides)
   - `REGISTRATION_CODE` (optional, for invite-only mode)
   - `EMAIL_FROM` (optional, for magic link feature)
5. Deploy the worker
6. Display the invite code

### Step 2: Get Invite Code

After setup completes, the script displays:
```
Your worker URL:
  https://bassh-api.yoursubdomain.workers.dev

Your invite code:
  yoursubdomain:yoursecret
```

### Step 3: Share with Users

Tell users to register with:
```bash
curl -fsSL https://raw.githubusercontent.com/get-bassh/bassh/main/install.sh | bash
source ~/.zshrc
bassh register USERNAME --invite yoursubdomain:yoursecret
```

### Optional: Email Magic Links

To enable the `-o` flag for email magic links:

1. Domain must have nameservers pointing to Cloudflare
2. Enable Email Routing: Domain → Email → Email Routing → Enable
3. Set `EMAIL_FROM` secret during setup (e.g., `access@yourdomain.com`)

If not configured, users can still use `-p` (password) protection.

### Operator Commands

```bash
# Redeploy after changes
npx wrangler deploy

# View logs
npx wrangler tail

# Update a secret
npx wrangler secret put SECRET_NAME

# List KV namespaces
npx wrangler kv namespace list
```

### Costs

All on Cloudflare free tier:
- Workers: 100k requests/day
- Pages: unlimited sites, 500 builds/month
- Access: 50 users
- KV: 100k reads/day, 1k writes/day

**$0/month** for small teams.
