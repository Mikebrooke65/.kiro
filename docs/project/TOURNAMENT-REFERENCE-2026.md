# Tournament Learnings — Secondary Schools Football 2026
## Reference observations from Rex Dawkins Tournament

**Context:** On-site observation of a live secondary schools tournament (1 Sept 2026) running via Friendly Manager. Captured to inform Clubfootball.app v2 tournament feature design.

---

## Current Friendly Manager Implementation (Reference)

### 1. Summary View
**Shows:** Upcoming games list, chronologically ordered by time slot.

**Data displayed per fixture:**
- Team A name
- Team B name
- Venue location (e.g., "Huapai: Huapai Domain 1")
- Date + time
- All games in a time slot grouped together (e.g., six games at 10:15 AM)

**Observation:** Clean, scrollable list. Teams searching for their own fixture have to scan the full list.

---

### 2. Draws View
**Shows:** Fixtures with live scores, grouped by time slot.

**Card layout per game:**
- Team A logo + name | Score | Team B logo + name
- Venue location + domain (Domain 1, 2, 3, 4 — parallel pitches)
- Score shown in-place (numeric result or dashes if not yet played)
- Visual color coding: appears to use background color to indicate play status (played vs pending)

**Data displayed:**
- Multiple parallel games at same time, different domains
- Time slot as section header
- Both date groups visible (1 Sep @ 10:54 AM, 1 Sep @ 1:30 PM, 1 Sep @ 11:30 AM next section, etc.)

**Observation:** Domain/pitch information is prominent and clear. Score entry happens in-line (real-time visible).

---

### 3. Teams View
**Shows:** Personalized tournament itinerary for a selected team.

**Interaction:**
- Dropdown selector at top (all teams in tournament)
- User selects their team (e.g., Tauhara College)

**Data displayed per fixture:**
- Opponent name
- Date + time
- Venue + domain

**Status differentiation:**
- Completed games: white background (e.g., 31/08/2026 9:00 AM)
- Upcoming games: green highlight background (e.g., 01/09/2026 11:30 AM onwards)

**Observation:** Coaches/players can instantly see their full schedule in sequence and know what's played vs pending. Easy scanning — no need to search a global draw.

---

## 4. Placements Tab
**Exists in navigation** (visible but not screenshotted). Presumably shows standings/advancement as tournament progresses.

---

## Tournament Structure (from observations)

- **Multi-day** (fixtures spanning 31 Aug → 2 Sep at minimum)
- **Parallel games** (4+ domains running simultaneously)
- **Time slots** (games scheduled at regular intervals: 10:15 AM, 11:30 AM, 1:30 PM, 4:00 PM)
- **Group stage visible** — multiple round-robin fixtures per team before advancement
- **Multiple age groups/divisions** (secondary school tournament format suggests separate draws per year level)

---

## Key Design Patterns to Carry Forward

1. **Personalized view matters** — teams need to find their own fixtures without scanning the entire tournament
2. **Domain/pitch must be visible** — logistically critical for on-site coordination
3. **Status at a glance** — visual differentiation between played/pending is essential
4. **Live score entry** — results visible immediately on the draw, not batched/delayed
5. **Time-slot grouping** — clearer than simple chronological if many parallel games
6. **Team logos** — aid quick visual scanning for coaches/parents

---

## Open Questions for Clubfootball v2

- How should v1's current tournament feature be extended to match this structure?
- Score entry workflow: who enters results, and where (pitch-side app, or admin-only)?
- Notifications/alerts: should teams be notified of fixture changes, delays, advancement?
- Standings/advancement rules: how are placements calculated (goal difference, head-to-head, etc.)?
- Device/offline considerations: pitch-side connectivity assumptions?
- Multi-division management: how does the app handle simultaneous tournaments for different year levels?

---

*Captured: 01 Sep 2026, Rex Dawkins Tournament (Huapai)*
