#!/bin/bash
set -euo pipefail

REPO="anthod0/better-skills"
INSTALL_DIR="${BETTER_SKILLS_INSTALL_DIR:-$HOME/.local/bin}"
BINARY_NAME="bsk"

# Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  linux)  OS="linux" ;;
  darwin) OS="darwin" ;;
  *)
    echo "Error: Unsupported OS: $OS"
    echo "Please use 'npm i -g better-skills' instead."
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64|amd64)  ARCH="x64" ;;
  aarch64|arm64)  ARCH="arm64" ;;
  *)
    echo "Error: Unsupported architecture: $ARCH"
    echo "Please use 'npm i -g better-skills' instead."
    exit 1
    ;;
esac

ASSET_NAME="${BINARY_NAME}-${OS}-${ARCH}"

# Get latest version from GitHub API
echo "Fetching latest version..."
VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep '"tag_name"' | cut -d'"' -f4)

if [ -z "$VERSION" ]; then
  echo "Error: Failed to fetch latest version."
  exit 1
fi

echo "Installing ${BINARY_NAME} ${VERSION} (${OS}-${ARCH})..."

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${ASSET_NAME}"

# Create install directory
mkdir -p "$INSTALL_DIR"

# Download binary
curl -fsSL "$DOWNLOAD_URL" -o "${INSTALL_DIR}/${BINARY_NAME}"
chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

echo ""
echo "Installed ${BINARY_NAME} to ${INSTALL_DIR}/${BINARY_NAME}"

# Check if install dir is in PATH
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
  echo ""
  echo "Add the following to your shell profile to use ${BINARY_NAME}:"
  echo ""

  SHELL_NAME=$(basename "$SHELL")
  case "$SHELL_NAME" in
    zsh)  RC_FILE="~/.zshrc" ;;
    bash) RC_FILE="~/.bashrc" ;;
    fish)
      echo "  set -Ux fish_user_paths ${INSTALL_DIR} \$fish_user_paths"
      echo ""
      echo "Then restart your shell or run: source ~/.config/fish/config.fish"
      exit 0
      ;;
    *)    RC_FILE="~/.profile" ;;
  esac

  echo "  echo 'export PATH=\"${INSTALL_DIR}:\$PATH\"' >> ${RC_FILE}"
  echo ""
  echo "Then restart your shell or run: source ${RC_FILE}"
else
  echo ""
  "${INSTALL_DIR}/${BINARY_NAME}" --version && echo "Installation complete!"
fi
