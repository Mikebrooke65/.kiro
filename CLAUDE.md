# Working with this repo (WCR-Football-App / clubfootball.app)

This file exists so a fresh AI session (Cowork, Claude Code, or otherwise)
can pick up the operational conventions this project uses, without needing
to rediscover them from scratch or from prior chat history. It's about
*how* work happens here, not the status of any specific feature — for that,
see `.kiro/specs/<feature-name>/tasks.md`.

## The basics

- **Repo**: `Mikebrooke65/WCR-Football-App`, branch `prototype` (the live
  branch — pushes here go live at clubfootball.app).
- **Backend**: Supabase project ref `pikrxkxpizdezazlwxhb`. Dashboard:
  `https://supabase.com/dashboard/project/pikrxkxpizdezazlwxhb`.
- **Local dev machine**: the repo owner works from
  `C:\Users\miker\WCR-Football-App` on Windows, connected via the Cowork
  desktop-device bridge. An AI session without that bridge connected can
  still read/write code in its own sandbox, but can't reach the owner's
  files or run their local git/npm commands directly.
- **Stack**: Vite 6 + React 19 + TypeScript (no project-wide `tsconfig.json`
  or `typecheck` script — see Verification below), Supabase (Postgres +
  Edge Functions), Capacitor for the mobile app shell.

## How changes actually get shipped (Cowork sessions can't push directly)

A Cowork/cloud AI session has no direct write access to the owner's git
remote or their local machine's shell. The established flow is:

1. Do the work in a sandbox clone, verified there first.
2. Generate a patch: `git format-patch <base>..<head> -o /path`.
3. Deliver the `.patch` file to the user (SendUserFile) **and** write it to
   their `Downloads` folder via the device bridge, so they have it locally
   without needing to download anything.
4. Tell them the exact commands to run, one at a time:
   ```
   git am "C:\Users\miker\Downloads\<patch-file>.patch"
   git push
   ```
5. If `git am` fails with "does not match index" — the user's working tree
   already differs from what the patch expects as a base (this has
   happened when a doc was edited directly on disk out-of-band, see next
   section). Don't force it; `git am --abort`, regenerate the patch off the
   user's actual current state, or have them commit the on-disk content
   directly instead.

**Never** ask the user to run `git add -A` or `git commit --amend`, and
never skip hooks. Match this project's existing commit-message style
(explains *why*, not just *what*; multi-paragraph body is normal here).

## Verifying before delivering (non-negotiable — do this every time)

Before handing over any patch:

1. Clone the *real* current head fresh:
   `git clone --branch prototype --single-branch <repo-url> /tmp/realheadN`
2. Confirm your sandbox's pre-change commit is tree-identical to that real
   head: `git rev-parse <ref>^{tree}` on both sides, compare.
3. Apply your patch there with `git am`, then run
   `npm install && npm test && npm run build` and confirm it's clean.
4. Only then deliver. This has caught real problems more than once —
   don't skip it because "it worked in my sandbox."

There's no project-wide TypeScript type-check. For an extra check on a
changed `.tsx`/`.ts` file, a **scoped** `tsc` run works for most files:
write a throwaway `tsconfig.tmpcheck.json` (strict, `jsx: react-jsx`,
`moduleResolution: Bundler`, `types: ["vite/client"]`, `include` limited to
just the changed files), run `npx tsc -p tsconfig.tmpcheck.json`, delete
the scratch file after. Known gap: a `.tsx` file with a bare `JSX.Element`
type annotation fails this scoped check with `TS2503: Cannot find
namespace 'JSX'` under this project's React 19 type defs — that's a
pre-existing tooling limitation (confirmed by running the same check
against the unmodified file), not a real defect; review such files by eye
instead.

## Database migrations

Migrations live in `supabase/migrations/*.sql`, numbered sequentially.
**They are run via the Supabase SQL Editor**
(`https://supabase.com/dashboard/project/pikrxkxpizdezazlwxhb/sql/new`) —
copy the file's contents in and run — not `supabase db push`.

**Always hand over the SQL as a file the user can open and copy from**
(`SendUserFile`), in addition to showing it inline in chat — don't assume
pasting a large SQL block into a chat message is enough for the user to
work with. The user has explicitly asked for this pattern: give them
something to copy, not just something to read. The same applies to any
read-only diagnostic query you want them to run (e.g. checking what
policies currently exist on a table) — file it, don't just print it.

A "destructive operations" warning dialog is normal for `ALTER POLICY` /
`DROP POLICY` / `DROP TRIGGER` even when nothing is actually being
destroyed (e.g. a `DROP TRIGGER IF EXISTS` immediately followed by
`CREATE TRIGGER` to recreate it) — read what the statement actually does
before telling the user it's safe to confirm.

