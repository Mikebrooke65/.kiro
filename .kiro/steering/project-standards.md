---
inclusion: auto
description: Core project standards, git/deployment workflow, and coding conventions for WCR Football App
---

# Project Standards and Conventions

This document defines the core standards, conventions, and critical information for the West Coast Rangers Football Coaching App project. It should be referenced for all development work.

## Session Start — READ FIRST (mandatory)

**At the start of every session, before answering "what's next" or touching any
code, READ `NEXT-SESSION-NOTES.md` (repo root) in full.** It is the single source
of truth for current V1 status, what is done, what is in progress, and the agreed
next task. Do **not** rely on memory of previous sessions — status changes between
sessions and memory goes stale.

Specifically, before proposing or starting work:
1. Read `NEXT-SESSION-NOTES.md` — check the "V1 — Where Things Stand" table and the
   "PLAN FOR NEXT SESSION" section.
2. State back to the user which item you believe is current, and confirm before
   diving in.
3. If anything you did changes status, update `NEXT-SESSION-NOTES.md` in the same
   session so the next one starts from the truth.

This rule exists because on 2026-08-19 the assistant answered from stale memory
(thought the project was still on V1.3 when V1.4 and V1.5 were already built and
deployed) instead of reading this doc first. Reading it first prevents that.

## Repository and Deployment

### Git Repository Configuration

**As of 2026-08-13**: This project uses **ONE** GitHub repository. The previous
two-repo setup (`.kiro` + `coaching-app-prototype`) was legacy clutter from
project setup, not a deliberate backup strategy — the two repos silently
drifted out of sync and caused repeated confusion. `coaching-app-prototype`
has been renamed to `football-app-old` and archived (read-only) on GitHub.
It is not used for anything going forward.

**Single repository**: `github.com/Mikebrooke65/WCR-Football-App`
- Connected to Netlify for production deployments
- Default branch: `prototype`
- **Primary URL: https://clubfootball.app** (live 2026-08-14)
- The old `https://wcrfootball.netlify.app` still resolves and is the
  Netlify build target, but `clubfootball.app` is the URL to use and share

### Git Remotes

Required remotes configuration:
```
kiro    https://github.com/Mikebrooke65/WCR-Football-App.git (only remote)
```

There is no `origin` remote on this project. If one reappears, remove it —
it should not exist.

### Deployment Commands

**Push to `kiro` only**:
```bash
git push kiro prototype
```

## Database Architecture

### Table Usage Standards

**Team Assignments**:
- Use `team_members` table (NOT `user_teams`)
- `team_members` is the source of truth for team roster
- `user_teams` only used by AuthContext for profile loading

**Games and Events**:
- Games ARE events with `event_type = 'game'`
- Query `events` table, not `games` table
- `games` table exists but is not used for game data
- `game_feedback` references `events.id` via `game_id` field

### Display Formats

**Team Names**:
- ALWAYS display as: "Age Group + Team Name" — this is the unique identifier
- Example: "U9 Lithium" (NOT "Lithium", NOT "Lithium (U9)")
- Format: `{team.age_group} {team.name}`
- NEVER display `team.name` alone — always include `team.age_group` prefix
- Applies everywhere: dropdowns, cards, headings, event titles, feedback labels

**Game Events**:
- Home: "Your Team vs Opposition"
- Away: "Opposition vs Your Team"

**Card/Section Shading**:
- Use 20% opacity of the page's brand colour for card backgrounds and section headers
- Apply via inline style: `style={{ backgroundColor: 'rgba(r, g, b, 0.2)' }}`
- Do NOT use Tailwind `bg-opacity-20` with hex colours (unreliable)

### Typography Standards

**Font Families** (defined in theme.css):
- Headings (h1, h3): Inter (substitute for Aktiv Grotesk Corp)
- Subtitles (h2): Exo 2
- Body text, labels, buttons: Inter (default)
- Do NOT use inline `style={{ fontFamily: ... }}` — rely on theme.css defaults

