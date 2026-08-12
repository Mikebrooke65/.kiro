# Questions for Football Club

Document to track questions that need answers from the club before finalizing the app.

---

## 1. Skills Terminology & Structure

### Key Skills
- What does the club officially call these fundamental skills? (e.g., "Key Skills", "Core Skills", "Technical Skills")
- The app currently references 8 key skills - is this correct?
- What are the exact names of these 8 key skills?
- Current placeholder examples in app: Passing, Shooting, Dribbling, etc.
- Do these need to match specific club terminology or coaching framework?

### Follow-up
- Are there different skill sets for different age groups?
- Should skills be categorized (e.g., Technical, Tactical, Physical, Mental)?

--

## 2. Team Structure & Tagging System ✅ ANSWERED

### Team Classification Structure

Teams are classified using the following attributes:

**Type** (based on age group):
- First Kicks: U4, U5, U6
- Fun Football: U7, U8
- Junior Football: U9, U10, U11, U12
- Youth Football: U13, U14, U15, U16, U17
- Senior Football

**Technical Level**:
- Community
- Academy/Development

**Gender**:
- Mixed
- Female

**Age Group**:
- U4, U5, U6 (First Kicks)
- U7, U8 (Fun Football)
- U9, U10, U11, U12 (Junior Football)
- U13, U14, U15, U16, U17 (Youth Football)

**Team Name**:
- Can be anything
- **Unique Identifier**: Age Group + Team Name (e.g., "U12 Lions", "U10 Eagles")

### Implementation Requirements
- Sessions and lessons must be taggable with: Type, Technical Level, Gender, Age Group
- **Note**: Sessions/lessons are NOT tagged with specific Team Names (too specific)
- Support multiple tags per session/lesson (e.g., can tag for both U11 and U12, or Community and Academy)
- Support filtering and search by all classification attributes
- Enable AI search for complex queries (e.g., "all U12 academy passing drills for mixed teams")
- Use Age Group + Team Name as unique team identifier for team management (not for content tagging)

### Outstanding Questions
- How do you handle players moving between teams?
- Are there team IDs or codes in Friendly Manager we should use?
- How are teams tracked across seasons?
- Should tags be hierarchical for AI search? (e.g., Academy > U12 > Team A)

---

## 3. Friendly Manager API Integration

### Known Information
- **Club Instance**: westcoastrangers.friendlymanager.com
- **Embeddable Forms**: Friendly Manager provides JavaScript embeds for forms that can be placed on external websites
  - Example: `<script src="https://westcoastrangers.friendlymanager.com/js/loadform/register.js"></script>`
  - These forms send data TO Friendly Manager (e.g., registration forms)
  - Confirms write capability exists (external → Friendly Manager)
- **Key Question**: Does Friendly Manager also provide APIs to READ data back out (Friendly Manager → our app)?

### API Access
- Does Friendly Manager provide an API for external applications?
- What authentication method is required? (API keys, OAuth, etc.)
- Are there any API documentation or developer resources available?
- What are the rate limits or usage restrictions?

### Team Data
- Which API endpoints provide team information?
- What data fields are available for each team?
- Can we query teams by age group, type, or other filters?
- How frequently is team data updated?

### Player Data
- Which API endpoints provide player information?
- What player data is available? (name, age, position, team assignment, etc.)
- Can we get player rosters for specific teams?
- How is player privacy/data protection handled?
- Are there any restrictions on what player data we can display in the app?

### Real-time Updates
- Does the API support webhooks or real-time notifications?
- How should we handle data synchronization between Friendly Manager and the app?
- What's the recommended refresh frequency for team/player data?

### Technical Contact
- Who is the technical contact at Friendly Manager for API integration questions?
- Can they provide sandbox/test environment access for development?

---

## 4. Data Synchronization & Edit Management

### Edit Workflow
- When team or player information is changed in the app, should it sync back to Friendly Manager?
- Or is Friendly Manager the single source of truth (read-only from app)?
- What data can coaches edit in the app vs what must be changed in Friendly Manager?

### Write Permissions
- Does the Friendly Manager API support write operations (POST/PUT/PATCH)?
- Which fields can be updated via API?
- Are there approval workflows required for certain changes?
- Who has permission to make changes? (coaches, admins, specific roles)

