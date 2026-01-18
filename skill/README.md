# bassh Skill for Claude Code

Deploy HTML artifacts directly from Claude Code to password-protected URLs.

> **Note:** This skill only works with Claude Code (the CLI). It does not work with Claude.ai web interface.

## Install

Copy the skill to your Claude Code skills directory:

```bash
mkdir -p ~/.claude/skills
curl -fsSL https://raw.githubusercontent.com/get-bassh/bassh/main/skill/deploy-artifact.md \
  -o ~/.claude/skills/deploy-artifact.md
```

## Prerequisites

1. **bassh CLI installed:**
   ```bash
   curl -fsSL https://raw.githubusercontent.com/get-bassh/bassh/main/install.sh | bash
   source ~/.zshrc
   ```

2. **Registered with an invite code:**
   ```bash
   bassh register myusername --invite subdomain:secret123
   ```

## Usage

In Claude Code, just ask:

```
Deploy this HTML with password "secret123":
<html><body><h1>Hello</h1></body></html>
```

Or after generating an artifact:

```
Deploy that HTML artifact with a random password
```

Claude will:
1. Check you're set up (guide you through setup if not)
2. Create a temp directory with your HTML
3. Deploy via bassh with password protection
4. Return the URL and password

## What It Handles

- First-time setup (installation + registration)
- HTML from conversation, artifacts, or files
- Password protection (required or auto-generated)
- Error recovery with clear guidance
