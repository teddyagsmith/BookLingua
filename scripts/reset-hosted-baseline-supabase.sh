#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
work_root="$repo_root/.local-supabase-hosted-baseline"
work_supabase="$work_root/supabase"

node "$repo_root/scripts/verify-migration-contract.mjs"
mkdir -p "$work_supabase/migrations"
cp "$repo_root/supabase/config.toml" "$work_supabase/config.toml"
cp "$repo_root/supabase/bootstrap/00000000000000_disposable_baseline.sql" "$work_supabase/migrations/00000000000000_hosted_catalog_baseline.sql"

sequence=0001
while IFS= read -r migration; do
  [[ -z "$migration" || "$migration" == \#* ]] && continue
  printf -v target '9000000000%04d_%s' "$sequence" "$(basename "$migration")"
  cp "$repo_root/$migration" "$work_supabase/migrations/$target"
  sequence=$((sequence + 1))
done < "$repo_root/supabase/deployment/production_incremental_manifest.txt"

supabase db reset --workdir "$work_root"
