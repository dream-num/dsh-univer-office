#!/usr/bin/env bash
# Generate one .univer sample with an installed univer-cli release.
# usage: generate.sh <cli-package-dir> <output.univer>
set -euo pipefail
cli=$1
out=$2
work=$(dirname "$out")
mkdir -p "$work"
export HOME="$work/home"
mkdir -p "$HOME"
entry="$cli/bin/univer.js"; [ -f "$entry" ] || entry="$cli/dist/bin.js"
u() { node "$entry" "$@"; }
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);console.log(eval("v."+process.argv[1]))})' "$1"; }

printf 'Name,Score\nAda,90\nLin,85\n' > "$work/scores.csv"
printf 'Item,Qty\nPen,3\n' > "$work/stock.csv"
rm -f "$out"

unit=$(u import --file "$work/scores.csv" "$out" --name Scores --json | json unitId)

merged=$(u worktree add "$out" --name merged --json | json worktreeId)
u execute "$out" --worktree "$merged" --unit "$unit" \
  -e 'workbook.getActiveSheet().getRange("C1").setValue({ v: "Note", t: 1 });' --json > /dev/null
u worktree ready "$out" --worktree "$merged" --json > /dev/null
u worktree merge "$out" --worktree "$merged" --json > /dev/null

draft=$(u worktree add "$out" --name draft --json | json worktreeId)
u execute "$out" --worktree "$draft" --unit "$unit" \
  -e 'workbook.getActiveSheet().getRange("B2").setValue({ v: 95, t: 2 });' --json > /dev/null
u import --file "$work/stock.csv" "$out" --worktree "$draft" --name Stock --json > /dev/null

u status "$out" --json || true
u daemon stop > /dev/null 2>&1 || true
echo "unit=$unit merged=$merged draft=$draft"
