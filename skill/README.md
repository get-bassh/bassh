# bassh Skill for Claude Code

Deploy HTML artifacts and static sites from Claude Code to a private, password-protected URL.

> Works only with Claude Code (and other shell-capable agents). The Claude.ai web UI cannot run shell commands and cannot use this skill.

## Install

The skill is a single file with YAML frontmatter, so Claude Code picks it up automatically once placed under `~/.claude/skills/`.

**Recommended (modern, directory-style layout):**

```bash
mkdir -p ~/.claude/skills/deploy-artifact
curl -fsSL https://raw.githubusercontent.com/get-bassh/bassh/main/skill/deploy-artifact.md \
  -o ~/.claude/skills/deploy-artifact/SKILL.md
```

**Flat layout** also works:

```bash
mkdir -p ~/.claude/skills
curl -fsSL https://raw.githubusercontent.com/get-bassh/bassh/main/skill/deploy-artifact.md \
  -o ~/.claude/skills/deploy-artifact.md
```

Restart Claude Code (or run `/skills` to confirm it's loaded).

## Prerequisites

1. **`bassh` CLI installed:**
   ```bash
   curl -fsSL https://raw.githubusercontent.com/get-bassh/bassh/main/install.sh | bash
   source ~/.zshrc
   ```

2. **Registered with an invite code:**
   ```bash
   bassh register myusername --invite subdomain:secret123
   ```

   Don't have a code? Ask your bassh operator, or run your own worker — see the project [README](../README.md) for operator setup.

## Usage

In Claude Code, just ask:

```
Deploy this HTML with a random password:
<html><body><h1>Hello</h1></body></html>
```

Or after generating an artifact:

```
Deploy that HTML behind email login for alice@example.com
```

Claude will:

1. Confirm the CLI is installed and you're logged in (and walk you through setup if not).
2. Stage your HTML in a temp directory.
3. Deploy with the protection you asked for (password, magic link, or Cloudflare Access).
4. Return the URL and credentials.

## What the skill handles

- First-time install + registration flow
- HTML pulled from chat, artifacts, or local files
- Password / email magic link / Cloudflare Access protection
- Custom domains (prints the CNAME record)
- Project listing, deletion, and form-submission viewing
- Optional contact-form scaffolding that posts to the bassh API
