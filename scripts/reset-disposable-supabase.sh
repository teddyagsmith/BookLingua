#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "$0")/.." && pwd)
work_root="$repo_root/.local-supabase-bootstrap"
work_supabase="$work_root/supabase"

node "$repo_root/scripts/verify-migration-contract.mjs"
rm -rf "$work_root"
mkdir -p "$work_supabase/migrations"
cp "$repo_root/supabase/config.toml" "$work_supabase/config.toml"
cp "$repo_root/supabase/bootstrap/00000000000000_disposable_baseline.sql" \
  "$work_supabase/migrations/00000000000000_disposable_baseline.sql"
cp "$repo_root/supabase/legacy-history/20250630_add_pipeline_version.sql" \
  "$work_supabase/migrations/202506300001_add_pipeline_version.sql"
cp "$repo_root/supabase/legacy-history/20250630_add_qa_blocked.sql" \
  "$work_supabase/migrations/202506300002_add_qa_blocked.sql"

for migration in "$repo_root"/supabase/migrations/*.sql; do
  name=$(basename "$migration")
  cp "$migration" "$work_supabase/migrations/$name"
done

# The bootstrap workdir is disposable and never linked to a hosted project.
supabase stop --workdir "$repo_root" --no-backup >/dev/null 2>&1 || true
supabase start --workdir "$work_root" -x vector,logflare
supabase db reset --workdir "$work_root"
echo "Disposable Supabase rebuilt entirely from committed repository assets."