**Typography Hierarchy**:
- Page heading (h1): `text-2xl font-bold text-gray-900`
- Section heading (h2): `text-lg font-semibold text-gray-900`
- Card/component heading (h3): `text-sm font-semibold text-gray-900`
- Body text: `text-sm text-gray-600`
- Labels: `text-sm font-medium text-gray-700`
- Metadata/helper text: `text-xs text-gray-500`
- Buttons: `text-sm font-medium`

**Rules**:
- Use standard Tailwind text size classes (text-xs, text-sm, text-base, text-lg, text-xl, text-2xl)
- Avoid custom sizes like `text-[30px]` or `text-[9px]` unless absolutely necessary
- Never override font-family with inline styles — theme.css handles this
- Use font-bold (700) for page headings, font-semibold (600) for section headings, font-medium (500) for labels/buttons

## Club-Agnostic Rule (NEW BUILD ONLY) — added 2026-08-14

**All new code must be club-agnostic.** This app started as a
West Coast Rangers-specific build, and the possibility of other clubs
adopting it only entered the picture recently.

**Club-agnostic does NOT mean generic-looking.** The WCR result should
look exactly as it does today. The difference is that WCR's name, logo and
colour come from a defined source rather than being baked into components,
so another club can be delivered by changing data, not code.

**The rule:**
- **New build**: no hardcoded club name, colours, logo, domain, or URLs.
- **At every step, explicitly state where each piece of club branding
  (name / text / colour / logo) comes from.** Don't hardcode, and don't
  silently invent a new mechanism — use the shared source.
- **Where branding comes from**:
  - **Client/UI**: a `club_settings` table via a `useClubBranding()` hook
    (planned — see `NEXT-SESSION-NOTES.md` V1.B). Until that exists, ask
    rather than hardcoding.
  - **Edge Functions**: environment variables with generic fallbacks
    (`CLUB_NAME`, `CLUB_COLOR`, `APP_URL`, `EMAIL_FROM`,
    `EMAIL_REPLY_TO`). A DB round-trip per invocation isn't worth the
    latency. The small duplication with the table is accepted
    deliberately.
- **Existing hardcoded code**: leave it alone. It works. Retrofitting is
  a V3 concern, not something to fix opportunistically. Note that many
  WCR references live in `src/app/**`, which is dead/unused code — see
  `docs/deployment/DEPLOYMENT.md`.

**Why the App ID is generic**: `com.clubfootball.app` was chosen
deliberately (not `nz.wcr.app`) so the store listing doesn't lock the app
to one club. App IDs can't be changed after publishing without relisting.

**What IS club branding vs what is product design** (resolved 2026-08-14):

| Club branding — configurable | Product design — fixed for every club |
|------------------------------|---------------------------------------|
| Club name ("West Coast Rangers FC") | The six page colours below (Coaching green, Games orange, Resources purple, Schedule cyan, Messaging grey) |
| Club short name ("WCRF") | Typography, layout, iconography |
| App title — **"Urrah" is configurable**, it's a club-specific term, not a product name | The six-button mobile nav pattern |
| App subtitle | |
| Logo | |
| **Primary/header colour only** (`#0091f3`) | |
| App URL | |

The page colours are **semantic product design** — they tell the user which
area of the app they're in. They are not club identity and must not be
made configurable. Only the primary/header colour is club branding.

**Reference implementation**: `supabase/functions/send-email/index.ts`
takes club name, colour, app URL, from-address and reply-to entirely from
env vars, with generic defaults. Follow that pattern. Its client wrapper
`src/lib/email-api.ts` deliberately passes **no** branding from the
browser — only data — so branding has exactly one source.

**Related**: full multi-club support (a `clubs` table above `teams`,
per-club theming) is a V2/V3 backlog item — see `NEXT-SESSION-NOTES.md`.
The rule above is about not making that future work *harder*, not about
building it now.

## Code Conventions

### File Organization

**Migrations**:
- Location: `supabase/migrations/`
- Naming: `XXX_description.sql` (e.g., `024_add_scores_to_events.sql`)
- Must be run manually in Supabase SQL Editor
- Always commit migration files to git

**API Services**:
- Location: `src/lib/`
- Naming: `{feature}-api.ts` (e.g., `games-api.ts`, `events-api.ts`)
- Extend `ApiClient` base class

**Types**:
- Location: `src/types/database.ts`
- Keep in sync with database schema
- Export interfaces for all database tables

