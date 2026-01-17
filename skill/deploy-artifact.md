# Deploy Artifact Skill

Deploy HTML artifacts to a password-protected URL using share-site.

**Important:** This skill only works in Claude Code (the CLI tool). It does not work in Claude.ai web or Claude Desktop without shell access.

## When to Use

Use this skill when the user asks to:
- Deploy an HTML artifact
- Share an HTML page privately
- Create a password-protected preview
- Host HTML content temporarily

## Workflow

### Step 1: Check if share-site CLI is installed

Run:
```bash
which share-site
```

**If not found**, tell the user:
```
share-site CLI is not installed.

Install it with:
  curl -fsSL https://raw.githubusercontent.com/bob-rietveld/share-site/main/install.sh | bash
  source ~/.zshrc

Then ask me to deploy again.
```
Stop here until user installs.

### Step 2: Check if user is registered

Run:
```bash
share-site me 2>&1
```

**If output contains "Logged in as"**, proceed to Step 3.

**If output contains "Not logged in" or error**, the user needs to register:

Ask the user:
```
You're not registered with share-site yet.

Do you have an invite code? It looks like: subdomain:secret123

If yes, tell me your invite code and desired username.
If no, contact your share-site operator to get one.
```

Wait for user response.

**When user provides invite code and username**, run:
```bash
share-site register USERNAME --invite INVITE_CODE
```

Check output:
- If "Registered as USERNAME" → proceed to Step 3
- If "Invalid invite code" → ask user to check the code
- If "Username already taken" → ask for different username
- If "machine already registered" → tell user this computer already has an account, run `share-site me` to see it

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
share-site "$DEPLOY_DIR" -p "PASSWORD" -n "PROJECT_NAME"
```

**With email magic link:**
```bash
share-site "$DEPLOY_DIR" -o "alice@gmail.com,bob@company.com" -n "PROJECT_NAME"
```

**With domain-based email access:**
```bash
share-site "$DEPLOY_DIR" -o "@company.com" -n "PROJECT_NAME"
```

**With custom domain:**
```bash
share-site "$DEPLOY_DIR" -p "PASSWORD" -n "PROJECT_NAME" --custom-domain "CUSTOM_DOMAIN"
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
- "Invalid API key" → tell user to re-register or run `share-site key --regenerate`
- Network error → ask user to check internet connection
- Other error → show the error and suggest running `share-site me` to verify setup

## Error Recovery

### "command not found: share-site"
CLI not installed. Guide user through installation.

### "Not logged in" or auth errors
Registration issue. Guide user through registration with invite code.

### "Invalid invite code"
User provided wrong code. Ask them to verify with their operator.

### "Username already taken"
Ask for a different username.

### "This machine is already registered"
Computer has existing account. Run `share-site me` to see current user.
If user wants different account, they must run `share-site uninstall` first.

### Deployment returns no URL
Unexpected error. Show full output and suggest:
1. Check `share-site me` works
2. Try `share-site -l` to list projects
3. Check internet connection

## Example Conversation

**User:** Deploy this HTML with password "demo123"
```html
<html><body><h1>Hello World</h1></body></html>
```

**Assistant:**
1. Checks `share-site me` → user is logged in
2. Creates temp dir, writes HTML
3. Runs `share-site /tmp/xxx -p demo123`
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

If the user wants to collect form submissions from their deployed site, you can add a form that posts to the share-site API.

### Adding a Form

First, get the user's info:
```bash
share-site me
```

Output shows:
```
Logged in as: username
API: https://share-site-api.yourname.workers.dev
Domain: username-{project}.pages.dev
```

Use this info to construct the form:

**Form action URL:** `{API}/form/{PROJECT_NAME}`

**Redirect URL after submission:**
- If custom domain used: `https://{custom-domain}/thanks.html`
- If no custom domain: `https://{username}-{project}.pages.dev/thanks.html`

### Example Form HTML

```html
<form action="https://share-site-api.yourname.workers.dev/form/my-project" method="POST">
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
<form action="https://share-site-api.yourname.workers.dev/form/my-project" method="POST">
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
share-site forms -n my-project

# Export as CSV
share-site forms -n my-project --csv

# Export as JSON
share-site forms -n my-project --json

# Count only
share-site forms -n my-project --count

# Clear all
share-site forms -n my-project --clear
```

### Limits

- 10 submissions/minute per IP
- 10KB max payload
- 90-day retention
