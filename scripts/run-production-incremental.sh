#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <approved-postgres-connection-url>" >&2
  exit 2
fi

repo_root=$(cd "$(dirname "$0")/.." && pwd)
connection_url=$1
files=()
while IFS= read -r migration; do
  [[ -z "$migration" || "$migration" == \#* ]] && continue
  files+=(--file "$repo_root/$migration")
done < "$repo_root/supabase/deployment/production_incremental_manifest.txt"

# This script is intentionally not called by CI or deployment automation.
# Run manually only after backup/PITR approval and independent review.
psql "$connection_url" --set ON_ERROR_STOP=1 --single-transaction "${files[@]}"