### Component Standards

**Brand Colours**:
- Primary Blue (Header, Home): `#0091f3`
- Orange (Games): `#ea7800`
- Dark Grey (Messaging): `#545859`
- Green (Coaching): `#22c55e`
- Purple (Resources): `#8b5cf6`
- Cyan/Teal (Schedule): `#06b6d4`

**Page Colour Assignments** (used for nav buttons, border accents, card shading):
| Page | Colour | Hex | RGBA for 20% shading |
|------|--------|-----|---------------------|
| Home | Blue | `#0091f3` | `rgba(0, 145, 243, 0.2)` |
| Coaching | Green | `#22c55e` | `rgba(34, 197, 94, 0.2)` |
| Games | Orange | `#ea7800` | `rgba(234, 120, 0, 0.2)` |
| Resources | Purple | `#8b5cf6` | `rgba(139, 92, 246, 0.2)` |
| Schedule | Cyan | `#06b6d4` | `rgba(6, 182, 212, 0.2)` |
| Messaging | Grey | `#545859` | `rgba(84, 88, 89, 0.2)` |

**Fonts**:
- Headings (app title, page headers): `Inter` / `Aktiv Grotesk Corp` (bold)
- Body text, labels, content: `Exo 2`
- Fallback: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`

**Mobile Pages**:
- Location: `src/pages/`
- Include bottom padding: `pb-20` for navigation clearance

**Desktop Pages**:
- Location: `src/pages/desktop/`
- Follow split-panel or table-based layouts
- Use consistent heading styles with colored borders

## Documentation Standards

### Required Updates

After ANY code changes, update:
1. `CHANGELOG.md` - User-facing changes
2. `CONVERSATION-HISTORY.md` - Technical decisions and journey
3. This file (if standards change)

### Changelog Format

```markdown
## [YYYY-MM-DD] - Feature Name

### Added
- New features

### Changed
- Modified features

### Fixed
- Bug fixes

### Technical Notes
- Implementation details
```

### Conversation History Format

```markdown
## Session: Date - Title

### Context
- Background information

### The Journey
- Problems encountered
- Solutions implemented

### Tasks Completed
- Numbered list of completed work

### Files Created/Modified
- List of changed files

