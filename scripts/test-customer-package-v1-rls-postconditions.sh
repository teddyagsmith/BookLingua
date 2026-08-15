#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <postgres-connection-url>" >&2
  exit 2
fi

repo_root=$(cd "$(dirname "$0")/.." && pwd)
connection_url=$1
postconditions="$repo_root/supabase/deployment/production_customer_package_v1_postconditions.sql"

# SELECT grants plus RLS and no customer policy must be safe.
psql "$connection_url" --set ON_ERROR_STOP=1 --command="grant select on public.pipeline_cutovers to anon, authenticated, service_role" >/dev/null
psql "$connection_url" --set ON_ERROR_STOP=1 --single-transaction --file "$postconditions" >/dev/null

# A permissive anonymous SELECT policy must fail the exact production postcondition.
if psql "$connection_url" --set ON_ERROR_STOP=1 --single-transaction \
  --command="create policy customer_package_v1_unsafe_anon on public.pipeline_cutovers for select to anon using (true)" \
  --file "$postconditions" >/dev/null 2>&1; then
  echo "Unsafe anonymous policy was not detected" >&2
  exit 1
fi

# Disabling RLS while SELECT remains granted must also fail.
if psql "$connection_url" --set ON_ERROR_STOP=1 --single-transaction \
  --command="alter table public.pipeline_cutovers disable row level security" \
  --file "$postconditions" >/dev/null 2>&1; then
  echo "Disabled RLS was not detected" >&2
  exit 1
fi

echo "Customer Package V1 RLS postconditions: safe grant/RLS case PASS; permissive policy FAIL; disabled RLS FAIL"
