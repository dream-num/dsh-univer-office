#!/usr/bin/env bash
# Build the release artifacts from source.
#
# dist/ and the archives are GENERATED — never commit them, and never edit
# files under dist/ by hand. Hand-written source lives in src/; lib/ is built.
# Package metadata, docs, vendored artifacts, and installers are copied below.
# re-run this script and publish the artifacts (npm publish / GitHub Release).
#
#   npm publish              # the package (lib/, vendored artifacts, scripts/, docs, patch)
#   univer-dsh-plugin.zip    # end-user zip: package + install.command + INSTALL*.txt
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
DIST="$ROOT/dist"
PKG_DIR="$DIST/univer"

# 0. Generate Host, Client, and declaration artifacts from src/.
(cd "$ROOT" && pnpm run build)

# 1. Package contents (dist/univer/): everything the plugin ships.
rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR/lib"
cp -R "$ROOT/lib/." "$PKG_DIR/lib/"
mkdir -p "$PKG_DIR/src" "$PKG_DIR/docs"
cp -R "$ROOT/src/." "$PKG_DIR/src/"
cp -R "$ROOT/docs/." "$PKG_DIR/docs/"
mkdir -p "$PKG_DIR/vendor/collaboration"
cp -R "$ROOT/vendor/collaboration/artifacts" "$PKG_DIR/vendor/collaboration/"
cp "$ROOT/vendor/collaboration/README.md" "$ROOT/vendor/collaboration/SOURCE.json" "$PKG_DIR/vendor/collaboration/"
mkdir -p "$PKG_DIR/vendor/unit-content"
cp -R "$ROOT/vendor/unit-content/artifacts" "$PKG_DIR/vendor/unit-content/"
cp "$ROOT/vendor/unit-content/README.md" "$ROOT/vendor/unit-content/SOURCE.json" "$PKG_DIR/vendor/unit-content/"
node "$ROOT/scripts/copy-gateway-dependencies.mjs" "$PKG_DIR"
mkdir -p "$PKG_DIR/scripts"
cp "$ROOT/scripts/install.js" "$ROOT/scripts/copy-gateway-dependencies.mjs" "$PKG_DIR/scripts/"
cp "$ROOT/package.json" "$ROOT/README.md" "$ROOT/README.zh-CN.md" "$ROOT/cordis.patch.yml" "$ROOT/LICENSE" "$PKG_DIR/"

# 2. npm tarball (univer-office-<version>.tgz) from the package manifest.
rm -f "$DIST"/univer-office-*.tgz
(cd "$ROOT" && npm pack --pack-destination "$DIST" >/dev/null)

# 3. End-user zip: package contents + double-click installer + install guide.
rm -f "$ROOT/univer-dsh-plugin.zip"
(cd "$DIST" && zip -Xrq "$ROOT/univer-dsh-plugin.zip" univer)
(cd "$ROOT/packaging" && zip -Xrq "$ROOT/univer-dsh-plugin.zip" install.command INSTALL.txt INSTALL.zh-CN.txt)

echo "✅ dist/ built:"
ls -la "$DIST"
echo "✅ zip: $ROOT/univer-dsh-plugin.zip"
