---
inclusion: auto
---

# Project Standards and Conventions

This document defines the core standards, conventions, and critical information for the West Coast Rangers Football Coaching App project. It should be referenced for all development work.

## Repository and Deployment

### Git Repository Configuration

**CRITICAL**: This project uses TWO GitHub repositories:

1. **Primary (Netlify)**: `github.com/Mikebrooke65/.kiro`
   - Connected to Netlify for production deployments
   - Branch: `prototype`
   - URL: https://wcrfootball.netlify.app

2. **Backup**: `github.com/Mikebrooke65/coaching-app-prototype`
   - Used for backup/alternative hosting
   - Not connected to Netlify

### Git Remotes

Required remotes configuration:
```
kiro    https://github.com/Mikebrooke65/.kiro.git (PRIMARY - for Netlify)
origin  https://github.com/Mikebrooke65/coaching-app-prototype.git (backup)
```

### Deployment Commands

**ALWAYS push to BOTH remotes**:
```bash
git push kiro prototype      # Required for Netlify deployment
git push origin prototype    # Backup
```

Or combined:
```bash
git push kiro prototype && git push origin prototype
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
6. **Push to BOTH remotes**: `git push kiro prototype && git push origin prototype`
7. **Verify deployment** in Netlify dashboard

### Pre-Commit Checklist

- [ ] Code tested locally
- [ ] No console errors
- [ ] Database migrations run (if any)
- [ ] CHANGELOG.md updated
- [ ] CONVERSATION-HISTORY.md updated (for major changes)
- [ ] Committed with descriptive message
- [ ] Pushed to BOTH remotes (kiro + origin)

## Common Pitfalls

### ❌ Wrong: Pushing to Wrong Remote
```bash
git push origin prototype  # Only pushes to backup, NOT Netlify
```

### ✅ Correct: Push to Both
```bash
git push kiro prototype && git push origin prototype
```

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
- URL: https://wcrfootball.netlify.app
- Build: `npm run build`
- Publish: `dist/`

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