### Conflict Resolution
- What happens if data is changed in both systems simultaneously?
- How should conflicts be handled?
- Is there a "last write wins" policy or something more sophisticated?

### Change Tracking
- Should the app track who made changes and when?
- Does Friendly Manager maintain an audit log of changes?
- Do we need to notify anyone when changes are made?

### Data Validation
- What validation rules must be enforced when editing data?
- Are there required fields or format requirements?
- Should validation happen in the app, API, or both?

---

## 5. Player & Team Feedback Management

### Data Ownership
- Where should player and team feedback be stored/mastered?
- Should feedback stay within this coaching app's database?
- Or should it be sent to Friendly Manager?
- Is there a separate system for performance tracking and feedback?

### Feedback Types
- What types of feedback will be collected?
  - Session attendance and participation?
  - Skill assessments and progress tracking?
  - Coach observations and notes?
  - Player self-assessments?
  - Parent/guardian feedback?
- Are there specific feedback forms or templates the club uses?

### Access & Visibility
- Who should be able to view feedback? (coaches, players, parents, admins)
- Should feedback be shared across different coaching staff?
- Are there privacy considerations for player feedback?
- Should players/parents have access to their own feedback history?

### Reporting & Analytics
- Does the club need reports or analytics based on feedback data?
- Should feedback integrate with player development plans?
- Are there specific metrics or KPIs the club tracks?

### Data Retention
- How long should feedback be retained?
- Are there any compliance or data protection requirements?
- Should historical feedback be archived or remain accessible?

---

## 6. Feedback Model & Framework

### Current App Model
- The app currently uses a "4 Moments of the Game" feedback model
- Is this the framework the club wants to use?
- Or does the club have a different coaching/feedback methodology?

### Club's Coaching Philosophy
- What coaching framework or philosophy does the club follow?
- Are there specific models for:
  - Game analysis?
  - Training session feedback?
  - Player development assessment?
- Does the club use any established frameworks? (e.g., FA coaching guidelines, specific methodologies)

### Feedback Structure
- If not "4 Moments", what structure should feedback follow?
- Are there specific categories or areas that must be covered?
- Should the model differ by age group or team level?

### Alignment with Club Standards
- Does the feedback model need to align with league or federation requirements?
- Are there certification or accreditation standards to consider?
- Should the model support the club's player pathway/development plan?

### Customization
- Should coaches be able to customize the feedback model?
- Or should it be standardized across all teams?
- Are there mandatory vs optional feedback elements?

---

## 7. AI-Powered Session Builder (Admin Desktop App)

### Proposed Feature
- AI-assisted session building in the admin desktop application
- Coach enters basic parameters:
  - Key skill(s) to focus on
  - Session type (training, match prep, recovery, etc.)
  - Team level/age group
  - Fun level/engagement target
  - Learning objectives
- AI generates a complete session plan based on these inputs

### Club Approval & Requirements
- Is the club interested in this AI-powered session builder feature?
- Would coaches trust and use AI-generated session plans?
- Should AI suggestions be starting points that coaches then customize?
- Or should they be complete, ready-to-use sessions?

### Content & Quality Control
- What standards must AI-generated sessions meet?
- Should sessions be reviewed/approved before being available to coaches?
- Who validates that sessions are appropriate and safe?
- Should there be a library of pre-approved drills/activities that AI draws from?

### Customization & Flexibility
- Should coaches be able to edit AI-generated sessions?
- Can coaches save customized versions?
- Should the AI learn from coach modifications and feedback?
- Are there mandatory elements that must be in every session?

### Integration with Existing Content
- Does the club have existing session plans that should inform the AI?
- Should AI-generated sessions follow specific club templates or formats?
- How should this integrate with the lesson library?

### Technical Considerations
- Are there budget considerations for AI API costs?
- Should this work offline or require internet connection?
- What's the expected response time for session generation?

---

## 8. AI Session Adaptation & Rewriting

### Proposed Feature
- AI-powered session adaptation tool
- Admin selects an existing session (e.g., written for Academy U11)
- AI automatically adapts it for different parameters:
  - Different age group (e.g., U9 instead of U11)
  - Different team type (e.g., Community instead of Academy)
  - Different skill level or ability
  - Different session duration
  - Different focus areas

