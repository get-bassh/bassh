#!/bin/bash

# bassh operator setup
# Creates all Cloudflare resources and deploys the worker
# Works on macOS and Linux

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Cross-platform sed -i
sedi() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

print_header() {
  echo ""
  echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║${NC}              ${BOLD}bassh Operator Setup${NC}                         ${BLUE}║${NC}"
  echo -e "${BLUE}║${NC}      Deploy static sites to Cloudflare Pages             ${BLUE}║${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

print_step() {
  echo -e "\n${BLUE}▸${NC} ${BOLD}$1${NC}"
}

print_success() {
  echo -e "  ${GREEN}✓${NC} $1"
}

print_warning() {
  echo -e "  ${YELLOW}⚠${NC} $1"
}

print_error() {
  echo -e "  ${RED}✗${NC} $1"
}

print_info() {
  echo -e "  ${CYAN}ℹ${NC} $1"
}

# Check dependencies
check_dependencies() {
  print_step "Checking dependencies"

  if ! command -v node &> /dev/null; then
    print_error "Node.js not found. Install from https://nodejs.org"
    exit 1
  fi
  print_success "Node.js $(node -v)"

  if ! command -v npx &> /dev/null; then
    print_error "npx not found. Install Node.js 8.2.0+"
    exit 1
  fi
  print_success "npx available"
}

# Cloudflare authentication
authenticate_cloudflare() {
  print_step "Authenticating with Cloudflare"

  if npx wrangler whoami &> /dev/null; then
    WHOAMI=$(npx wrangler whoami 2>&1)
    EMAIL=$(echo "$WHOAMI" | grep -oE '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' | head -1)
    print_success "Logged in as ${EMAIL:-'unknown'}"
  else
    print_warning "Not logged in. Opening browser..."
    npx wrangler login
    print_success "Logged in to Cloudflare"
  fi
}

# Get account ID
get_account_id() {
  print_step "Getting Cloudflare Account ID"

  # Try to get from wrangler
  CF_ACCOUNT_ID=$(npx wrangler whoami 2>&1 | grep -oE '[a-f0-9]{32}' | head -1 || true)

  if [[ -z "$CF_ACCOUNT_ID" ]]; then
    # Try accounts list
    CF_ACCOUNT_ID=$(npx wrangler accounts list 2>&1 | grep -oE '[a-f0-9]{32}' | head -1 || true)
  fi

  if [[ -z "$CF_ACCOUNT_ID" ]]; then
    print_warning "Could not auto-detect Account ID"
    echo ""
    echo -e "  Find it at: ${CYAN}https://dash.cloudflare.com${NC}"
    echo "  (Click any domain → Overview → Account ID on the right)"
    echo ""
    echo -n "  Enter Account ID: "
    read -r CF_ACCOUNT_ID

    if [[ ! "$CF_ACCOUNT_ID" =~ ^[a-f0-9]{32}$ ]]; then
      print_error "Invalid Account ID format (should be 32 hex characters)"
      exit 1
    fi
  fi

  print_success "Account ID: ${CF_ACCOUNT_ID:0:8}...${CF_ACCOUNT_ID: -4}"
}

# Create KV namespace
create_kv_namespace() {
  local name=$1
  local var_name=$2

  # Check if exists
  EXISTING=$(npx wrangler kv namespace list 2>/dev/null | grep -o "\"id\": \"[a-f0-9]*\"" | head -20 || true)
  EXISTING_ID=$(npx wrangler kv namespace list 2>/dev/null | grep -B2 "bassh-api-${name}" | grep -oE '[a-f0-9]{32}' | head -1 || true)

  if [[ -n "$EXISTING_ID" ]]; then
    print_warning "${name} namespace already exists"
    eval "${var_name}='${EXISTING_ID}'"
  else
    OUTPUT=$(npx wrangler kv namespace create "$name" 2>&1)
    NS_ID=$(echo "$OUTPUT" | grep -oE '[a-f0-9]{32}' | head -1)

    if [[ -z "$NS_ID" ]]; then
      print_error "Failed to create ${name} namespace"
      echo "$OUTPUT"
      exit 1
    fi

    eval "${var_name}='${NS_ID}'"
    print_success "Created ${name} namespace"
  fi
}

# Create KV namespaces
create_kv_namespaces() {
  print_step "Creating KV namespaces"

  create_kv_namespace "USERS" "USERS_NS_ID"
  create_kv_namespace "FORMS" "FORMS_NS_ID"

  print_info "USERS: ${USERS_NS_ID:0:8}..."
  print_info "FORMS: ${FORMS_NS_ID:0:8}..."
}

# Generate wrangler.toml
generate_wrangler_toml() {
  print_step "Generating wrangler.toml"

  cat > wrangler.toml << EOF
name = "bassh-api"
main = "src/index.js"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

# Secrets (set via: npx wrangler secret put <NAME>):
#   CF_API_TOKEN      - Cloudflare API token with Pages + Access permissions
#   CF_ACCOUNT_ID     - Your Cloudflare account ID
#   REGISTRATION_CODE - (optional) Invite code for restricted registration
#   EMAIL_FROM        - (optional) Sender email for magic links

[vars]

[[kv_namespaces]]
binding = "USERS"
id = "${USERS_NS_ID}"

[[kv_namespaces]]
binding = "FORMS"
id = "${FORMS_NS_ID}"

# Email sending for magic links (optional)
# Requires Email Routing enabled on your domain
[[send_email]]
name = "EMAIL"
EOF

  print_success "Generated wrangler.toml"
}

# Get API token
get_api_token() {
  print_step "Configuring API Token"

  echo ""
  echo -e "  Create a token at: ${CYAN}https://dash.cloudflare.com/profile/api-tokens${NC}"
  echo ""
  echo "  Required permissions:"
  echo -e "    ${GREEN}•${NC} Account > Cloudflare Pages > Edit"
  echo -e "    ${GREEN}•${NC} Account > Access: Apps and Policies > Edit"
  echo ""
  echo "  Quick setup:"
  echo "    1. Click 'Create Token'"
  echo "    2. Use 'Edit Cloudflare Workers' template"
  echo "    3. Add 'Access: Apps and Policies - Edit' permission"
  echo ""

  while true; do
    echo -n "  Enter API Token: "
    read -rs CF_API_TOKEN
    echo ""

    if [[ -z "$CF_API_TOKEN" ]]; then
      print_error "API token is required"
      continue
    fi

    # Validate token format (Cloudflare tokens are base64-ish)
    if [[ ${#CF_API_TOKEN} -lt 30 ]]; then
      print_error "Token seems too short. Check and try again."
      continue
    fi

    break
  done

  print_success "API token received"
}

# Configure registration mode
configure_registration() {
  print_step "Registration Mode"

  echo ""
  echo "  Choose how users can register:"
  echo ""
  echo -e "    ${CYAN}1)${NC} Invite-only (recommended) - Users need an invite code"
  echo -e "    ${CYAN}2)${NC} Open registration - Anyone with your API URL can register"
  echo ""
  echo -n "  Choice [1/2]: "
  read -r REG_CHOICE

  if [[ "$REG_CHOICE" == "2" ]]; then
    REGISTRATION_CODE=""
    print_info "Open registration enabled"
  else
    echo ""
    echo -n "  Enter invite code (or press Enter to generate): "
    read -rs REGISTRATION_CODE
    echo ""

    if [[ -z "$REGISTRATION_CODE" ]]; then
      REGISTRATION_CODE=$(openssl rand -hex 8)
      print_success "Generated invite code"
    else
      print_success "Custom invite code set"
    fi
  fi
}

# Configure email (optional)
configure_email() {
  print_step "Magic Links (Optional)"

  echo ""
  echo "  Magic links allow email-based site protection."
  echo "  Requires Cloudflare Email Routing on your domain."
  echo ""
  echo -n "  Enable magic links? [y/N]: "
  read -r ENABLE_EMAIL

  if [[ "$ENABLE_EMAIL" =~ ^[Yy]$ ]]; then
    echo -n "  Sender email (e.g., access@yourdomain.com): "
    read -r EMAIL_FROM

    if [[ -n "$EMAIL_FROM" ]]; then
      print_success "Magic links enabled: ${EMAIL_FROM}"
    else
      EMAIL_FROM=""
      print_warning "Skipped - no email provided"
    fi
  else
    EMAIL_FROM=""
    print_info "Magic links disabled"
  fi
}

# Set secrets
set_secrets() {
  print_step "Setting Worker secrets"

  echo "$CF_ACCOUNT_ID" | npx wrangler secret put CF_ACCOUNT_ID --quiet 2>/dev/null
  print_success "CF_ACCOUNT_ID"

  echo "$CF_API_TOKEN" | npx wrangler secret put CF_API_TOKEN --quiet 2>/dev/null
  print_success "CF_API_TOKEN"

  if [[ -n "$REGISTRATION_CODE" ]]; then
    echo "$REGISTRATION_CODE" | npx wrangler secret put REGISTRATION_CODE --quiet 2>/dev/null
    print_success "REGISTRATION_CODE"
  fi

  if [[ -n "$EMAIL_FROM" ]]; then
    echo "$EMAIL_FROM" | npx wrangler secret put EMAIL_FROM --quiet 2>/dev/null
    print_success "EMAIL_FROM"
  fi
}

# Deploy worker
deploy_worker() {
  print_step "Deploying Worker"

  DEPLOY_OUTPUT=$(npx wrangler deploy 2>&1)

  # Extract worker URL from deployment output
  WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[a-zA-Z0-9.-]+\.workers\.dev' | head -1)

  if [[ -z "$WORKER_URL" ]]; then
    # Fallback: construct from account subdomain
    SUBDOMAIN=$(npx wrangler whoami 2>&1 | grep -oE '[a-z0-9-]+\.workers\.dev' | head -1 | cut -d'.' -f1)
    if [[ -n "$SUBDOMAIN" ]]; then
      WORKER_URL="https://bassh-api.${SUBDOMAIN}.workers.dev"
    fi
  fi

  if [[ -n "$WORKER_URL" ]]; then
    print_success "Deployed to ${WORKER_URL}"
  else
    print_success "Deployed (URL will be shown in Cloudflare dashboard)"
  fi
}

# Print summary
print_summary() {
  echo ""
  echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║${NC}              ${BOLD}Setup Complete!${NC}                              ${GREEN}║${NC}"
  echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
  echo ""

  if [[ -n "$WORKER_URL" ]]; then
    echo -e "  ${BOLD}Worker URL:${NC}"
    echo -e "    ${CYAN}${WORKER_URL}${NC}"
    echo ""
  fi

  if [[ -n "$REGISTRATION_CODE" ]]; then
    # Extract subdomain for invite code
    if [[ -n "$WORKER_URL" ]]; then
      SUBDOMAIN=$(echo "$WORKER_URL" | sed 's|https://bassh-api\.||' | sed 's|\.workers\.dev||')
    fi

    echo -e "  ${BOLD}Invite Code:${NC}"
    echo -e "    ${CYAN}${SUBDOMAIN}:${REGISTRATION_CODE}${NC}"
    echo ""
    echo -e "  ${BOLD}Share with your users:${NC}"
    echo ""
    echo -e "    # Install bassh"
    echo -e "    curl -fsSL https://raw.githubusercontent.com/get-bassh/bassh-site/main/install.sh | bash"
    echo ""
    echo -e "    # Register"
    echo -e "    bassh register ${CYAN}<username>${NC} --invite ${CYAN}${SUBDOMAIN}:${REGISTRATION_CODE}${NC}"
  else
    echo -e "  ${BOLD}Open Registration Mode${NC}"
    echo ""
    echo -e "  Share with your users:"
    echo ""
    echo -e "    # Install bassh"
    echo -e "    curl -fsSL https://raw.githubusercontent.com/get-bassh/bassh-site/main/install.sh | bash"
    echo ""
    echo -e "    # Set API endpoint"
    echo -e "    export BASSH_API=${WORKER_URL}"
    echo ""
    echo -e "    # Register"
    echo -e "    bassh register ${CYAN}<username>${NC}"
  fi

  echo ""
  echo -e "  ${BOLD}Next steps:${NC}"
  echo "    • Test deployment: bassh ./test-folder"
  echo "    • Generate invite codes: curl -X POST ${WORKER_URL}/admin/invite"
  echo "    • View docs: https://bassh.io/docs"
  echo ""
}

# Main
main() {
  print_header
  check_dependencies
  authenticate_cloudflare
  get_account_id
  create_kv_namespaces
  generate_wrangler_toml
  get_api_token
  configure_registration
  configure_email
  set_secrets
  deploy_worker
  print_summary
}

main "$@"
