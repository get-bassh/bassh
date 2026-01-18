# GitHub Actions Deployment

Auto-deploy your site to bassh when you push to GitHub.

## Quick Setup

### 1. Copy the workflow file

Copy `deploy.yml` to your repository:

```bash
mkdir -p .github/workflows
curl -fsSL https://raw.githubusercontent.com/get-bassh/bassh/main/examples/github-actions/deploy.yml \
  -o .github/workflows/deploy.yml
```

### 2. Configure the workflow

Edit `.github/workflows/deploy.yml`:

```yaml
env:
  DEPLOY_DIR: "./public"      # Your build output folder
  PROJECT_NAME: "my-site"     # Your project name
```

### 3. Add GitHub Secrets

Go to your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret | Value | Required |
|--------|-------|----------|
| `BASSH_API` | `https://bassh-api.YOUR-SUBDOMAIN.workers.dev` | Yes |
| `BASSH_KEY` | Your API key (run `bassh key`) | Yes |
| `SITE_PASSWORD` | Password for site access | No |
| `CUSTOM_DOMAIN` | Your custom domain | No |

### 4. Push to deploy

```bash
git add .
git commit -m "Add deployment workflow"
git push
```

Your site deploys automatically on every push to `main`.

---

## Workflow Templates

### Basic (`deploy.yml`)

Simple deployment on push to main:
- Installs bassh CLI
- Deploys specified directory
- No build step (add your own if needed)

### Advanced (`deploy-advanced.yml`)

Full CI/CD workflow:
- Builds with Node.js
- Deploys on push to main
- Creates preview deployments for PRs
- Comments on PRs with preview URL
- Supports password and custom domain via secrets

---

## Examples

### Static HTML site

```yaml
env:
  DEPLOY_DIR: "./"           # Deploy repo root
  PROJECT_NAME: "my-site"
```

### React/Vite/Next.js

```yaml
env:
  DEPLOY_DIR: "./dist"       # or "./build", "./out"
  PROJECT_NAME: "my-app"
```

Add build steps:
```yaml
- name: Install & Build
  run: |
    npm ci
    npm run build
```

### With password protection

Add `SITE_PASSWORD` secret, then:
```yaml
- name: Deploy
  run: bassh ${{ env.DEPLOY_DIR }} -n ${{ env.PROJECT_NAME }} -p "${{ secrets.SITE_PASSWORD }}"
```

### With custom domain

Add `CUSTOM_DOMAIN` secret, then:
```yaml
- name: Deploy
  run: bassh ${{ env.DEPLOY_DIR }} -n ${{ env.PROJECT_NAME }} --custom-domain "${{ secrets.CUSTOM_DOMAIN }}"
```

---

## Troubleshooting

### "Not logged in" error

Your `BASSH_KEY` secret is missing or incorrect. Run `bassh key` locally to get your key.

### "Invalid API key" error

Regenerate your key: `bassh key --regenerate`, then update the GitHub secret.

### Build artifacts not found

Make sure `DEPLOY_DIR` matches your actual build output folder.