### Club Interest & Use Cases
- Would this feature be valuable for the club's coaching staff?
- How often do coaches need to adapt sessions for different groups?
- Are there common adaptation patterns? (e.g., always simplifying Academy sessions for Community teams)

### Adaptation Rules & Guidelines
- What should change when adapting between age groups?
  - Drill complexity?
  - Field/space size?
  - Number of players?
  - Duration of activities?
  - Coaching language and terminology?
- What should change between Academy and Community sessions?
  - Intensity level?
  - Competitive elements?
  - Technical difficulty?
  - Fun vs performance focus?

### Quality & Safety
- Should adapted sessions require review before use?
- Are there safety considerations when changing age groups?
- Should there be limits on how much a session can be adapted?
- Who is responsible for validating adapted sessions?

### Version Control
- Should both original and adapted versions be saved?
- How should relationships between sessions be tracked?
- Can coaches provide feedback on adapted sessions to improve AI?

### Constraints
- Are there certain elements that should never change? (e.g., safety protocols, warm-up structure)
- Should some sessions be marked as "not suitable for adaptation"?

---

## 9. Adding Caregivers & Players - User Management Process

### Proposed Workflows

#### Adding Additional Caregivers
- Scenario: Second parent/guardian needs access during season
- Proposed: Existing caregiver can authorize and provide a code/invite
- Questions:
  - Is this self-service approach acceptable to the club?
  - Should there be a limit on how many caregivers per player?
  - Does the club need to approve additional caregivers?
  - What verification is needed? (email, phone, relationship confirmation)
  - Should both caregivers have equal access/permissions?

#### Adding New Players (Community Teams)
- Scenario: New player joins mid-season, especially in community programs
- Proposed workflow:
  1. Coach/Manager adds player as "temporary" role in app
  2. System automatically notifies club admin
  3. Club admin follows proper registration process
  4. Player is added to Friendly Manager
  5. Temporary user is merged with official player account
  6. All temporary data (attendance, feedback, etc.) is preserved
  7. Temporary role expires after ~3 weeks if not converted

### Questions for Club

#### Caregiver Management
- What is the club's policy on multiple caregivers per player?
- Are there safeguarding or child protection considerations?
- Should caregivers be able to remove each other's access?
- What happens when parents separate or custody changes?
- Should there be an audit trail of who added whom?

#### Temporary Player Process
- Is a 3-week temporary period appropriate?
- What happens if temporary period expires? (account locked, deleted, extended?)
- Should temporary players have limited functionality?
- Who can create temporary players? (all coaches, only managers, only admins?)
- What data should be captured for temporary players?

#### Data Merging
- When temporary account merges with official account, what data transfers?
  - Attendance records?
  - Feedback and assessments?
  - Messages and communications?
  - Photos/media?
- How are conflicts handled if data differs?
- Should there be a review step before merging?

#### Notifications & Approvals
- Who gets notified when temporary player is added?
- What information should the notification include?
- Is there an approval workflow or just informational?
- Should reminders be sent as temporary period nears expiration?

#### Compliance & Registration
- What are the club's official player registration requirements?
- Are there league/federation rules about temporary players?
- What insurance or liability considerations exist?
- Should temporary players be able to participate in matches or just training?

#### Alternative Approaches
- Should all new players go through club admin first (no temporary option)?
- Could there be different processes for Academy vs Community teams?
- Should trial players have a different status than temporary players?

---

### Casual Competitions & Self-Managed Teams

#### Scenario: Summer Football & Casual Competitions
- Teams register for casual competitions (e.g., summer football)
- Club doesn't manage players through Friendly Manager system
- Teams are self-organized with their own managers/coaches
- Need to provide app benefits without full club administration

#### Proposed "Lite" User Model
**Concept**: Create simplified user roles for self-managed teams:
- **CoachLite**: Limited coaching features for casual team coaches
- **ManagerLite**: Basic team management for casual team managers
- **PlayerLite**: Player access without full club registration
- **CaregiverLite**: Parent/guardian access for casual competition players

**Registration Workflow**:
1. Team registers for casual competition
2. Club sets up team in system with designated Manager
3. Manager receives unique link/access
4. Manager can invite Coach, Players, and Caregivers via email
5. Each receives unique link to join team and access mobile app
6. Users get app benefits for their specific team only

#### Questions for Club

