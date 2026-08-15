#!/usr/bin/env bash
# Build the release artifacts from source.
#
# dist/ and the archives are GENERATED — never commit them, and never edit
# files under dist/ by hand. Source lives in lib/, package.json, README*.md,
# cordis.patch.yml, install.sh, and packaging/. After changing source files,
# re-run this script and publish the artifacts (npm publish / GitHub Release).
#
#   npm publish              # the package (lib/, scripts/, README*, cordis.patch.yml)
#   univer-dsh-plugin.zip    # end-user zip: package + install.command + INSTALL*.txt
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
DIST="$ROOT/dist"
PKG_DIR="$DIST/univer"

# 1. Package contents (dist/univer/): everything the plugin ships at runtime.
rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR/lib"
cp -R "$ROOT/lib/." "$PKG_DIR/lib/"
cp "$ROOT/package.json" "$ROOT/README.md" "$ROOT/README.zh-CN.md" "$ROOT/cordis.patch.yml" "$ROOT/LICENSE" "$PKG_DIR/"

# 2. npm tarball (univer-cli-dsh-univer-plugin-<version>.tgz) from the package manifest.
rm -f "$DIST"/univer-cli-dsh-univer-plugin-*.tgz
(cd "$ROOT" && npm pack --pack-destination "$DIST" >/dev/null)

# 3. End-user zip: package contents + double-click installer + install guide.
rm -f "$ROOT/univer-dsh-plugin.zip"
(cd "$DIST" && zip -Xrq "$ROOT/univer-dsh-plugin.zip" univer)
(cd "$ROOT/packaging" && zip -Xrq "$ROOT/univer-dsh-plugin.zip" install.command INSTALL.txt INSTALL.zh-CN.txt)

echo "✅ dist/ built:"
ls -la "$DIST"
echo "✅ zip: $ROOT/univer-dsh-plugin.zip"