**Important, hard-won lesson**: migration files in this repo do not
reliably reflect the live database's actual state. At least one migration
(036) only partially applied live at some point in the past (there's a
"migration 036 recovery" commit in history), and this was only discovered
by accident while writing a later migration that assumed a policy existed
and got an "ALTER POLICY ... does not exist" error at the SQL Editor. If a
new migration assumes an existing policy/table/column, don't just trust
the migration file — have the user run a quick read-only check first
(`select policyname, cmd, roles from pg_policies where tablename = '...'`
or similar) before writing `ALTER`-style statements against it. A full
audit script for this exists in this conversation's history (parses every
`CREATE POLICY`/`DROP POLICY` across all migration files, cross-checks
against live `pg_policies`) — worth re-running periodically or after any
similar surprise, not just once.

Before writing an `ALTER POLICY`/`ALTER TABLE` against something, verify
its assumed current shape rather than assuming the migration file is
truth.

## Frontend deploys (clubfootball.app via Netlify)

Pushing to `prototype` on GitHub does **not** guarantee a new deploy goes
live — Netlify's git integration builds and publishes automatically, but
only while the team has deploy credits available. **If a pushed fix
doesn't seem to be live, don't assume it's a browser cache problem before
checking Netlify's dashboard** (Usage & billing, or the banner at the top
of the dashboard) for a "running on operational credits" /
"production deploys paused" warning. This happened for real 2026-08-27:
several same-day pushes (Task 11, Add Player/Success Screen copy fixes,
the Announcements crash fix) sat correctly on GitHub for hours with zero
effect on the live site, because the team's monthly Netlify credits had
run out. The site stayed up (already-published content keeps serving) but
nothing new could build.

**The tell, if it happens again**: open the browser's error/console output
and note the exact hashed JS filename (e.g. `index-s21xvn2d.js`). A real
new deploy always produces a new hash — if the *same* hash shows up after
a hard refresh, an incognito window, *and* a different device, the build
genuinely hasn't shipped; it's not caching. Compare that against Netlify's
Deploys tab for the site: no new deploy attempt for the latest commit is
the confirming signal.

**Fix is a billing action the repo owner has to take**, not something
fixable from a coding session: add credits, upgrade the team plan, or
wait for the next monthly cycle to reset (shown on the Usage & billing
page). Once credits are available again, deploys may need a manual
"Trigger deploy" the first time rather than assuming the backlog
auto-flushes.

## Edge Functions

`supabase/functions/<name>/index.ts`, Deno runtime. **Deploying is a
separate step from `git push`** — pushing code does not deploy it. After
any Edge Function change is pushed, tell the user to run, one at a time,
waiting for each to finish before starting the next:
```
npx supabase functions deploy <function-name>
```
`WARNING: Docker is not running` in the output is expected and harmless
locally deployed functions still upload fine without Docker running.

Verify a function's TypeScript before delivering: copy the function's
folder to an isolated directory outside `node_modules` (e.g.
`/tmp/deno-check/<name>/`) and run `deno check --allow-import index.ts`
there.

## The `.kiro/specs/<feature>/` convention

Each feature/spec gets `requirements.md` → `design.md` → `tasks.md`, in
that order, with `tasks.md` using `- [ ]`/`- [x]` checkboxes and detailed
completion notes (mechanism used, verification results, deployment steps
still outstanding) written inline as each task finishes — not just a
checkbox flip.

**Known inconsistency worth fixing going forward**: for at least the
`streamlined-invites-and-child-access` spec, `design.md` and `tasks.md`
were delivered directly to the user's disk via the device bridge but never
committed to git — only `requirements.md` ended up tracked. This caused a
real problem: a later patch's `requirements.md` hunk assumed the git-
tracked (stale) content as its base and conflicted with the actual,
already-corrected file on disk. **Recommendation for any new spec**: commit
`design.md` and `tasks.md` to git from the start, same as `requirements.md`
and everything else — there's no good reason to keep them out, and keeping
all three in git is what avoids this class of conflict entirely. If you're
touching an existing spec whose docs aren't yet tracked, check
`device_list_dir`'s mtime (or just diff) against your sandbox's copy before
overwriting anything — the on-disk version may already be ahead of git.

## Reasonable AI-driven audits worth doing proactively

If something surprising turns up while doing normal work (a policy that
"should" exist per a migration file but doesn't; a function referenced
but never called from the UI; an environment variable read but never
set) — investigate it fully rather than working around it silently, and
tell the user. Several real, pre-existing gaps in this project were only
found this way (see git log messages mentioning "never existed live" /
"never applied live" for examples of what these look like once found and
fixed).