**Scope & Permissions**:
- What features should "Lite" users have access to?
- What should they NOT have access to compared to full users?
- Should they see only their team or have broader club visibility?
- Can they access lesson library, resources, messaging?

**Data Management**:
- Should casual competition data be kept separate from main club data?
- What happens to team/user data after competition ends?
- Should there be an option to "upgrade" to full registration?
- How long should casual team data be retained?

**Team Setup**:
- Who creates the initial team? (Club admin, or self-service registration?)
- What information is required to set up a casual team?
- Should there be limits on team size or number of coaches/managers?
- How are team names managed to avoid conflicts?

**Access Control**:
- Should Manager have full control to add/remove team members?
- Or should there be club oversight/approval?
- Can users be part of both casual and registered teams?
- What happens if someone is already in the system?

**Communication & Isolation**:
- Should casual teams be able to message other teams/club?
- Or should messaging be isolated to their team only?
- Should they receive club-wide announcements?
- Can they see other teams' schedules or information?

**Liability & Compliance**:
- Are there different insurance/liability considerations for casual competitions?
- What safeguarding requirements apply?
- Should there be terms & conditions specific to casual users?
- Are there age verification requirements?

---

## 10. Game Scheduling & Communication

### ✅ PARTIALLY ANSWERED - Current Process

**Source System**: New Zealand Football 'Sporty' system

**Timeline**:
- Initial draw published at beginning of season in Sporty
- Changes are very common up until Friday midday (lockoff time) before weekend games
- Club Administrator reviews at lockoff time

**Current Workflow**:
1. Friday midday: Administrator prints report from Sporty system
2. Administrator checks for home ground allocation issues
3. Additional changes often made at this point by Administrator
4. Administrator sends amended complete file to all relevant contacts

**Pain Points & Automation Opportunity**:
- Manual process of printing, checking, and distributing
- Ideally could be automated except for home field allocation check by Club Administrator
- Need to handle frequent changes up to Friday midday deadline

### Outstanding Questions

#### Sporty System Integration
- Does Sporty provide an API or data feed for game schedules?
- Can we automatically pull schedule data instead of manual export?
- What format is the current report? (PDF, Excel, CSV, etc.)
- Is there a way to get real-time updates or only manual exports?

#### Home Ground Allocation
- What specific checks does the Administrator perform on home grounds?
- **ANSWERED**: Sporty often allocates all games at a park to Field #1 (seeing it as unused)
- **Issue**: Clubs sometimes deliberately don't use certain fields, requiring manual reallocation to appropriate fields
- **Cannot be automated**: Requires human judgment about which fields are actually available/appropriate
- Is there a separate system for managing field/ground availability?

### Proposed Automated Workflow
**Ideal Solution**:
1. **Automated Pull**: System automatically pulls schedule data from Sporty (API or scheduled import)
2. **Manual Review**: Club Administrator reviews and edits field allocations as needed
3. **Post Button**: Administrator clicks "Post/Send" to distribute via app messenger
4. **Targeted Distribution**: Messages sent automatically to all users based on their team assignments

**Benefits**:
- Eliminates manual printing and file distribution
- Maintains critical human oversight for field allocation
- Automated, targeted messaging to relevant users only
- Reduces administrator workload while keeping control

### Outstanding Questions

#### Sporty System Integration
- What information is included in Sporty schedules?
  - Date and time
  - Venue/field location
  - Opposition team
  - Competition/division
  - Officials/referees
  - Any special instructions

### Distribution Process
- Who is responsible for entering/managing game schedules?
- How should game information be distributed through the app?
  - Push notifications?
  - In-app messages?
  - Email notifications?
  - All of the above?

### Target Audience
- Who needs to receive game notifications?
  - Players on the team
  - All caregivers of those players
  - Team coaches and managers
  - Club administrators
  - Anyone else?

### Message Content
- What information should be included in game notifications?
- Should there be reminders? (e.g., 24 hours before, day of game)
- How should changes/cancellations be communicated?
- Should players/caregivers be able to confirm attendance?

### Workflow Questions
- Should game schedules sync with Friendly Manager?
- Or is this separate from player/team management?
- Who has permission to add/edit game schedules?
- Should there be approval before notifications are sent?
- How should the app handle multiple games on the same day for different teams?

---
