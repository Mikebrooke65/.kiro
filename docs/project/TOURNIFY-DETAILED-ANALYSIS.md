# Tournify Detailed Analysis & Feature Breakdown

## Overview
Comprehensive analysis of Tournify's features, workflows, and implementation details based on official documentation and help center resources.

**Source**: [Tournify Help Center](https://help.tournifyapp.com/) and [Tournify Website](https://www.tournifyapp.com/)

---

## Core Workflow: How Tournify Works

### 1. Tournament Setup (General Page)
- **Tournament Name & Details**: Basic info, description
- **Divisions**: Separate by age group, gender, or skill level (each division has own teams and format)
- **Locations**: Multiple venues supported
- **Match Days**: Set specific dates for fixtures
- **Scoring Rules**: Customize points for win/draw/loss
- **Tiebreaker Settings**: Goal difference, head-to-head, etc.

### 2. Format Configuration (Format Page)

#### Three Building Blocks:

**A. Groups (Round Robin)**
- Every team plays every other team once (single round robin) or twice (double round robin)
- Also called "league" or "competition" model
- Standings auto-update based on match results
- Customizable scoring: points for win/draw/loss
- Tiebreaker rules: goal difference, goals scored, head-to-head

**B. Brackets (Knockout/Elimination)**
- Single elimination: winner advances, loser is out
- Can create "consolation brackets" for losers
- Supports: quarter-finals, semi-finals, finals
- Automatic progression based on match results

**C. Single Matches**
- One-off encounters between two teams
- Used for: playoffs, classification matches, friendlies

#### Advanced Format Features:
- **Predefined Templates**: Common tournament structures ready to use
- **Custom Formats**: Combine groups, brackets, and single matches
- **Multi-Phase Tournaments**: 
  - Phase 1: Group stage (all teams)
  - Phase 2: Knockout (top teams advance)
  - Phase 3: Classification matches (teams that didn't qualify)
- **Best Placed Teams**: Automatically select "best thirds" from multiple groups
- **Byes**: Handle odd number of teams
- **Seeding**: Assign seed numbers for bracket positioning

#### Team Placement:
- **Manual**: Drag teams into groups/brackets
- **Automated Draw**: Random assignment
- **Performance-Based**: Link phases (e.g., "Group A winner goes to Bracket Position 1")

### 3. Participants Management

#### Teams (Participants > Teams)
- **Add Teams**: One by one or bulk (multiple teams at once, one per line)
- **Team Info**: Name, contact, notes
- **Team Login Links**: Unique URL for each team to submit scores
- **Player Roster**: Add individual players to teams
- **Player Stats**: Track goals, yellow cards, presence, player-of-match

#### Referees (Participants > Referees)
- **Add Referees**: Import list or add manually
- **Referee Login Links**: Unique URL for each referee to submit scores (no account needed)
- **Assignment**: Manual or automatic assignment to matches

#### Administrators (Participants > Administrators)
- **Co-Organizers**: Add multiple admins with full access
- **Shared Login**: Or share single login credentials
- **Admin Login Link**: Special URL to submit scores for ALL matches

### 4. Match Scheduling (Schedule Page)

#### Playing Fields Setup:
- **Add Fields**: Name each field/pitch (e.g., "Pitch 1", "Pitch 2")
- **Starting Times**: Set when each field becomes available
- **Match Duration**: Set length (e.g., 15 minutes, 20 minutes)
- **Variable Duration**: Different durations per division/group if needed

#### Scheduling Tools:

**A. Automatic Planner**
- Generates matches based on Format setup
- Options:
  - Schedule all matches at once
  - Filter by groups/brackets
  - Filter by specific fields
  - Schedule by rounds (for leagues)
- Respects field availability and match duration

**B. Manual Drag & Drop**
- Drag unplanned matches to specific field/time slots
- Rearrange scheduled matches
- Fine-tune the schedule

**C. Breaks & Events**
- **Breaks**: Add rest time between phases (e.g., between group stage and knockouts)
- **Events**: Communicate activities (lunch, award ceremony, team photos)

#### Multi-Day/Multi-Location:
- Switch between match days
- Switch between locations
- Create separate schedule for each day/location

#### Export:
- PDF: Printable schedule
- Excel: Editable spreadsheet

### 5. Results & Scoring (Results Page)

#### Score Submission Methods:

**A. Admin Entry**
- Log in to Tournify
- Navigate to Results page
- Enter scores for any match
- Multiple admins can enter simultaneously

**B. Referee Entry (No Account Needed)**
- Each referee gets unique login link
- Click link → Opens tournament website
- Submit score for assigned matches
- No Tournify account required

**C. Team Self-Reporting**
- Each team gets unique login link
- Teams submit their own scores
- Useful when no referees available
- Can auto-include link in registration confirmation email

**D. Admin Login Link (New Feature)**
- Single URL to submit scores for ALL matches
- Can be used via mobile app
- Useful for roving admin with tablet

#### Progress Management:
- **Phase Completion**: System tracks when all matches in a phase are complete
- **Manual Progression**: Click "Start" button to move to next phase
- **Preview**: Shows how teams will advance based on standings and links
- **Confirm**: Teams automatically placed in next phase
- **Undo**: Reset if needed before confirming

#### Live Updates:
- Standings update in real-time as scores are entered
- Bracket progression automatic after phase confirmation
- All changes sync instantly to website/app

### 6. Presentation (Presentation Page)

#### A. Public Website

**Setup:**
- Click "Create public link"
- Choose custom URL (e.g., `tournifyapp.com/summer-football-2026`)
- Select which pages to show

**Available Pages:**
- **Info**: Tournament description, rules, regulations (customizable with text, images, attachments)
- **My Team**: Team-specific view (login required)
- **Standings**: Live ladder/table
- **Schedule**: Fixtures with dates, times, locations
- **Referees**: Referee assignments (optional)
- **Sign Up**: Registration form (optional)

**Customization:**
- Edit page content (Info and Sign Up pages)
- Add descriptions, images, attachments
- Include tournament rules/regulations

#### B. Mobile App (iOS & Android)

**Requirements:**
- Upgrade to "Worldclass" or "Legendary" package
- Toggle switch to make tournament discoverable in app

**Features:**
- Push notifications for match starts, results, schedule changes
- Follow specific teams or players
- Live standings and fixtures
- Real-time score updates

#### C. Slideshow Mode

**Purpose**: Display on big screens at venue (TV, projector)

**Setup:**
- Create slides
- Choose what to show: groups, matches, brackets, standings
- Add text or images
- Connect laptop to screen via HDMI

**Usage:**
- 2-3 groups fit per slide (depends on screen size)
- Auto-rotate through slides
- Live updates as scores come in

### 7. Registration (Optional)

#### Built-in Registration Page:
- **Enable**: Go to Presentation > Website & App > Enable Sign Up page
- **Customize**: Edit page with custom fields, text, images
- **Payment Support**: Integrated payment processing (Stripe/PayPal)
- **Confirmation Email**: Auto-send with team login link
- **Form Fields**: Fully customizable (team name, contact, player names, etc.)

---

## Key Features Summary

### Tournament Formats Supported
1. ✅ Single Round Robin (everyone plays once)
2. ✅ Double Round Robin (everyone plays twice)
3. ✅ Single Elimination (knockout)
4. ✅ Group Stage + Knockout (World Cup style)
5. ✅ Consolation Brackets (losers bracket)
6. ✅ Classification Matches (3rd place, 5th place, etc.)
7. ✅ Friendlies (single matches)
8. ✅ Leagues (season-long with rounds)

### Scoring & Standings
- ✅ Customizable points (3-1-0, 2-1-0, etc.)
- ✅ Tiebreaker rules (goal difference, head-to-head, goals scored)
- ✅ Live standings updates
- ✅ "Best placed" teams from multiple groups
- ✅ Player statistics (goals, cards, presence)

### Scheduling
- ✅ Auto-generate fixtures
- ✅ Drag-and-drop manual scheduling
- ✅ Multiple fields/pitches
- ✅ Variable match durations
- ✅ Multi-day tournaments
- ✅ Multi-location tournaments
- ✅ Breaks and events
- ✅ Export to PDF/Excel

### Score Entry
- ✅ Admin entry (web/mobile)
- ✅ Referee entry (unique links, no account)
- ✅ Team self-reporting (unique links)
- ✅ Multiple simultaneous entries
- ✅ Mobile app score entry

### Presentation
- ✅ Public website (custom URL)
- ✅ Mobile app (iOS/Android)
- ✅ Slideshow mode (venue screens)
- ✅ Live updates
- ✅ Push notifications
- ✅ Customizable pages

### Participant Management
- ✅ Team database
- ✅ Player rosters
- ✅ Player statistics
- ✅ Referee database
- ✅ Multiple administrators
- ✅ Unique login links (teams, referees, admins)

### Registration
- ✅ Online sign-up forms
- ✅ Customizable fields
- ✅ Payment integration
- ✅ Confirmation emails
- ✅ Auto-include login links

---

## Pricing Tiers (Estimated)

Based on references to "Worldclass" and "Legendary" packages:

1. **Free/Basic**: Core tournament management
2. **Worldclass**: Mobile app inclusion, advanced features
3. **Legendary**: Premium features, priority support

*(Exact pricing not publicly documented - likely varies by tournament size and duration)*

---

## Technical Architecture (Inferred)

### Data Model:
```
Tournament
├── General Settings (name, dates, locations, scoring rules)
├── Divisions (age groups, skill levels)
├── Format
│   ├── Groups (round robin)
│   ├── Brackets (knockout)
│   └── Single Matches
├── Participants
│   ├── Teams
│   │   └── Players
│   ├── Referees
│   └── Administrators
├── Schedule
│   ├── Playing Fields
│   ├── Matches (generated from Format)
│   └── Events/Breaks
├── Results
│   ├── Scores
│   ├── Standings
│   └── Player Stats
└── Presentation
    ├── Public Website
    ├── Mobile App
    └── Slideshow
```

### Key Concepts:

**Phases**: Tournaments progress through phases (Group Stage → Knockout → Finals)

**Links**: Connect phases (e.g., "Group A winner → Bracket Position 1")

**Progression**: Manual trigger to move from one phase to next (prevents accidental advancement)

**Login Links**: Unique URLs for teams/referees to submit scores without accounts

**Real-time Sync**: All changes (scores, schedule) sync instantly to website/app/slideshow

---

## What Kiro Can Learn from Tournify

### 1. Simplicity First
- Tournify makes complex tournaments feel simple
- Three building blocks (Groups, Brackets, Matches) cover all scenarios
- Predefined templates for common formats

### 2. Flexible Scoring
- Don't hardcode 3-1-0 points system
- Allow customization per competition
- Support different tiebreaker rules

### 3. Multi-Phase Tournaments
- Support progression from groups to knockouts
- Manual confirmation before advancing (prevents mistakes)
- Preview how teams will advance

### 4. Login Links (Brilliant!)
- No need to create accounts for referees/teams
- Unique URLs for score submission
- Reduces friction, increases adoption

### 5. Presentation Options
- Public website is essential (parents want to follow)
- Slideshow mode is nice-to-have (venue screens)
- Mobile app is critical (push notifications)

### 6. Drag-and-Drop Scheduling
- Auto-generate is great for initial schedule
- Manual adjustment is essential for real-world constraints
- Visual planner makes it intuitive

### 7. Multiple Score Entry Methods
- Admin entry (always available)
- Referee entry (reduces admin burden)
- Team self-reporting (when no referees)
- Flexibility is key

---

## Kiro Implementation Priorities (Based on Tournify Analysis)

### Phase 1: MVP (Must Have)
1. ✅ **Competition CRUD**: Create, edit, delete competitions
2. ✅ **Round Robin Format**: Single/double round robin
3. ✅ **Team Registration**: Add teams to competition
4. ✅ **Auto-Generate Fixtures**: Create all matches automatically
5. ✅ **Standings Calculation**: Points, goal difference, win/loss/draw
6. ✅ **Score Entry**: Admin entry via Games page
7. ✅ **Schedule Integration**: Competition matches appear in Schedule
8. ✅ **Mobile Standings View**: New page to view ladder

### Phase 2: Enhanced (Should Have)
1. ✅ **Knockout Brackets**: Single elimination
2. ✅ **Group + Knockout**: Multi-phase tournaments
3. ✅ **Manual Scheduling**: Drag-and-drop match times
4. ✅ **Referee Assignment**: Assign referees to matches
5. ✅ **Team Login Links**: Unique URLs for score submission
6. ✅ **Competition Messaging**: Broadcast to all teams
7. ✅ **Player Stats**: Track goals, cards, etc.

### Phase 3: Advanced (Nice to Have)
1. ✅ **Public Standings View**: Shareable link for parents
2. ✅ **Registration Forms**: Online team sign-up
3. ✅ **Payment Integration**: Registration fees
4. ✅ **Push Notifications**: Match reminders, score updates
5. ✅ **Slideshow Mode**: Display on venue screens
6. ✅ **Advanced Stats**: Top scorers, clean sheets, etc.

---

## Key Differences: Tournify vs Kiro

| Feature | Tournify | Kiro (Proposed) |
|---------|----------|-----------------|
| **Primary Focus** | Tournament management only | Training + Competition + Messaging |
| **User Base** | Any sport, any organizer | Football clubs specifically |
| **Training Management** | ❌ None | ✅ Lessons, sessions, delivery tracking |
| **Team Messaging** | ❌ None | ✅ Built-in messaging system |
| **Game Day Subs** | ❌ None | ✅ Substitution management |
| **Coaching Resources** | ❌ None | ✅ Session library, coaching guides |
| **Multi-Sport** | ✅ All sports | ❌ Football only |
| **Public Website** | ✅ Auto-generated | 🔄 Phase 3 |
| **Slideshow Mode** | ✅ Built-in | 🔄 Phase 3 |
| **Payment Integration** | ✅ Built-in | 🔄 Phase 3 |
| **Drag-Drop Scheduling** | ✅ Advanced | 🔄 Phase 2 |
| **Referee Management** | ✅ Full featured | 🔄 Phase 2 |
| **Login Links** | ✅ Teams & Referees | 🔄 Phase 2 |

**Kiro's Advantage**: All-in-one platform (training + competition + communication)

**Tournify's Advantage**: Mature tournament features, public presentation

---

## Recommendations for Kiro

### 1. Start Simple (Phase 1)
- Focus on round robin (most common for summer football)
- Auto-generate fixtures
- Basic standings
- Integrate with existing Schedule/Games pages

### 2. Leverage Existing Infrastructure
- Use `events` table for competition matches
- Use `event_rsvps` for attendance
- Use existing score recording in Games page
- Use messaging for competition announcements

### 3. Don't Reinvent the Wheel
- Tournify's three building blocks (Groups, Brackets, Matches) are perfect
- Login links for score submission are brilliant
- Manual phase progression prevents mistakes

### 4. Focus on Integration
- Competition matches in Schedule (alongside training)
- Competition scores in Games (alongside internal games)
- Competition messaging (using existing system)
- Unified experience is Kiro's competitive advantage

### 5. Phase 2 & 3 Based on Feedback
- Don't build knockout brackets until users ask
- Don't build public website until it's needed
- Don't build payment integration until running paid competitions

---

## Conclusion

Tournify is a mature, well-designed tournament management system with excellent UX and comprehensive features. However, it's tournament-only - no training, no messaging, no coaching resources.

**Kiro's opportunity**: Build tournament features that integrate seamlessly with existing training and communication features, creating a true all-in-one platform that replaces Heja/TeamReach + Tournify.

**Key insight**: Don't try to match Tournify feature-for-feature. Instead, build the 20% of features that deliver 80% of value, and leverage Kiro's existing infrastructure for the rest.

**Next step**: Create spec for Tournament Phase 1 MVP after completing reporting dashboard.
