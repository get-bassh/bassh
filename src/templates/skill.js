// The bassh-deploy Cowork skill, served as a static asset at /skill/bassh-deploy.md.
// Mirrors cowork-skill/bassh-deploy/SKILL.md verbatim. Keep them in sync; this is
// the canonical hosted copy that Cowork pulls when a user adds the skill by URL.

export const SKILL_MARKDOWN = `---
name: bassh-deploy
description: Deploy an HTML artifact to a private password- or magic-link-protected URL via bassh.io. Use when the user asks to deploy, share, host, preview, or publish HTML privately. Also handles listing and deleting their existing bassh projects. Requires a bassh API key (sk_…) which the user obtains by signing up at https://bassh.io.
---

# Deploy an artifact to bassh.io

This skill turns any HTML artifact, page, or static site into a private,
shareable URL. The deploy backend is bassh.io (a Cloudflare Pages multi-tenant
host). The user signs up once at https://bassh.io to get an API key (\`sk_…\`),
then this skill handles the rest.

## When to use

The user says any of:
- "Deploy this artifact / page / HTML"
- "Share this privately / behind a password / behind email login"
- "Put this online / publish this / host this"
- "List my deployed sites"
- "Delete the X site"

If they're asking about something other than HTML (PDF, image, etc.) — bassh
hosts static sites only, so wrap it in an HTML page that displays/links it.

## Prerequisites

You need the user's bassh API key. Look in this order:

1. **Environment variable \`BASSH_KEY\`** — if Cowork has it set as a skill secret,
   read it via \`os.environ["BASSH_KEY"]\`.
2. **Earlier in this conversation** — if the user has already pasted a key
   (starts with \`sk_\`), reuse it. Don't ask again.
3. **Ask the user**:
   \`\`\`
   To deploy, I need your bassh API key. Get one at https://bassh.io
   (free, takes ~30 seconds — just enter your email and click the
   verification link). Then paste the key here. It looks like sk_abc123…
   \`\`\`
   Wait for response. Validate it starts with \`sk_\`.

Store the key in a Python variable for the rest of the conversation.

## Workflow

### 1. Determine the HTML to deploy

- If the user pasted HTML inline → use it.
- If they refer to "the artifact" or "the page" — use the most recent HTML
  artifact you produced.
- If they pointed at a file — read it.
- If unclear, ask: "What HTML should I deploy? Paste it, or tell me which
  artifact."

### 2. Decide protection

Default: **generate a 12-character random password** unless the user said
otherwise. Bassh deployments live at public URLs; password (or magic link)
protection is what keeps them private.

Options:
- \`password\`: anyone with the password can view (simplest)
- \`otp_emails\`: only listed emails get a one-time login link (private to a
  group)
- nothing: fully public (only if the user explicitly says "no protection")

If the user wants a project name, validate: lowercase letters/digits/dashes,
1-58 chars, no leading/trailing dash. Otherwise leave it blank — bassh
auto-generates one.

### 3. Deploy

Run the helper script in this skill:

\`\`\`python
from deploy import deploy_html

result = deploy_html(
    html=html_content,
    api_key=api_key,
    password=password,           # or None
    otp_emails=None,             # or "alice@x.com,bob@y.com"
    project_name=None,           # or "my-landing-page"
)
print(result)
# {"success": True, "url": "https://alice-my-landing-page.pages.dev",
#  "project": "alice-my-landing-page", "shortName": "my-landing-page"}
\`\`\`

\`deploy.py\` lives in this skill directory. It POSTs the right JSON to
\`https://bassh.io/\` with the API key in the \`X-API-Key\` header and returns
the parsed response.

### 4. Report the result

\`\`\`
Deployed.

URL:      <url>
Password: <password>   (only if password was used)

Share the URL and password through different channels.
\`\`\`

If \`otp_emails\` was used, list the allowed emails instead of a password and
explain that visitors enter their email and receive a magic link.

If a custom domain was attached, also surface the CNAME instructions from
\`result["customDomain"]\`.

If deploy failed (\`success\` false): show the error verbatim. Common issues:
- \`Invalid API key\` → ask user to double-check or rotate at bassh.io
- \`Project name already taken\` → suggest a different one

## Other operations

\`\`\`python
from deploy import list_projects, delete_project, get_forms

list_projects(api_key=api_key)
delete_project(api_key=api_key, project_name="my-landing-page")
get_forms(api_key=api_key, project_name="my-landing-page")
\`\`\`

For destructive calls, confirm with the user first.

## Tips

- Default to password protection unless the user says otherwise.
- For multi-page artifacts, pass them as separate files via \`deploy_files()\`.
- Never echo the user's API key back in the final answer.
- Subsequent deploys to the same project name overwrite the previous one.
`;
