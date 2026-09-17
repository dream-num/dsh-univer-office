#!/usr/bin/env bash
# Build the release artifacts from source.
#
# dist/ and the archives are GENERATED — never commit them, and never edit
# files under dist/ by hand. Hand-written source lives in src/; lib/ is built.
# Package metadata, docs, skills, and generated runtime artifacts are copied below.
# re-run this script and publish the artifacts (npm publish / GitHub Release).
#
#   npm publish              # the package (lib/, artifacts, skills, scripts, docs, patch)
#   univer-dsh-plugin.zip    # end-user zip: package (install via `dsh plugin add`)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
DIST="$ROOT/dist"
PKG_DIR="$DIST/univer"

# 0. Generate every application and declaration artifact from src/.
(cd "$ROOT" && pnpm run build)

# 1. Package contents (dist/univer/): everything the plugin ships.
rm -rf "$PKG_DIR"
mkdir -p "$PKG_DIR/lib"
cp -R "$ROOT/lib/." "$PKG_DIR/lib/"
mkdir -p "$PKG_DIR/docs" "$PKG_DIR/skills"
cp -R "$ROOT/docs/." "$PKG_DIR/docs/"
cp -R "$ROOT/skills/." "$PKG_DIR/skills/"
cp -R "$ROOT/artifacts" "$PKG_DIR/"
node "$ROOT/scripts/copy-gateway-dependencies.mjs" "$PKG_DIR"
mkdir -p "$PKG_DIR/scripts"
cp "$ROOT/scripts/copy-gateway-dependencies.mjs" "$PKG_DIR/scripts/"
cp "$ROOT/package.json" "$ROOT/README.md" "$ROOT/README.zh-CN.md" "$ROOT/cordis.patch.yml" "$ROOT/LICENSE" "$PKG_DIR/"
# The repository's dev lifecycle hooks cannot run from the staged copy (prepare
# rebuilds through scripts/ that is not shipped, and some npm versions execute
# prepare on pack even with --ignore-scripts); no consumer needs them from a
# registry install either — drop them from the manifest that gets published.
node -e '
const manifestPath = process.argv[1]
const manifest = JSON.parse(require("node:fs").readFileSync(manifestPath, "utf8"))
for (const hook of ["prepare", "prepublish", "prepublishOnly", "prepack", "postpack"]) {
  delete manifest.scripts?.[hook]
}
require("node:fs").writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n")
' "$PKG_DIR/package.json"
# The repository manifests never declare the native bindings (their wrappers own
# the versions); the published manifest installs them as direct dependencies
# with the versions resolved from the installed tree, because dsh consumers use
# pnpm and transitive dependencies are not resolvable from the plugin bundles.
node "$ROOT/scripts/inject-runtime-bindings.mjs" "$PKG_DIR/package.json"
# The staged manifest is what gets published; prove on the public registry that
# every runtime dependency it declares — the injected native bindings included —
# is resolvable, so a release can never ship an uninstallable manifest.
node "$ROOT/scripts/verify-public-runtime-dependencies.mjs" "$PKG_DIR/package.json"

# 2. npm tarball from the assembled package directory, so the published
#    manifest carries the injected native binding dependencies.
rm -f "$DIST"/dsh-univer-office-*.tgz
(cd "$PKG_DIR" && npm pack --pack-destination "$DIST" --ignore-scripts >/dev/null)

# 3. End-user zip: package contents (installed via `dsh plugin add`).
rm -f "$ROOT/univer-dsh-plugin.zip"
(cd "$DIST" && zip -Xrq "$ROOT/univer-dsh-plugin.zip" univer)
# End-user installs go through \`dsh plugin add\`; the zip carries the package only.

echo "✅ dist/ built:"
ls -la "$DIST"
echo "✅ zip: $ROOT/univer-dsh-plugin.zip"
