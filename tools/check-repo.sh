#!/usr/bin/env bash
# Repo hygiene gate — run locally before commits; CI runs the same script.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
err() { echo "FAIL: $1"; fail=1; }

# Required governance files
for f in LICENSE NOTICE README.md CONTRIBUTING.md CLAUDE.md SECURITY.md \
         docs/ANALYSE-UND-PLAN.md docs/ANFORDERUNGEN-COMMUNITY.md \
         adr/0000-template.md; do
  [ -f "$f" ] || err "missing required file: $f"
done

# License must be AGPL-3.0
grep -q "GNU AFFERO GENERAL PUBLIC LICENSE" LICENSE || err "LICENSE is not AGPL-3.0"

# Clean-room policy and DCO must be anchored
grep -qi "clean-room" CONTRIBUTING.md || err "CONTRIBUTING.md lacks clean-room policy"
grep -q "Signed-off-by" CONTRIBUTING.md || err "CONTRIBUTING.md lacks DCO sign-off rule"

# Forbidden: EDOMI as part of product/package identifiers or file names.
# (Descriptive mentions in prose/docs are fine; file or dir names are not.
#  Exempt: node_modules (third-party), research/ und _ingest/ (lokal,
#  gitignored — enthalten Referenzsystem-Daten und duerfen so heissen).)
if find . \( -path ./.git -o -name node_modules -o -path ./research -o -path ./_ingest \) -prune -o -iname "*edomi*" -print | grep -q .; then
  err "found file/dir with 'edomi' in its name (naming rule violation)"
fi

# UTF-8 sanity: no stray replacement characters in tracked text files
if grep -rIl $'\xEF\xBF\xBD' --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=_ingest --exclude-dir=research . 2>/dev/null | grep -q .; then
  err "found UTF-8 replacement characters (broken encoding)"
fi

if [ "$fail" -eq 0 ]; then
  echo "OK: repo hygiene checks passed"
else
  exit 1
fi
