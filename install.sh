#!/bin/bash
# DSH × Univer plugin one-click installer (macOS / Linux)
# Usage (from a source checkout or release zip): bash install.sh
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.dsh/profiles/node_modules/@univer-cli/dsh-univer-plugin"
PATCH="$HOME/.dsh/profiles/web/cordis.patch.yml"

echo "📦 Installing DSH × Univer plugin..."

# 1. Assemble the plugin package from source (lib/, manifest, docs, bundle layer).
#    dist/ is a generated directory and is not shipped in git — never rely on it.
mkdir -p "$DEST/lib"
rm -rf "$DEST/lib"
cp -R "$DIR/lib/." "$DEST/lib/"
cp "$DIR/package.json" "$DIR/cordis.patch.yml" "$DEST/"
for doc in "$DIR"/README*.md; do
  [ -f "$doc" ] && cp "$doc" "$DEST/"
done
echo "   ✅ Plugin files installed"

# 2. Write the loader entry (idempotent; keeps cordis.patch.yml valid YAML)
if ! grep -q "name: '@univer-cli/dsh-univer-plugin'" "$PATCH" 2>/dev/null; then
  mkdir -p "$(dirname "$PATCH")"
  # Drop a lone empty-array template line ("[]") so appending the insert entry
  # below stays a valid top-level YAML array (the profile template ships as `[]`).
  if [ -f "$PATCH" ]; then
    if command -v perl >/dev/null 2>&1; then
      perl -pi -e 's/^\[\]\s*$//' "$PATCH"
    else
      grep -v '^\[\]$' "$PATCH" > "$PATCH.tmp" && mv "$PATCH.tmp" "$PATCH"
    fi
  fi
  printf '\n# DSH × Univer integration: CLI/daemon management + preview UI.\n- insert:\n    - id: univer\n      name: '"'"'@univer-cli/dsh-univer-plugin'"'"'\n' >> "$PATCH"
  echo "   ✅ Loader entry written"
else
  echo "   ✅ Loader entry already present (no duplicate)"
fi

# 3. Detect the univer CLI
if command -v univer >/dev/null 2>&1; then
  VER="$(univer --version 2>/dev/null | head -1)"
  echo "   ✅ univer CLI found: $VER"
else
  echo "   ⚠️  univer CLI not found (needed for preview; install with: npm i -g univer-cli)"
fi

# 4. Detect the daemon
if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:8000/" 2>/dev/null; then
  echo "   ✅ univer daemon running"
else
  echo "   ℹ️  daemon not running (it auto-starts when you open a preview)"
fi

echo ""
echo "🎉 Installation complete!"
echo "👉 Refresh DeepSeek Harness (Cmd+R / Ctrl+R) to use the plugin."
echo "   Usage: run univer commands in a session; a preview card appears at the turn tail."
