#!/bin/bash

# bassh operator setup
# Run this to set up all Cloudflare resources and deploy

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo ""
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}       bassh Operator Setup${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo ""

# Check for wrangler
if ! command -v npx &> /dev/null; then
  echo -e "${RED}Error: npx not found. Install Node.js first.${NC}"
  exit 1
fi

# Check if logged in to Cloudflare
echo -e "${BLUE}Checking Cloudflare authentication...${NC}"
if ! npx wrangler whoami &> /dev/null; then
  echo -e "${YELLOW}Not logged in to Cloudflare. Running wrangler login...${NC}"
  npx wrangler login
fi

ACCOUNT_INFO=$(npx wrangler whoami 2>/dev/null)
echo -e "${GREEN}✓ Logged in to Cloudflare${NC}"
echo ""

# Get account ID
echo -e "${BLUE}Fetching account ID...${NC}"
CF_ACCOUNT_ID=$(npx wrangler whoami 2>&1 | grep -oE '[a-f0-9]{32}' | head -1)

if [[ -z "$CF_ACCOUNT_ID" ]]; then
  echo -e "${YELLOW}Could not auto-detect account ID.${NC}"
  echo -n "Enter your Cloudflare Account ID: "
  read -r CF_ACCOUNT_ID
fi
echo -e "${GREEN}✓ Account ID: ${CF_ACCOUNT_ID}${NC}"
echo ""

# Create KV namespaces
echo -e "${BLUE}Creating KV namespaces...${NC}"

# USERS namespace
USERS_OUTPUT=$(npx wrangler kv namespace create USERS 2>&1) || true
if echo "$USERS_OUTPUT" | grep -q "already exists"; then
  echo -e "${YELLOW}USERS namespace already exists${NC}"
  USERS_ID=$(npx wrangler kv namespace list 2>/dev/null | grep -A1 '"title": "bassh-api-USERS"' | grep '"id"' | grep -oE '[a-f0-9]{32}')
else
  USERS_ID=$(echo "$USERS_OUTPUT" | grep -oE '[a-f0-9]{32}' | head -1)
  echo -e "${GREEN}✓ Created USERS namespace${NC}"
fi

# FORMS namespace
FORMS_OUTPUT=$(npx wrangler kv namespace create FORMS 2>&1) || true
if echo "$FORMS_OUTPUT" | grep -q "already exists"; then
  echo -e "${YELLOW}FORMS namespace already exists${NC}"
  FORMS_ID=$(npx wrangler kv namespace list 2>/dev/null | grep -A1 '"title": "bassh-api-FORMS"' | grep '"id"' | grep -oE '[a-f0-9]{32}')
else
  FORMS_ID=$(echo "$FORMS_OUTPUT" | grep -oE '[a-f0-9]{32}' | head -1)
  echo -e "${GREEN}✓ Created FORMS namespace${NC}"
fi

echo ""

# Update wrangler.toml with namespace IDs
echo -e "${BLUE}Updating wrangler.toml...${NC}"

if [[ -n "$USERS_ID" ]]; then
  sed -i '' "s/^id = \".*\" # USERS$/id = \"$USERS_ID\" # USERS/" wrangler.toml 2>/dev/null || \
  sed -i '' "/binding = \"USERS\"/,/^$/s/id = \"[^\"]*\"/id = \"$USERS_ID\"/" wrangler.toml
fi

if [[ -n "$FORMS_ID" ]]; then
  sed -i '' "s/^id = \".*\" # FORMS$/id = \"$FORMS_ID\" # FORMS/" wrangler.toml 2>/dev/null || \
  sed -i '' "/binding = \"FORMS\"/,/^$/s/id = \"[^\"]*\"/id = \"$FORMS_ID\"/" wrangler.toml
fi

echo -e "${GREEN}✓ Updated wrangler.toml${NC}"
echo ""

# Collect secrets
echo -e "${BLUE}Setting up secrets...${NC}"
echo ""

# CF_ACCOUNT_ID
echo -e "${CYAN}Setting CF_ACCOUNT_ID...${NC}"
echo "$CF_ACCOUNT_ID" | npx wrangler secret put CF_ACCOUNT_ID --quiet
echo -e "${GREEN}✓ CF_ACCOUNT_ID set${NC}"

# CF_API_TOKEN
echo ""
echo -e "${YELLOW}Create an API token at: https://dash.cloudflare.com/profile/api-tokens${NC}"
echo "Required permissions:"
echo "  • Account > Cloudflare Pages > Edit"
echo "  • Account > Access: Apps and Policies > Edit"
echo ""
echo -n "Enter your Cloudflare API Token: "
read -rs CF_API_TOKEN
echo ""
echo "$CF_API_TOKEN" | npx wrangler secret put CF_API_TOKEN --quiet
echo -e "${GREEN}✓ CF_API_TOKEN set${NC}"

# REGISTRATION_CODE (optional)
echo ""
echo -e "${YELLOW}Registration code (optional - leave empty for open registration):${NC}"
echo -n "Enter registration code: "
read -rs REGISTRATION_CODE
echo ""
if [[ -n "$REGISTRATION_CODE" ]]; then
  echo "$REGISTRATION_CODE" | npx wrangler secret put REGISTRATION_CODE --quiet
  echo -e "${GREEN}✓ REGISTRATION_CODE set${NC}"
else
  echo -e "${BLUE}Skipped (open registration)${NC}"
fi

# EMAIL_FROM (optional)
echo ""
echo -e "${YELLOW}Email sender address (optional - for magic link feature):${NC}"
echo "Requires Cloudflare Email Routing enabled on your domain."
echo -n "Enter sender email (e.g., access@yourdomain.com) or leave empty: "
read -r EMAIL_FROM
if [[ -n "$EMAIL_FROM" ]]; then
  echo "$EMAIL_FROM" | npx wrangler secret put EMAIL_FROM --quiet
  echo -e "${GREEN}✓ EMAIL_FROM set${NC}"
else
  echo -e "${BLUE}Skipped (magic links disabled)${NC}"
fi

echo ""

# Deploy
echo -e "${BLUE}Deploying worker...${NC}"
npx wrangler deploy

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""

# Get deployed URL
WORKER_URL=$(npx wrangler whoami 2>&1 | grep -oE 'bassh-api\.[^.]+\.workers\.dev' | head -1)
if [[ -z "$WORKER_URL" ]]; then
  # Extract subdomain from account
  SUBDOMAIN=$(echo "$ACCOUNT_INFO" | grep -oE '[a-z0-9-]+\.workers\.dev' | head -1 | cut -d'.' -f1)
  WORKER_URL="bassh-api.${SUBDOMAIN}.workers.dev"
fi

echo -e "${BLUE}Your worker URL:${NC}"
echo -e "  https://${WORKER_URL}"
echo ""

if [[ -n "$REGISTRATION_CODE" ]]; then
  # Extract subdomain from worker URL
  SUBDOMAIN=$(echo "$WORKER_URL" | sed 's/bassh-api\.//' | sed 's/\.workers\.dev//')
  echo -e "${BLUE}Your invite code:${NC}"
  echo -e "  ${CYAN}${SUBDOMAIN}:${REGISTRATION_CODE}${NC}"
  echo ""
  echo "Share this with your users to register:"
  echo -e "  ${CYAN}bassh register <username> --invite ${SUBDOMAIN}:${REGISTRATION_CODE}${NC}"
else
  echo -e "${BLUE}Open registration mode${NC}"
  echo "Users can register with:"
  echo -e "  ${CYAN}export BASSH_API=https://${WORKER_URL}${NC}"
  echo -e "  ${CYAN}bassh register <username>${NC}"
fi
echo ""
