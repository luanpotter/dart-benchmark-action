#!/bin/bash

# Runs the format check, lint, typecheck and tests. This is much faster than
# Super-linter, which CI also runs, but it covers less.
#
# With --fix, it also fixes what it can, and rebuilds dist/ and the coverage
# badge. Use this before pushing any change to src/, as CI fails on a stale dist/.
#
# Usage:
#
# script/check.sh [--fix]

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

fix=false
case "${1:-}" in
'') ;;
--fix) fix=true ;;
*)
	echo "Usage: script/check.sh [--fix]" >&2
	exit 2
	;;
esac

# npm keeps this file in node_modules, updated on each install that changes it
installed=node_modules/.package-lock.json
if [ ! -e "$installed" ] || [ package.json -nt "$installed" ] || [ package-lock.json -nt "$installed" ]; then
	npm install --no-audit --no-fund
fi

if [ "$fix" = true ]; then
	npm run format:write
	npm run lint -- --fix
	npm run biome
	npm run typecheck
	npm run test
	npm run coverage
	npm run package
else
	npm run check
fi
