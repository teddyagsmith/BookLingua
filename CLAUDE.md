# BookLingua project guide

BookLingua is the production book-translation application at `https://booklingua.io`.
The stack is Next.js 14, TypeScript, Supabase, Inngest, Vercel, Stripe, Resend,
and Anthropic model calls. The canonical repository is
`https://github.com/teddyagsmith/BookLingua`.

## Before changing anything

1. Read this file and `AGENTS.md` if present.
2. Run `git status --short` and preserve every unrelated local change.
3. Inspect the relevant implementation and tests before editing.
4. Never print, copy, commit, or send `.env.local`, service-role keys, provider
   tokens, customer data, or credentials. Environment files are runtime-only.
5. Do not send customer/admin/reader emails, approve an order, charge a payment,
   or perform another external action unless Teddy explicitly says "send it" or
   "go ahead" for that exact action.

## Pipeline invariants

- Production artifacts are immutable and bound to order, language, and build ID.
- Every required artifact needs a SHA-256 hash and a passing stored validation
  report before the package manifest may pass.
- A translated title must have verified authority. Internal upload/project labels
  must never become customer-facing metadata.
- EPUB navigation and DOCX front-matter TOCs use the same consolidated translated
  heading source. Split chapter-title fragments become one heading/nav entry.
- EPUB metadata must contain the target locale, the book author (never the
  customer/prepared-for name), and a unique identifier per language edition.
- Chapter Maps must contain real rows matching the consolidated source headings.
- Customer-facing Launch Pack JSON must render successfully to DOCX before pass.
- Reader-panel verdicts are build-bound. Rebuilding a package invalidates the old
  reader verdict/request for approval purposes.
- Customer delivery stays locked until all current language builds, reader gates,
  and explicit human approval have passed.

## Validation and deployment

Run before committing:

```bash
npx tsc --noEmit
npm test
npm run build
```

Use focused commits. Do not stage unrelated dirty files. Production is Vercel
project `book-lingua`; deploy only from a clean worktree containing the intended
commit, then verify `https://booklingua.io/api/health`.

Supabase is the system of record for source files, semantic documents, immutable
artifacts, validation reports, package manifests, build state, reader requests,
and delivery state. Diagnose with read-only queries first. Never hand-edit a
passed artifact in place; create a new build generation and re-run every gate.

## Current working branch

Pipeline hardening work is on `booklingua/pipeline-hardening-v2`. Confirm the
branch and latest remote state before starting because another coding agent may
have changed it. Coordinate through small commits and avoid simultaneous edits
to the same files.
