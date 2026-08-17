#!/bin/bash
# DSH × Univer plugin installer (macOS double-click version)
# Double-click this file → a terminal opens → installation runs automatically
cd "$(dirname "$0")"

DEST="$HOME/.dsh/profiles/node_modules/dsh-univer-office"
PATCH="$HOME/.dsh/profiles/web/cordis.patch.yml"

echo "==============================================="
echo "  DSH × Univer Plugin Installer"
echo "==============================================="
echo ""

# 1. Check DeepSeek Harness is installed
if [ ! -d "/Applications/DeepSeek Harness.app" ] && [ ! -d "$HOME/Applications/DeepSeek Harness.app" ]; then
  echo "❌ DeepSeek Harness not found"
  echo "   Please install DeepSeek Harness first, then run this installer."
  echo ""
  read -n 1 -s -r -p "Press any key to exit..."
  exit 1
fi

# 2. Copy the plugin
mkdir -p "$(dirname "$DEST")"
rm -rf "$DEST"
cp -R "$(dirname "$0")/univer" "$DEST"
echo "✅ Step 1/3: plugin files installed"

# 3. Write the loader entry (idempotent; keeps cordis.patch.yml valid YAML)
if ! grep -q "name: 'dsh-univer-office'" "$PATCH" 2>/dev/null; then
  mkdir -p "$(dirname "$PATCH")"
  # Drop a lone empty-array template line ("[]") so the appended entry below
  # stays a valid top-level YAML array (the profile template ships as `[]`).
  if [ -f "$PATCH" ]; then
    if command -v perl >/dev/null 2>&1; then
      perl -pi -e 's/^\[\]\s*$//' "$PATCH"
    else
      grep -v '^\[\]$' "$PATCH" > "$PATCH.tmp" && mv "$PATCH.tmp" "$PATCH"
    fi
  fi
  printf '\n# DSH × Univer integration: bundled Gateway, Viewer, and preview UI.\n- insert:\n    - id: univer\n      name: '"'"'dsh-univer-office'"'"'\n' >> "$PATCH"
  echo "✅ Step 2/3: loader entry written"
else
  echo "✅ Step 2/3: loader entry already present"
fi

# 4. The package contains the Gateway, Viewer, and Unit content artifacts.
echo "✅ Step 3/3: bundled Gateway, Viewer, and content tools ready"

echo ""
echo "==============================================="
echo "  🎉 Installation complete!"
echo ""
echo "  Next:"
echo "  1. Open DeepSeek Harness"
echo "  2. Press Cmd + R in the window (refresh the page)"
echo "  3. Ask the AI to use the univer_* tools — a preview card appears at the turn tail"
echo "==============================================="
echo ""
read -n 1 -s -r -p "Press any key to close this window..."
