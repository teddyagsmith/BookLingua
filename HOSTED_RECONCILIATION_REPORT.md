# BookLingua Hosted Production Reconciliation

## Scope

Compared the seven read-only production catalog exports supplied on 2026-08-13 against all 11 active committed migrations at branch head `f263e1e6e237ab1eb6466b003a7728cdc812cbea`. No production changes or customer-content queries were performed.

## Confirmed hosted baseline

- Public tables: `orders`, `files`, `temp_uploads`, `translation_chunks`, `email_subscribers` only.
- `orders.languages` is JSONB as required.
- Hardening tables/functions/buckets do not yet exist.
- Extensions include `pgcrypto`, `uuid-ossp`, `plpgsql`, `pg_stat_statements`, `supabase_vault`.
- All exported public and Storage tables have RLS enabled.
- Current application policies are service-role predicates on `orders`, `files`, `temp_uploads`, and the private `uploads` bucket.
- Storage has one bucket: `uploads`, `public=false`.
- No standard `supabase_migrations.schema_migrations` ledger exists.

## Conflict analysis

### 1. BLOCKER — semantic cache pass constraint

Hosted production has:

```sql
translation_chunks_pass_check CHECK (pass = ANY (ARRAY['sonnet','opus']))
```

Migration `202608120004_pipeline_hardening_cache.sql` replaces the unique identity but does not drop or replace this check. Semantic-v2 writes `pass='semantic-pass1'` and `pass='semantic-pass2'`. Those inserts will fail.

Required remediation: add a production-safe migration step that drops `translation_chunks_pass_check` and replaces it with an explicit version-aware check supporting legacy `sonnet`/`opus` plus semantic `semantic-pass1`/`semantic-pass2`, then rehearse against a disposable database whose baseline includes the hosted constraint.

### 2. BLOCKER — missing `orders.qa_errors`

Hosted `orders` has no `qa_errors` column. `verify_wb1_prerequisites.sql` deliberately fails without it, but none of the 11 active migrations adds it. Legacy approval writes this field when QA blocks an order.

Required remediation: add `orders.qa_errors text` (nullable) through an explicit forward migration before deployment, and include it in hosted/staging prerequisite tests.

### 3. BLOCKER — no migration ledger; unsafe historical replay

Production has no `supabase_migrations.schema_migrations`. A normal `supabase db push` cannot distinguish already represented historical schema from unapplied files and may attempt every active migration.

This is unsafe because `20260401_email_subscribers.sql` creates policy `Service role full access` without a `TO service_role` clause and with `USING (true) WITH CHECK (true)`. PostgreSQL defaults the policy role to PUBLIC. The hosted policy export currently shows no such subscriber policy, so replay would create broad row access on `email_subscribers`.

Other historical active migrations would also create/seed objects not represented in the hosted export (`order_feedback`, `genre_glossaries`, `author_preferences`) without an approved rollout decision.

Required remediation: do not run normal `db push`. Establish an approved production baseline/repair record or a production-only incremental deployment manifest containing only reviewed forward migrations. Fix the historical subscriber policy definition before any mechanism can replay it. Never rewrite hosted history blindly.

### 4. NEEDS VERIFICATION — pgcrypto namespace

`pgcrypto` 1.3 is installed, but the export does not include `extnamespace`. `begin_hardened_delivery` calls `extensions.digest(...)`. Confirm:

```sql
select e.extname, n.nspname
from pg_extension e join pg_namespace n on n.oid=e.extnamespace
where e.extname='pgcrypto';
```

If the namespace is not `extensions`, qualify the function correctly or remove the schema assumption before migration.

## Non-conflicts verified

- Existing primary/foreign/unique indexes on `orders`, `files`, `temp_uploads`, and `translation_chunks` match expected legacy identities.
- `202608120004` explicitly drops the hosted legacy translation-chunk unique constraint/index before adding the versioned identity.
- New hardening table, constraint, index, RPC/function and trigger names do not collide with exported hosted objects.
- Existing `uploads` bucket and policy are not overwritten by the two new bucket-specific service-role policies.
- The new buckets are created private (`public=false`).
- Existing RLS policies on `orders`, `files`, `temp_uploads`, and `uploads` are not dropped by hardening migrations.
- `orders.languages` is JSONB and non-null.
- Required `pgcrypto` and UUID capabilities are installed, subject to namespace confirmation above.

## Exact ordered remediation

1. Add a forward prerequisite migration for nullable `orders.qa_errors`.
2. Update cache migration to replace `translation_chunks_pass_check` with an allowed set covering both pipeline versions.
3. Correct `20260401_email_subscribers.sql` to scope policy to `service_role`, and prevent this historical file from being replayed directly against production.
4. Choose and document a production migration-baseline strategy because no hosted ledger exists. Use a reviewed incremental manifest or explicitly repair/bootstrap the ledger from catalog evidence; never infer silently.
5. Query and archive the `pgcrypto` extension namespace.
6. Rebuild disposable staging from a baseline that exactly includes the hosted constraints/policies and rerun the full matrix.
7. Re-run this hosted reconciliation after the remediation commit.
8. Only after PASS, backup/PITR approval and independent review may the incremental hardening migrations proceed with all flags OFF.

## Final verdict

**HOSTED RECONCILIATION FAIL — do not migrate**

Exact reasons: incompatible `translation_chunks.pass` check constraint, missing required `orders.qa_errors`, and absence of a hosted migration ledger making historical replay unsafe—specifically including a PUBLIC `USING(true)` subscriber policy if `20260401` is replayed. The pgcrypto namespace must also be confirmed.
