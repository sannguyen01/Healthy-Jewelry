#!/usr/bin/env bash
# Exhaustively finds every occurrence of the wrong (single-L) domain, plus
# every literal occurrence of either spelling that bypasses the centralized
# config in src/config/site.ts.
#
# NOTE on portability: the original draft of this script used a single
# --include='*.{ts,tsx,js,...}' brace-list. Bash only expands `{a,b}` when
# unquoted; inside single quotes it's passed to grep literally, and grep's
# fnmatch-based glob matching does not reliably expand brace groups across
# platforms (confirmed broken on this repo's Windows/Git-Bash grep). Using
# one --include flag per extension avoids the ambiguity entirely.

set -euo pipefail

WRONG_DOMAIN='healthyjewelry\.com'
EITHER_SPELLING='healthyjewel(ry|lery)'

EXCLUDE_DIRS=(node_modules .next .git)
exclude_args=()
for d in "${EXCLUDE_DIRS[@]}"; do
  exclude_args+=(--exclude-dir="$d")
done

INCLUDE_EXTS=(ts tsx js jsx md json txt yml yaml)
include_args=()
for ext in "${INCLUDE_EXTS[@]}"; do
  include_args+=(--include="*.$ext")
done

echo "== 1. Every literal occurrence of the wrong (single-L) domain =="
echo "   (the only expected hit is the guard clause in src/config/site.ts)"
grep -rn -E "$WRONG_DOMAIN" "${include_args[@]}" "${exclude_args[@]}" . || echo "(none found)"

echo ""
echo "== 2. Every literal occurrence of either spelling =="
echo "   (should only appear inside src/config/site.ts — everywhere else"
echo "   must import SITE_URL / CONTACT_EMAIL / SOCIAL_LINKS / etc.)"
grep -rln -i -E "$EITHER_SPELLING" "${include_args[@]}" "${exclude_args[@]}" . || echo "(none found)"