### Technical Decisions
- Architecture choices
- Rationale
```

## Development Workflow

### Standard Development Process

1. **Make changes** in local dev environment
2. **Test locally**: `npm run dev`
3. **Run migrations** in Supabase (if any)
4. **Update documentation**: CHANGELOG.md, CONVERSATION-HISTORY.md
5. **Commit**: `git add -A && git commit -m "message"`
6. **Push**: `git push kiro prototype`
7. **Verify deployment** in Netlify dashboard

### Pre-Commit Checklist

- [ ] Code tested locally
- [ ] No console errors
- [ ] Database migrations run (if any)
- [ ] CHANGELOG.md updated
- [ ] CONVERSATION-HISTORY.md updated (for major changes)
- [ ] Committed with descriptive message
- [ ] Pushed to `kiro` remote

## Common Pitfalls

### ❌ Wrong: Using user_teams for Team Queries
```typescript
.from('user_teams').select('*')
```

### ✅ Correct: Use team_members
```typescript
.from('team_members').select('team:teams(*)')
```

### ❌ Wrong: Querying games Table
```typescript
.from('games').select('*')
```

### ✅ Correct: Query events Table
```typescript
.from('events').select('*').eq('event_type', 'game')
```

### ❌ Wrong: Team Display Format
```typescript
`${team.name} (${team.age_group})`  // "Lithium (U9)"
```

### ✅ Correct: Team Display Format
```typescript
`${team.age_group} ${team.name}`  // "U9 Lithium"
```

## Key Technical Decisions

### Architecture Principles

1. **Events as Source of Truth**: All scheduled items (games, training, meetings) are events
2. **Games are Events**: Games are events with `event_type='game'` plus extra fields
3. **Single Team Table**: `team_members` is the authoritative source for team rosters
4. **Feedback Persistence**: One feedback record per team/player per game (update, don't duplicate)

### Database Design

- **RLS Policies**: All tables have Row Level Security enabled
- **Soft Deletes**: Use `deleted_at` timestamp, don't hard delete
- **Audit Fields**: Include `created_by`, `updated_by`, `created_at`, `updated_at`
- **Foreign Keys**: Use `ON DELETE CASCADE` for dependent data

## Environment Configuration

### Supabase
- Project: pikrxkxpizdezazlwxhb
- URL: Stored in `.env.development` and `.env.production`
- Keys: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY

### Netlify
- Site: wcrfootball
- Primary URL: https://clubfootball.app (`www.clubfootball.app` 301s to it)
- Netlify URL: https://wcrfootball.netlify.app (still works)
- Build: `npm run build`
- Publish: `dist/`

### Email (Resend)
- Provider: **Resend**, on a **separate account** from the Riverhead
  Community project (free plan allows one domain per team, and a second
  team is a paid feature)
- Sending domain: `send.clubfootball.app` (subdomain deliberately, so
  deliverability problems can't damage the root domain the app is served
  from), region `ap-northeast-1`
- From: `West Coast Rangers <noreply@send.clubfootball.app>`
- **Send-only** — no mailbox, "Enable Receiving" off in Resend
- Edge Function: `supabase/functions/send-email`
- Client wrapper: `src/lib/email-api.ts` — sends data only, never branding
- `EMAIL_REPLY_TO` is **not set**, so replies bounce (open decision)

### Secrets — how to hand them over
**Never paste a secret into chat.** Save it to a plain text file
**outside the repo** (e.g. `C:\Users\miker\<name>.txt`), say it's there,
and it gets piped into `supabase secrets set` and the file deleted. A key
pasted into a transcript must be treated as compromised and rotated.

Scope keys to the minimum permission the job needs (the Resend key is
Sending access only, not Full access).

### Domain (Cloudflare)
- `clubfootball.app` — registered at Cloudflare Registrar, DNS on Cloudflare
- Apex: CNAME → `apex-loadbalancer.netlify.com`, **proxy OFF (DNS only)**
- `www`: CNAME → `wcrfootball.netlify.app`, **proxy OFF (DNS only)**
- **Never turn the orange cloud on** without also setting SSL mode to
  Full (strict) — the default "Flexible" mode causes a redirect loop and
  blocks Netlify from renewing its certificate
- `.app` is HSTS-preloaded: browsers refuse plain HTTP with no override,
  so a certificate problem presents as a hard failure, not a warning

## Support Resources

- **Current Status / Next Steps**: See `NEXT-SESSION-NOTES.md` (root)
- **Changelog**: See `CHANGELOG.md` (root)
- **Conversation History**: See `CONVERSATION-HISTORY.md` (root)
- **Deployment Guide**: See `docs/deployment/DEPLOYMENT-GUIDE.md`
- **Kiro Handover**: See `docs/project/KIRO_HANDOVER.md`
- **Bailey Lesson Progress**: See `docs/lessons/ACADEMY-MIGRATION-PROGRESS.md`
- **Lesson Creation Guide**: See `docs/lessons/LESSON-CREATION-GUIDE.md`

## Docs Folder Structure

```
docs/
  project/        ← planning, requirements, analysis docs
  deployment/     ← deployment, setup, troubleshooting
  lessons/        ← Bailey content, lesson guides, image prompts
    image-prompts/  ← U9 image prompt files
  archive/        ← old/superseded docs
```

## Secrets Backup

**IMPORTANT**: Environment/secret files are backed up to OneDrive:
- Location: `C:\Users\miker\OneDrive\Project Secrets\`
- Files: `WCR-Football.env.development`, `WCR-Football.env.production`

**If you change any .env file or add new secrets**, remind the user to update the backup copy:
```bash
Copy-Item ".env.development" "C:\Users\miker\OneDrive\Project Secrets\WCR-Football.env.development"
Copy-Item ".env.production" "C:\Users\miker\OneDrive\Project Secrets\WCR-Football.env.production"
```

## Version History

- **2026-08-13**: Added secrets backup documentation
- **2026-03-10**: Created project standards document
- **2026-03-10**: Documented dual repository setup and deployment workflow
- **2026-03-10**: Established database architecture standards
