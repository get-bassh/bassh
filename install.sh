#!/bin/bash

# bassh installer
# Usage: curl -fsSL https://raw.githubusercontent.com/get-bassh/bassh/main/install.sh | bash

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

REPO="get-bassh/bassh"
SCRIPT_NAME="bassh"

echo -e "${BLUE}Installing bassh...${NC}"
echo ""

# Determine install location
if [[ -w /usr/local/bin ]]; then
  INSTALL_DIR="/usr/local/bin"
elif [[ -d "$HOME/.local/bin" ]]; then
  INSTALL_DIR="$HOME/.local/bin"
else
  mkdir -p "$HOME/.local/bin"
  INSTALL_DIR="$HOME/.local/bin"
fi

# Download the script
DOWNLOAD_URL="https://raw.githubusercontent.com/$REPO/main/$SCRIPT_NAME"

if command -v curl &> /dev/null; then
  curl -fsSL "$DOWNLOAD_URL" -o "$INSTALL_DIR/$SCRIPT_NAME"
elif command -v wget &> /dev/null; then
  wget -q "$DOWNLOAD_URL" -O "$INSTALL_DIR/$SCRIPT_NAME"
else
  echo -e "${RED}Error: curl or wget required${NC}"
  exit 1
fi

# Make executable
chmod +x "$INSTALL_DIR/$SCRIPT_NAME"

# Determine shell config file
if [[ -f "$HOME/.zshrc" ]]; then
  SHELL_RC="$HOME/.zshrc"
else
  SHELL_RC="$HOME/.bashrc"
fi

echo -e "${GREEN}✓ Installed to $INSTALL_DIR/$SCRIPT_NAME${NC}"
echo ""

# Skip interactive prompts in CI environments
if [[ -n "$CI" || -n "$GITHUB_ACTIONS" || ! -t 0 ]]; then
  echo -e "${BLUE}CI environment detected - skipping interactive setup${NC}"
  echo -e "${GREEN}✓ Installation complete!${NC}"
  echo ""
  echo -e "Set these environment variables to deploy:"
  echo -e "  ${CYAN}BASSH_API${NC} - Your worker URL"
  echo -e "  ${CYAN}BASSH_KEY${NC} - Your API key"
  exit 0
fi

# Interactive setup for local installs
# Check if BASSH_API is already set
if ! grep -q "BASSH_API" "$SHELL_RC" 2>/dev/null; then
  echo -e "${YELLOW}Enter your bassh worker URL${NC}"
  echo -e "${BLUE}(e.g., https://bassh-api.yourname.workers.dev)${NC}"
  echo ""
  echo -n "Worker URL: "
  read WORKER_URL < /dev/tty

  if [[ -n "$WORKER_URL" ]]; then
    echo "" >> "$SHELL_RC"
    echo "# bassh configuration" >> "$SHELL_RC"
    echo "export BASSH_API=\"$WORKER_URL\"" >> "$SHELL_RC"
    echo -e "${GREEN}✓ Added BASSH_API to $SHELL_RC${NC}"
  else
    echo -e "${YELLOW}Skipped. Set it later with:${NC}"
    echo "  export BASSH_API=https://your-worker.workers.dev"
  fi
else
  echo -e "${BLUE}BASSH_API already configured in $SHELL_RC${NC}"
fi

# Check if BASSH_KEY is already set
if ! grep -q "BASSH_KEY" "$SHELL_RC" 2>/dev/null; then
  echo ""
  echo -e "${YELLOW}Do you have an API key? (y/n)${NC}"
  echo -n "> "
  read HAS_KEY < /dev/tty

  if [[ "$HAS_KEY" == "y" || "$HAS_KEY" == "Y" ]]; then
    echo -e "${YELLOW}Enter your API key:${NC}"
    echo -n "API Key: "
    read API_KEY < /dev/tty

    if [[ -n "$API_KEY" ]]; then
      echo "export BASSH_KEY=\"$API_KEY\"" >> "$SHELL_RC"
      echo -e "${GREEN}✓ Added BASSH_KEY to $SHELL_RC${NC}"
    fi
  else
    echo ""
    echo -e "${CYAN}You can register for an API key after installation:${NC}"
    echo "  source $SHELL_RC"
    echo "  bassh register <your-username>"
  fi
else
  echo -e "${BLUE}BASSH_KEY already configured in $SHELL_RC${NC}"
fi

# Check if install dir is in PATH
if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
  echo "" >> "$SHELL_RC"
  echo "export PATH=\"$INSTALL_DIR:\$PATH\"" >> "$SHELL_RC"
  echo -e "${GREEN}✓ Added $INSTALL_DIR to PATH in $SHELL_RC${NC}"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Installation complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo -e "Run: ${BLUE}source $SHELL_RC${NC}"
echo ""
echo -e "Then register (if you haven't already):"
echo -e "  ${CYAN}bassh register <username>${NC}"
echo ""
echo -e "Or start deploying:"
echo -e "  ${CYAN}bassh ./my-folder${NC}"
echo ""
