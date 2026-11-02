#!/bin/bash

# Runs the format check, lint, typecheck, tests and build. CI runs this too, along
# with Super-linter, which is much slower and covers more.
#
# With --fix, it also fixes what it can, and updates the coverage badge.
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
