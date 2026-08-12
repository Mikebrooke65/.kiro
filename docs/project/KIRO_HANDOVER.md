# Urrah Coaching App - Kiro Development Handover Document

**Client:** West Coast Rangers Football Club  
**Project:** Urrah Coaching App  
**Purpose:** Mobile and web-based coaching platform for ~200 junior coaches, managers, players, and caregivers  
**Handover Date:** March 4, 2026  
**Prototype Repository:** https://github.com/Mikebrooke65/coaching-app-prototype

---

## Executive Summary

The Urrah app is a role-based coaching management platform designed for West Coast Rangers FC. It features two distinct user experiences:

- **Full Version** (Coaches/Managers/Admins): 6 main areas + admin-only features
- **Lite Version** (Players/Caregivers): 3 main areas

This document provides complete specifications for development, based on the fully functional Figma prototype.

---

## Table of Contents

1. [Brand Guidelines](#brand-guidelines)
2. [User Roles & Permissions](#user-roles--permissions)
3. [Authentication System](#authentication-system)
4. [Application Structure](#application-structure)
5. [Feature Specifications - Mobile](#feature-specifications---mobile)
6. [Feature Specifications - Desktop](#feature-specifications---desktop)
7. [Data Models](#data-models)
8. [Technical Stack Recommendations](#technical-stack-recommendations)
9. [Deployment & Infrastructure](#deployment--infrastructure)

---

## Brand Guidelines

### Color Palette
- **Primary Blue:** `#0091f3`
- **Dark Grey:** `#545859`
- **White:** `#FFFFFF`
- **Black:** `#000000`
- **Orange (Accent):** `#ea7800`

### Typography
- **Titles & Headings:** Aktiv Grotesk Corp
- **Subtitles & Body:** Exo 2.0

### Visual Identity
- Use **gannet bird graphics** (not full club shield logo) for cleaner look
- Brand assets provided separately by client

---

## User Roles & Permissions

### Role: Player
**Access:** Lite Version
- Landing Page
- Schedule
- Messaging

### Role: Caregiver
**Access:** Lite Version
- Landing Page
- Schedule
- Messaging

### Role: Coach
**Access:** Full Version
- Landing Page
- Coaching (AI Coach, Lessons, Lesson Detail)
- Games
- Resources
- Schedule
- Messaging

### Role: Manager
**Access:** Full Version (Same as Coach)
- Landing Page
- Coaching (AI Coach, Lessons, Lesson Detail)
- Games
- Resources
- Schedule
- Messaging

### Role: Admin
**Access:** Full Version + Admin Features
**Mobile:** Same as Coach/Manager
**Desktop Only:**
1. Landing Page
2. Coaching
3. Games
4. Resources
5. Schedule
6. Messaging
7. Session Builder
8. Lesson Builder
9. Teams Management
10. User Management
11. Reporting
12. Announcements

---

## Authentication System

### Requirements
- **Secure login** with email/password
- **Role-based access control** (RBAC)
- **Session management**
- **Password reset functionality**
- **Multi-factor authentication** (optional, recommended for admins)

### Login Flow
1. User lands on **Welcome Screen** (splash screen with branding)
2. Clicks "Get Started" → **Login Screen**
3. Enters credentials
4. System validates and determines role
5. Redirects to appropriate version:
   - **Lite Version:** 3 areas (Landing, Schedule, Messaging)
   - **Full Version:** 6 areas (+ Coaching, Games, Resources)
   - **Desktop Admin:** 12 areas (all admin features)

### Screens
- **WelcomeScreen.tsx** - Initial splash screen
- **LoginScreen.tsx** - Authentication form

---

## Application Structure

### Platform Detection
- **Mobile:** Bottom tab navigation (iOS/Android style)
- **Desktop:** Left sidebar navigation with top header
- **Responsive breakpoint:** Automatically detected via `use-mobile` hook

### Navigation Structure

#### Mobile (All Roles)
**Bottom Tab Bar with Icons:**
1. Landing (Home icon)
2. [Coaching] - Full version only
3. [Games] - Full version only
4. [Resources] - Full version only
5. Schedule (Calendar icon)
6. Messaging (Message icon)

#### Desktop Admin
**Left Sidebar Navigation:**
1. Landing
2. Coaching
3. Games
4. Resources
5. Schedule
6. Messaging
7. **Session Builder** (80% complete indicator)
8. **Lesson Builder** (80% complete indicator)
9. Teams Management
10. User Management
11. Reporting
12. **Announcements** (NEW - added as 12th area)

**Note:** Session Builder appears BEFORE Lesson Builder in navigation order.

---

## Feature Specifications - Mobile

### 1. Landing Page
**File:** `Landing.tsx`

**Purpose:** Customizable team hub with announcements

**Features:**
- Team welcome header
- Announcement feed/cards
- Quick links to other sections
- Customizable by admins (announcements managed on desktop)

**Data Required:**
- Announcements (title, content, date, author, priority)
- Team information
- User name for personalization

---

### 2. Coaching Section
**Role Access:** Coach, Manager, Admin only

**Sub-pages:**

#### 2a. AI Coach
**File:** `AICoach.tsx`

**Purpose:** AI-powered coaching assistant

**Features:**
- Chat interface with AI
- Coaching tips and suggestions
- Drill recommendations
- Q&A functionality

**Technical Requirements:**
- LLM integration (ChatGPT/Claude/similar)
- Chat history storage
- Context-aware responses (user role, team age group, etc.)

#### 2b. Lessons
**File:** `Lessons.tsx`

**Purpose:** Browse available coaching lessons

**Features:**
- **Filter bar** with dropdowns:
  - Age Group
  - Skill Level
  - Focus Area
  - Duration
- **Lesson cards** displaying:
  - Lesson title
  - Age group badge
  - Duration
  - Key skills/focus areas
  - Thumbnail/icon
- **Search functionality**
- Tap card → Navigate to Lesson Detail

**Data Required:**
- Lesson library (title, description, age group, duration, skills, blocks/sessions)

#### 2c. Lesson Detail
**File:** `LessonDetail.tsx`

**Purpose:** View complete lesson plan

**Features:**
- Lesson header (title, metadata)
- **4 Session Blocks:**
  1. Warm-Up & Technical
  2. Skill Introduction
  3. Progressive Development
  4. Game Application
- Each block shows:
  - Session name
  - Duration
  - Description
  - Equipment needed
  - Coaching points
- **Print/Export** button
- **Favorite/Save** button

---

### 3. Games
**File:** `Games.tsx`
**Role Access:** Coach, Manager, Admin only

**Purpose:** Match/game management and tracking

**Features:**
- Upcoming games list
- Past games with scores
- Team lineup management
- Match statistics
- Opposition notes
- Venue/time details

**Data Required:**
- Game schedule
- Team rosters
- Match results
- Player statistics

---

### 4. Resources
**File:** `Resources.tsx`
**Role Access:** Coach, Manager, Admin only

**Purpose:** Coaching materials library

**Features:**
- **Categorized resources:**
  - Training drills
  - Videos
  - PDFs/Documents
  - External links
- **Search and filter**
- **File upload** (admin only)
- **Favorites/bookmarks**

**Data Required:**
- Resource library (files, links, categories, tags)

---

### 5. Schedule
**File:** `Schedule.tsx`
**Role Access:** ALL roles

**Purpose:** Team calendar and event management

**Features:**
- **Calendar view** (month/week/day)
- **Event types:**
  - Training sessions
  - Matches
  - Team meetings
  - Social events
- **Event details** (time, location, attendance)
- **RSVP/Attendance** tracking
- **Personal calendar sync** (optional)

**Data Required:**
- Events (type, date, time, location, attendees)
- User attendance records

---

### 6. Messaging
**File:** `Messaging.tsx`
**Role Access:** ALL roles

**Purpose:** Team communication

**Features:**
- **Inbox/conversation list**
- **Direct messages** (1-on-1)
- **Group chats:**
  - Team-wide
  - Coach-only
  - Age group specific
- **Push notifications**
- **Read receipts**
- **File attachments** (images, PDFs)

**Data Required:**
- Messages (sender, recipient, content, timestamp, read status)
- User groups/teams
- Attachments

---

## Feature Specifications - Desktop

### Desktop Layout Components

#### DesktopLayout.tsx
**Purpose:** Main shell for desktop experience

**Features:**
- **Left sidebar** (navigation menu)
- **Top header** (user profile, notifications, logout)
- **Main content area** (renders selected page)
- **Progress indicators** on Session Builder (80%) and Lesson Builder (80%)

---

### Desktop-Specific Admin Features

### 7. Session Builder
**File:** `SessionBuilder.tsx`
**Role Access:** Admin only (desktop)

**Purpose:** Create and manage individual training sessions

**Layout:**
- **Left panel:** "Sessions" library with filtering
- **Right panel:** "Build a Session" form

**Sessions Library (Left Panel):**
- **Filter dropdowns:**
  - Age Group
  - Session Type (Warm-Up, Technical, Game Application, etc.)
  - Duration
  - Skill Focus
- **Collapsible line entries** for each session:
  - Session name
  - Duration badge
  - Tags/categories
  - Expand to see full details
- **Search bar**

**Build a Session Form (Right Panel):**
- Session name input
- Age group selector
- Duration input
- Session type dropdown
- **Rich text editor** for:
  - Objectives
  - Equipment needed
  - Setup instructions
  - Coaching points
  - Variations/progressions
- **Save/Publish** buttons
- **Draft functionality**

**Data Required:**
- Session templates
- Custom sessions (created by admins)
- Session metadata (type, duration, age group, etc.)

---

### 8. Lesson Builder
**File:** `LessonBuilder.tsx`
**Role Access:** Admin only (desktop)

**Purpose:** Combine 4 sessions into a complete lesson plan

**Layout:** Matches Session Builder design
- **Left panel:** "Lessons" library
- **Right panel:** "Build a Lesson" form

**Lessons Library (Left Panel):**
- **Filter dropdowns:**
  - Age Group
  - Skill Level
  - Focus Area
  - Duration
- **Collapsible line entries** for each lesson:
  - Lesson name
  - Age group badge
  - Duration (total of 4 blocks)
  - Skills covered
  - Expand to see 4 session blocks
- **Search bar**

**Build a Lesson Form (Right Panel):**
- Lesson name input
- Age group selector
- Skill level dropdown
- Focus area tags (multi-select)

**4 FIXED Session Blocks:**
1. **Warm-Up & Technical**
2. **Skill Introduction**
3. **Progressive Development**
4. **Game Application**

**Each Block:**
- Block title (fixed, not editable)
- **"Select Session" dropdown:**
  - Populated from Session Builder library
  - **Filtered by:**
    - Lesson's age group tags
    - Block type (matches session type)
- **Shows selected session:**
  - Session name
  - Duration
  - Brief description
  - "Change" button to reselect
- **Total duration** auto-calculated

**Workflow:**
1. Admin enters lesson metadata
2. For each of 4 blocks, selects appropriate session from filtered dropdown
3. System auto-calculates total duration
4. **Save/Publish** lesson
5. Lesson appears in mobile Lessons list for coaches

**Data Required:**
- Lesson templates
- Session library (from Session Builder)
- Lesson-session relationships (4 sessions per lesson)

---

### 9. Teams Management
**File:** `TeamsManagement.tsx`
**Role Access:** Admin only (desktop)

**Purpose:** Manage team rosters and assignments

**Features:**
- **Team list:**
  - Age group
  - Division
  - Coach assignment
  - Number of players
- **Add/Edit/Delete teams**
- **Player roster management:**
  - Add/remove players from teams
  - Player details (name, DOB, position, parent contact)
- **Coach assignment** to teams
- **Bulk import** (CSV upload)

**Data Required:**
- Teams (name, age group, division, season, coach)
- Players (name, DOB, parent info, team assignment)
- Coaches (name, contact, assigned teams)

---

### 10. User Management
**File:** `UserManagement.tsx`
**Role Access:** Admin only (desktop)

**Purpose:** Manage user accounts and permissions

**Features:**
- **User list** with filters:
  - Role (Player, Caregiver, Coach, Manager, Admin)
  - Team
  - Active/Inactive status
- **Add new user** form
- **Edit user details:**
  - Name
  - Email
  - Role
  - Team assignment
  - Active status
- **Reset password**
- **Bulk operations** (activate/deactivate, assign roles)
- **Audit log** (user actions)

**Data Required:**
- Users (name, email, role, team, status, last login)
- Audit logs (user, action, timestamp)

---

### 11. Reporting
**File:** `Reporting.tsx`
**Role Access:** Admin only (desktop)

**Purpose:** Analytics and insights

**Features:**
- **Dashboard with metrics:**
  - Active users (by role)
  - Training session attendance
  - Lesson usage statistics
  - Message activity
  - Game results summary
- **Charts/graphs:**
  - Attendance trends
  - Popular lessons
  - User engagement
- **Export reports** (PDF, Excel)
- **Date range filtering**

**Data Required:**
- User activity logs
- Attendance records
- Lesson access logs
- Message counts
- Game statistics

---

### 12. Announcements
**File:** `Announcements.tsx`
**Role Access:** Admin only (desktop)
**Status:** NEW - 12th main area

**Purpose:** Create and manage announcements for Landing Page

**Features:**
- **Announcement list:**
  - Title
  - Date posted
  - Author
  - Priority (High/Normal)
  - Published/Draft status
- **Create announcement form:**
  - Title
  - Rich text content editor
  - Priority selector
  - Target audience (All, Coaches only, Players only, etc.)
  - Publish immediately or schedule
  - Expiration date (optional)
- **Edit/Delete** announcements
- **Preview** before publishing
- **Pin important** announcements to top

**Data Required:**
- Announcements (title, content, author, date, priority, audience, status)

---

## Data Models

### User
```typescript
{
  id: string;
  email: string;
  password: string; // hashed
  firstName: string;
  lastName: string;
  role: 'player' | 'caregiver' | 'coach' | 'manager' | 'admin';
  teamId?: string; // optional, for players/coaches
  status: 'active' | 'inactive';
  createdAt: Date;
  lastLogin?: Date;
}
```

### Team
```typescript
{
  id: string;
  name: string;
  ageGroup: string; // e.g., "U10", "U12"
  division?: string;
  season: string; // e.g., "2026"
  coachId: string; // references User
  playerIds: string[]; // references Users
  createdAt: Date;
}
```

### Session
```typescript
{
  id: string;
  name: string;
  type: 'warmup' | 'technical' | 'skill_intro' | 'progressive' | 'game_application';
  ageGroup: string[];
  duration: number; // minutes
  objectives: string;
  equipment: string[];
  setupInstructions: string;
  coachingPoints: string[];
  variations: string[];
  tags: string[];
  createdBy: string; // User ID
  createdAt: Date;
  status: 'draft' | 'published';
}
```

### Lesson
```typescript
{
  id: string;
  name: string;
  ageGroup: string[];
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  focusAreas: string[];
  blocks: {
    warmUpTechnical: string; // Session ID
    skillIntroduction: string; // Session ID
    progressiveDevelopment: string; // Session ID
    gameApplication: string; // Session ID
  };
  totalDuration: number; // auto-calculated
  createdBy: string; // User ID
  createdAt: Date;
  status: 'draft' | 'published';
}
```

### Game
```typescript
{
  id: string;
  teamId: string;
  opponent: string;
  date: Date;
  time: string;
  venue: string;
  homeAway: 'home' | 'away';
  status: 'scheduled' | 'completed' | 'cancelled';
  lineup?: string[]; // Player IDs
  score?: {
    team: number;
    opponent: number;
  };
  notes?: string;
}
```

### Event
```typescript
{
  id: string;
  type: 'training' | 'match' | 'meeting' | 'social';
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  location: string;
  teamId?: string; // optional, for team-specific events
  attendees: {
    userId: string;
    status: 'going' | 'not_going' | 'maybe' | 'no_response';
  }[];
  createdBy: string; // User ID
}
```

### Message
```typescript
{
  id: string;
  conversationId: string;
  senderId: string; // User ID
  recipientIds: string[]; // User IDs (can be multiple for group chat)
  content: string;
  attachments?: {
    filename: string;
    url: string;
    type: string;
  }[];
  timestamp: Date;
  readBy: {
    userId: string;
    readAt: Date;
  }[];
}
```

### Announcement
```typescript
{
  id: string;
  title: string;
  content: string; // rich text/HTML
  authorId: string; // User ID
  priority: 'high' | 'normal';
  audience: 'all' | 'coaches' | 'players' | 'caregivers';
  publishDate: Date;
  expirationDate?: Date;
  isPinned: boolean;
  status: 'draft' | 'published';
  createdAt: Date;
}
```

### Resource
```typescript
{
  id: string;
  title: string;
  description?: string;
  category: string;
  type: 'video' | 'pdf' | 'link' | 'image';
  url: string;
  tags: string[];
  uploadedBy: string; // User ID
  uploadedAt: Date;
}
```

---

## Technical Stack Recommendations

### Frontend
- **Framework:** React with TypeScript
- **Routing:** React Router (data mode pattern already implemented)
- **Styling:** Tailwind CSS v4
- **UI Components:** shadcn/ui (already integrated in prototype)
- **State Management:** React Context API or Zustand
- **Forms:** React Hook Form
- **Charts:** Recharts (for Reporting dashboard)

### Backend
- **Recommended:** Supabase (PostgreSQL + Authentication + Storage + Real-time)
  - Built-in auth with RBAC
  - Real-time subscriptions for messaging
  - File storage for resources
  - Row-level security policies
  
**Alternative:** Node.js + Express + PostgreSQL + Firebase Auth

### Authentication
- **Supabase Auth** (recommended) or **Firebase Authentication**
- Role-based access control via database policies
- JWT tokens for session management

### Database
- **PostgreSQL** (Supabase provides this)
- Tables align with Data Models above
- Relationships enforced via foreign keys

### File Storage
- **Supabase Storage** or **AWS S3**
- For Resources (PDFs, videos, images)
- Secure, role-based access

### Real-time Features
- **Supabase Realtime** for messaging
- WebSocket connections for live updates

### AI Integration (AI Coach)
- **OpenAI API** (ChatGPT) or **Anthropic Claude**
- Context injection (user role, team info)
- Conversation history storage

---

## Deployment & Infrastructure

### Hosting
- **Frontend:** Netlify (currently used for prototype) or Vercel
- **Backend:** Supabase (managed) or AWS/Railway

### CI/CD
- **GitHub Actions** for automated deployment
- Staging and Production environments

### Monitoring
- **Error tracking:** Sentry
- **Analytics:** Google Analytics or Mixpanel
- **Uptime monitoring:** UptimeRobot

### Security
- **HTTPS** enforced
- **API key management** (environment variables)
- **CORS** properly configured
- **Rate limiting** on API endpoints
- **Input validation** on all forms
- **XSS protection**
- **CSRF tokens** for state-changing operations

### Compliance
- **Data privacy:** Ensure GDPR/local compliance if handling minors' data
- **Terms of Service** and **Privacy Policy** required
- **Parental consent** for players under 13 (if applicable)

---

## Mobile App Considerations

### Native Apps (Optional Future Phase)
If converting to native iOS/Android:
- **React Native** (code reuse from web)
- **Expo** for easier deployment
- Push notifications via Firebase Cloud Messaging
- App Store / Google Play submission

### Progressive Web App (PWA)
The current web app can be enhanced as a PWA:
- Add service workers
- Offline functionality
- Install prompt for home screen
- Push notifications (web-based)

---

## Development Phases (Suggested)

### Phase 1: Foundation (Weeks 1-2)
- Set up Supabase project
- Implement authentication system
- Create user roles and permissions
- Build basic layout (mobile + desktop)

### Phase 2: Core Features (Weeks 3-5)
- Landing Page with announcements
- Schedule with calendar
- Messaging system
- User Management (admin)

### Phase 3: Coaching Features (Weeks 6-8)
- Session Builder (admin)
- Lesson Builder (admin)
- Lessons (mobile)
- Lesson Detail (mobile)
- AI Coach integration

### Phase 4: Additional Features (Weeks 9-10)
- Games management
- Resources library
- Teams Management
- Reporting dashboard

### Phase 5: Testing & Launch (Weeks 11-12)
- QA testing (all roles)
- Performance optimization
- Bug fixes
- User acceptance testing
- Production deployment

---

## Key Business Rules

### Lesson Builder Logic
1. A lesson MUST have exactly 4 session blocks (no more, no less)
2. Block order is FIXED:
   - Block 1: Warm-Up & Technical
   - Block 2: Skill Introduction
   - Block 3: Progressive Development
   - Block 4: Game Application
3. Sessions displayed in dropdowns are **filtered by:**
   - Lesson's age group tags
   - Block type (session type matches block requirement)
4. Total lesson duration = sum of 4 selected sessions' durations

### Session Builder Logic
1. Sessions can be standalone or used in lessons
2. Each session has ONE primary type
3. Sessions can have multiple age group tags
4. Only admins can create/edit sessions and lessons

### Access Control
1. Players and Caregivers see ONLY: Landing, Schedule, Messaging
2. Coaches and Managers see FULL mobile version (6 areas)
3. Admins see ALL features (desktop adds 6 admin-only areas)
4. Desktop admin features NOT available on mobile (intentionally)

### Announcements
1. High-priority announcements appear at top
2. Pinned announcements stay above unpinned
3. Expired announcements auto-hide from Landing Page
4. Admins can target specific audiences

---

## Files Reference

### Mobile Components
- `/src/app/components/pages/Landing.tsx` - Landing Page
- `/src/app/components/pages/AICoach.tsx` - AI Coach
- `/src/app/components/pages/Lessons.tsx` - Lessons library
- `/src/app/components/pages/LessonDetail.tsx` - Lesson detail view
- `/src/app/components/pages/Games.tsx` - Games management
- `/src/app/components/pages/Resources.tsx` - Resources library
- `/src/app/components/pages/Schedule.tsx` - Calendar/events
- `/src/app/components/pages/Messaging.tsx` - Team messaging

### Desktop Admin Components
- `/src/app/components/desktop/DesktopLanding.tsx` - Desktop landing
- `/src/app/components/desktop/DesktopCoaching.tsx` - Desktop coaching
- `/src/app/components/desktop/DesktopGames.tsx` - Desktop games
- `/src/app/components/desktop/DesktopResources.tsx` - Desktop resources
- `/src/app/components/desktop/DesktopSchedule.tsx` - Desktop schedule
- `/src/app/components/desktop/DesktopMessaging.tsx` - Desktop messaging
- `/src/app/components/desktop/SessionBuilder.tsx` - Session builder
- `/src/app/components/desktop/LessonBuilder.tsx` - Lesson builder
- `/src/app/components/desktop/TeamsManagement.tsx` - Teams management
- `/src/app/components/desktop/UserManagement.tsx` - User management
- `/src/app/components/desktop/Reporting.tsx` - Reporting dashboard
- `/src/app/components/desktop/Announcements.tsx` - Announcements manager

### Layout Components
- `/src/app/components/MainLayout.tsx` - Mobile layout shell
- `/src/app/components/DesktopLayout.tsx` - Desktop layout shell
- `/src/app/components/WelcomeScreen.tsx` - Initial splash screen
- `/src/app/components/LoginScreen.tsx` - Login form

### Routing
- `/src/app/routes.tsx` - React Router configuration

### Styling
- `/src/styles/theme.css` - CSS custom properties, Tailwind v4 tokens
- `/src/styles/fonts.css` - Font imports (Aktiv Grotesk Corp, Exo 2.0)

---

## Testing Checklist

### Authentication Testing
- [ ] Login with each role (player, caregiver, coach, manager, admin)
- [ ] Verify correct navigation appears for each role
- [ ] Test logout functionality
- [ ] Test password reset flow
- [ ] Test session expiration

### Mobile Testing (All Roles)
- [ ] Landing Page displays announcements
- [ ] Schedule shows events correctly
- [ ] Messaging sends/receives messages
- [ ] Calendar RSVP functionality

### Mobile Testing (Full Version)
- [ ] AI Coach chat interface works
- [ ] Lessons filter and display correctly
- [ ] Lesson Detail shows 4 blocks with sessions
- [ ] Games list and details
- [ ] Resources library accessible

### Desktop Admin Testing
- [ ] All 12 navigation items appear
- [ ] Session Builder creates/edits sessions
- [ ] Lesson Builder creates lessons with 4 blocks
- [ ] Session dropdown filtering works (age group + block type)
- [ ] Total duration auto-calculates
- [ ] Teams Management CRUD operations
- [ ] User Management role assignment
- [ ] Reporting dashboard displays data
- [ ] Announcements publish to Landing Page

### Responsive Testing
- [ ] Mobile view (iPhone, Android)
- [ ] Tablet view
- [ ] Desktop view (various screen sizes)
- [ ] Navigation adapts correctly

### Performance Testing
- [ ] Page load times < 2 seconds
- [ ] Image optimization
- [ ] Database query optimization
- [ ] Real-time messaging latency

---

## Known Design Decisions

1. **Session Builder before Lesson Builder** in navigation (recent change)
2. **Progress indicators at 80%** for both builders (temporary UI element)
3. **Gannet bird graphics** instead of full shield logo
4. **Desktop-only admin features** (intentional - mobile is for field use)
5. **4 fixed lesson blocks** (non-negotiable structure)
6. **Announcements as 12th area** (most recent addition)

---

## Contact & Support

**Prototype GitHub:** https://github.com/Mikebrooke65/coaching-app-prototype  
**Client Contact:** [Client details to be added]  
**Design System:** West Coast Rangers FC brand guidelines (separate document)

---

## Appendix: AI Coach Prompting Strategy

### System Prompt for AI Coach
```
You are an expert football (soccer) coaching assistant for West Coast Rangers FC.
You provide advice for junior coaches working with age groups U6 through U18.

User Context:
- Role: {user.role}
- Team: {team.ageGroup}
- Experience Level: {user.experienceLevel}

Your responses should:
- Be practical and age-appropriate
- Reference relevant drills from the Resources library when applicable
- Encourage positive coaching methods
- Prioritize player safety and fun
- Align with West Coast Rangers FC philosophy

Keep responses concise and actionable.
```

### Example Queries
- "What's a good warm-up for U10s?"
- "How do I teach passing to beginners?"
- "My team loses focus after 20 minutes, what should I do?"

### Integration Points
- Can reference Sessions library (suggest specific sessions)
- Can link to Resources (drills, videos)
- Store conversation history per user

---

## Component State Management

### Global State Requirements

**User Session State:**
```typescript
{
  currentUser: User | null;
  isAuthenticated: boolean;
  userRole: 'player' | 'caregiver' | 'coach' | 'manager' | 'admin';
  assignedTeams: Team[];
}
```

**Recommended Approach:** React Context API or Zustand

### Example: Authentication Context
```typescript
// AuthContext.tsx
interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

// Used throughout app to:
// - Show/hide navigation items based on role
// - Filter data by team assignment
// - Control feature access
```

### Data Flow Examples

**Lesson Builder → Lessons (Mobile):**
1. Admin creates lesson in `LessonBuilder.tsx` (desktop)
2. Saves to Supabase `lessons` table with `status: 'published'`
3. Mobile `Lessons.tsx` fetches published lessons via API
4. Filters applied client-side or server-side
5. User taps lesson → navigates to `LessonDetail.tsx` with lesson ID
6. Detail page fetches lesson + populates 4 session blocks

**Announcements → Landing Page:**
1. Admin creates announcement in `Announcements.tsx` (desktop)
2. Sets priority, audience, publish date
3. Saves to `announcements` table
4. All users' `Landing.tsx` fetches announcements WHERE:
   - `status = 'published'`
   - `publishDate <= NOW()`
   - `expirationDate > NOW() OR NULL`
   - `audience = 'all' OR audience = currentUser.role`
5. Displays sorted by: pinned first, then priority, then date

---

## API Endpoint Specifications

### Recommended Architecture
- **REST API** with Supabase PostgreSQL backend
- **Row-level security (RLS)** policies enforce permissions
- **Real-time subscriptions** for messaging

### Core Endpoints

#### Authentication
```
POST   /auth/login
POST   /auth/logout
POST   /auth/reset-password
GET    /auth/me (get current user)
```

#### Users
```
GET    /users (admin only - with filters)
GET    /users/:id
POST   /users (admin only - create user)
PUT    /users/:id (admin only)
DELETE /users/:id (admin only)
PATCH  /users/:id/status (activate/deactivate)
```

#### Teams
```
GET    /teams (filtered by user role)
GET    /teams/:id
POST   /teams (admin only)
PUT    /teams/:id (admin only)
DELETE /teams/:id (admin only)
POST   /teams/:id/players (add player to roster)
DELETE /teams/:id/players/:playerId
```

#### Sessions
```
GET    /sessions (with filters: ageGroup, type, duration)
GET    /sessions/:id
POST   /sessions (admin only)
PUT    /sessions/:id (admin only)
DELETE /sessions/:id (admin only)
PATCH  /sessions/:id/publish
```

#### Lessons
```
GET    /lessons (with filters: ageGroup, skillLevel, focusArea)
GET    /lessons/:id (includes populated session blocks)
POST   /lessons (admin only)
PUT    /lessons/:id (admin only)
DELETE /lessons/:id (admin only)
PATCH  /lessons/:id/publish
```

#### Announcements
```
GET    /announcements (filtered by audience + date)
GET    /announcements/:id
POST   /announcements (admin only)
PUT    /announcements/:id (admin only)
DELETE /announcements/:id (admin only)
PATCH  /announcements/:id/pin
```

#### Games
```
GET    /games (filtered by team + date range)
GET    /games/:id
POST   /games (coach/admin)
PUT    /games/:id (coach/admin)
DELETE /games/:id (admin only)
PATCH  /games/:id/lineup (update lineup)
PATCH  /games/:id/result (record score)
```

#### Events (Schedule)
```
GET    /events (filtered by team + date range)
GET    /events/:id
POST   /events (coach/admin)
PUT    /events/:id (coach/admin)
DELETE /events/:id (coach/admin)
PATCH  /events/:id/rsvp (user marks attendance)
```

#### Messages
```
GET    /messages/conversations (user's conversations)
GET    /messages/conversations/:id (message thread)
POST   /messages (create new message)
POST   /messages/:id/read (mark as read)
POST   /messages/conversations (create new conversation)
```

#### Resources
```
GET    /resources (with filters: category, type, tags)
GET    /resources/:id
POST   /resources (admin only - with file upload)
DELETE /resources/:id (admin only)
POST   /resources/:id/favorite (user bookmarks)
```

#### Reporting (Admin)
```
GET    /reports/user-activity (date range, role filters)
GET    /reports/attendance (team, date range)
GET    /reports/lesson-usage (popular lessons)
GET    /reports/engagement-metrics
```

### Response Format
```typescript
// Success
{
  success: true;
  data: any;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}

// Error
{
  success: false;
  error: {
    code: string;
    message: string;
  };
}
```

### Authentication
- **Bearer token** in Authorization header
- JWT with user ID + role embedded
- Token expiration: 24 hours (refresh token: 30 days)

---

## Visual Reference & Wireframes

### Prototype Access
- **Live Demo:** [Netlify URL - to be added after deployment]
- **GitHub Repository:** https://github.com/Mikebrooke65/coaching-app-prototype
- **Figma Design Files:** [Link to be provided by client]

### Screenshot Reference
Recommended to capture screenshots of:
1. **Mobile views** - all 6 main areas (both roles)
2. **Desktop admin** - all 12 areas
3. **Key interactions:**
   - Lesson Builder form with 4 blocks
   - Session filtering in action
   - Collapsible lesson entries
   - Navigation differences by role

**Suggestion:** Create a `/screenshots` folder in GitHub with organized images:
```
/screenshots
  /mobile
    /lite-version (player/caregiver)
    /full-version (coach/manager)
  /desktop
    /admin-features
  /flows
    /lesson-creation-flow
    /login-flow
```

### Design System Export
- All UI components available in `/src/app/components/ui/` (shadcn/ui)
- Color tokens in `/src/styles/theme.css`
- Typography in `/src/styles/fonts.css`

---

## Edge Cases & Error Handling

### User Management Edge Cases

**Coach with No Teams:**
- Display: "No teams assigned. Contact your administrator."
- Limit access to team-specific features (Games shows empty state)
- Schedule shows only club-wide events

**Player with Multiple Teams:**
- Allow selection in dropdown (e.g., plays U12 and U13)
- Schedule combines events from all teams
- Messages accessible for all team groups

**Inactive User Login:**
- Block login with message: "Your account is inactive. Contact support."
- Admin can reactivate via User Management

**Role Change Mid-Session:**
- Force logout and require re-login
- Display notification: "Your account permissions have changed"

### Lesson Builder Edge Cases

**Session Deleted While In Use:**
- Lesson shows warning: "One or more sessions unavailable"
- Allow admin to replace missing session
- Mark lesson as "needs review"

**No Sessions Match Filter:**
- Display: "No sessions available for this age group and block type"
- Suggest: "Create a new session in Session Builder"
- Allow admin to temporarily skip block (save as draft)

**Duration Calculation:**
- If session duration updated, recalculate all lessons using it
- Flag affected lessons for admin review

### Schedule & Events Edge Cases

**Event in Past:**
- Show in "Past Events" section
- Attendance locked (cannot change RSVP)
- Display actual attendance count

**Conflicting Events:**
- Warn user when RSVPing if another event at same time
- Allow manual override ("I can attend both")

**Event Cancellation:**
- Send notification to all RSVP'd users
- Mark event as cancelled (don't delete - for records)

### Messaging Edge Cases

**User Removed from Team:**
- Retain message history (compliance)
- Block sending new messages to that team chat
- Show note: "You are no longer part of this team"

**Blocked or Inactive User:**
- Messages remain in conversation (audit trail)
- Cannot send new messages to/from inactive users

**File Upload Failures:**
- Show error: "File too large (max 10MB)" or "Invalid file type"
- Allow retry
- Save message without attachment if user chooses

### Authentication Edge Cases

**Expired Session:**
- Auto-redirect to login
- Preserve intended destination
- After login, redirect back to original page

**Concurrent Logins:**
- Allow (same user, multiple devices)
- Sync state via real-time subscriptions
- Optional: Admin setting to restrict to single session

**Password Reset Token Expired:**
- Clear message: "This reset link has expired. Request a new one."
- Provide button to request new reset email

### Data Validation

**Form Submissions:**
- Client-side validation (immediate feedback)
- Server-side validation (security)
- Display field-specific errors
- Disable submit button while processing

**Required Fields:**
- Mark with asterisk (*)
- Prevent submission if empty
- Clear error messages

**Date/Time Inputs:**
- Validate future dates for events
- Check for logical date ranges (end > start)
- Handle timezone considerations

### Network & Performance

**Offline Mode:**
- Display: "No internet connection"
- Queue messages/actions for retry when online
- Show cached data with timestamp

**Slow Network:**
- Loading skeletons for data fetching
- Timeout after 30 seconds with retry option
- Optimistic UI updates where safe

**Large Data Sets:**
- Pagination (20-50 items per page)
- Virtual scrolling for long lists
- Lazy loading images

### Permissions Errors

**Unauthorized Access:**
- 403 error → "You don't have permission to access this"
- Redirect to appropriate home page
- Log attempt for security monitoring

**Deleted Resource:**
- 404 error → "This item no longer exists"
- Remove from cached lists
- Offer "Go Back" option

---

**End of Handover Document**

Last Updated: March 4, 2026