#!/bin/bash
# DSH × Univer plugin source-checkout installer
# Usage (from a source checkout or release zip): bash install.sh
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/.dsh/profiles/node_modules/dsh-univer-office"
PATCH="$HOME/.dsh/profiles/web/cordis.patch.yml"

echo "📦 Installing DSH × Univer plugin..."

# 1. Assemble the plugin package from source (host/client code + bundled Univer artifacts).
#    dist/ is a generated directory and is not shipped in git — never rely on it.
mkdir -p "$DEST/lib"
rm -rf "$DEST/lib"
cp -R "$DIR/lib/." "$DEST/lib/"
mkdir -p "$DEST/vendor/collaboration"
cp -R "$DIR/vendor/collaboration/artifacts" "$DEST/vendor/collaboration/"
cp "$DIR/vendor/collaboration/README.md" "$DIR/vendor/collaboration/SOURCE.json" "$DEST/vendor/collaboration/"
mkdir -p "$DEST/vendor/unit-content"
cp -R "$DIR/vendor/unit-content/artifacts" "$DEST/vendor/unit-content/"
cp "$DIR/vendor/unit-content/README.md" "$DIR/vendor/unit-content/SOURCE.json" "$DEST/vendor/unit-content/"
if ! command -v node >/dev/null 2>&1 || [ ! -d "$DIR/node_modules/libsql" ]; then
  echo "   ❌ Source installer needs this checkout's dependencies. Run pnpm install first,"
  echo "      or use: dsh plugin --profile web add $DIR"
  exit 1
fi
node "$DIR/scripts/copy-gateway-dependencies.mjs" "$DEST"
cp "$DIR/package.json" "$DIR/cordis.patch.yml" "$DEST/"
for doc in "$DIR"/README*.md; do
  [ -f "$doc" ] && cp "$doc" "$DEST/"
done
echo "   ✅ Plugin files installed"

# 2. Write the loader entry (idempotent; keeps cordis.patch.yml valid YAML)
if ! grep -q "name: 'dsh-univer-office'" "$PATCH" 2>/dev/null; then
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
  printf '\n# DSH × Univer integration: bundled Gateway, Viewer, and preview UI.\n- insert:\n    - id: univer\n      name: '"'"'dsh-univer-office'"'"'\n' >> "$PATCH"
  echo "   ✅ Loader entry written"
else
  echo "   ✅ Loader entry already present (no duplicate)"
fi

# 3. Detect the Gateway. Unit content tools are package-local and need no CLI.
if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:9123/" 2>/dev/null \
  || curl -s -o /dev/null --max-time 2 "http://127.0.0.1:8000/" 2>/dev/null; then
  echo "   ✅ Univer Gateway running"
else
  echo "   ℹ️  bundled Gateway not running (it auto-starts when you open a preview)"
fi

echo ""
echo "🎉 Installation complete!"
echo "👉 Refresh DeepSeek Harness (Cmd+R / Ctrl+R) to use the plugin."
echo "   Usage: ask the agent to use the univer_* tools; a preview card appears at the turn tail."
