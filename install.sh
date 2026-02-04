#!/bin/bash
# FORGE Installation Script
# Usage: curl -fsSL https://raw.githubusercontent.com/forge-lang/forge/main/install.sh | bash

set -e

REPO="forge-lang/forge"
INSTALL_DIR="${FORGE_INSTALL_DIR:-/usr/local/bin}"

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
    x86_64)  ARCH="amd64" ;;
    aarch64) ARCH="arm64" ;;
    arm64)   ARCH="arm64" ;;
    *)
        echo "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

case "$OS" in
    linux|darwin) ;;
    mingw*|msys*|cygwin*)
        echo "For Windows, download from: https://github.com/$REPO/releases"
        exit 1
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

# Get latest version
echo "Fetching latest FORGE version..."
VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "$VERSION" ]; then
    echo "Failed to get latest version"
    exit 1
fi

echo "Installing FORGE $VERSION for $OS/$ARCH..."

# Download
ARCHIVE="forge-${VERSION}-${OS}-${ARCH}.tar.gz"
URL="https://github.com/$REPO/releases/download/${VERSION}/${ARCHIVE}"

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "Downloading $URL..."
curl -fsSL "$URL" -o "$TMPDIR/$ARCHIVE"

# Extract
echo "Extracting..."
tar -xzf "$TMPDIR/$ARCHIVE" -C "$TMPDIR"

# Install
echo "Installing to $INSTALL_DIR..."
if [ -w "$INSTALL_DIR" ]; then
    mv "$TMPDIR/forge" "$INSTALL_DIR/"
else
    sudo mv "$TMPDIR/forge" "$INSTALL_DIR/"
fi

chmod +x "$INSTALL_DIR/forge"

# Verify
echo ""
echo "FORGE installed successfully!"
echo ""
"$INSTALL_DIR/forge" version
echo ""
echo "Run 'forge help' to get started."
