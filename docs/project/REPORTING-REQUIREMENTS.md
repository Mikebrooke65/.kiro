# Reporting Requirements Summary

## Overview
This document consolidates all reporting requirements identified across the project specifications. These reports are designed for Admin users to monitor coaching activities, assess content effectiveness, and make data-driven decisions.

---

## Report Categories

### 1. Lesson Delivery Reports

#### 1.1 Lesson Delivery Summary
**Purpose:** Monitor which lessons are being delivered across teams

**Data Points:**
- Lesson name
- Skill category
- Coach name
- Team name
- Age group
- Date delivered
- Lesson version
- Notes (optional)

**Filters:**
- Date range
- Team
- Coach
- Age group (U4-U17)
- Skill category

**Export Formats:** CSV, PDF

**Source:** Technical Foundation Requirements - Requirement 14, Football Coaching App Requirements - Requirement 12

---

#### 1.2 Lesson Effectiveness Report
**Purpose:** Assess which lessons are most effective based on coach feedback

**Data Points:**
- Lesson name
- Average rating (0-5)
- Number of deliveries
- Number of feedback submissions
- Feedback comments (aggregated)
- Skill category
- Age group

**Filters:**
- Date range
- Age group
- Skill category
- Minimum number of deliveries

**Calculations:**
- Average rating across all deliveries
- Delivery count
- Feedback submission rate

**Export Formats:** CSV

**Source:** Technical Foundation Requirements - Requirement 14

---

### 2. Session Feedback Reports

#### 2.1 Session Ratings Report
**Purpose:** Identify which sessions are working well and which need improvement

**Data Points:**
- Session name
- Session type (warmup, skill_intro, progressive, game)
- Average rating (0-5)
- Number of times delivered
- Number of feedback submissions
- Comments (aggregated)

**Filters:**
- Date range
- Session type
- Age group
- Skill category

**Export Formats:** CSV

**Source:** Technical Foundation Requirements - Requirement 14, Football Coaching App Requirements - Requirement 10c

---

#### 2.2 Session Popularity Report
**Purpose:** Understand which sessions are most frequently used

**Data Points:**
- Session name
- Session type
- Number of times used in lessons
- Number of times delivered
- Age groups using the session
- Last delivered date

**Filters:**
- Date range
- Session type
- Age group

**Export Formats:** CSV, PDF

**Source:** Football Coaching App Requirements - Requirement 17c

---

### 3. Coach Activity Reports

#### 3.1 Coach Activity Summary
**Purpose:** Monitor coaching engagement and identify coaches who may need support

**Data Points:**
- Coach name
- Number of lessons delivered
- Number of game feedback entries
- Date range
- Teams coached
- Last activity date

**Filters:**
- Date range
- Age group
- Specific coaches
- Team

**Calculations:**
- Average lessons per coach
- Average game feedback per coach
- Activity trend (increasing/decreasing)

**Export Formats:** CSV, PDF

**Source:** Technical Foundation Requirements - Requirement 14, Football Coaching App Requirements - Requirement 17a

---

### 4. Team Reports

#### 4.1 Team Training History Report
**Purpose:** Ensure balanced skill development and identify training gaps

**Data Points:**
- Team name
- Age group
- Lesson name
- Skill category
- Date delivered
- Coach name
- Lesson version

**Grouping:**
- By skill category to show coverage
- Highlight skills not trained within specified period (e.g., 30 days)

**Filters:**
- Team
- Age group
- Date range
- Skill category

**Export Formats:** CSV, PDF

**Source:** Football Coaching App Requirements - Requirement 17b

---

### 5. Game Feedback Reports

#### 5.1 Game Feedback by Team
**Purpose:** View post-match analysis using the 4 Moments framework

**Data Points:**
- Team name
- Date
- Opponent (if applicable)
- Coach name
- 4 Moments feedback:
  - Attacking (WWW, EBI)
  - Transition: Attack to Defend (WWW, EBI)
  - Defending (WWW, EBI)
  - Transition: Defend to Attack (WWW, EBI)
- Key areas for improvement
- Overall comments

**Organization:**
- Chronological order (most recent first)
- Grouped by team

**Filters:**
- Date range
- Team
- Coach
- Age group

**Export Formats:** CSV, PDF

**Source:** Technical Foundation Requirements - Requirement 14, Football Coaching App Requirements - Requirement 17

---

### 6. User Management Reports

#### 6.1 Lite Users Report
**Purpose:** Track mid-season players who haven't completed full registration

**Data Points:**
- User name
- Email
- Team name
- Date added
- Days since creation
- Invitation status
- User type (lite/full)

**Actions:**
- Promote to full user
- Resend invitation

**Filters:**
- Team
- Days since creation
- User type

**Export Formats:** CSV

**Source:** User Role Management Requirements - Requirement 5

---

## Common Report Features

### Standard Filters (Available on Most Reports)
- Date range (from/to)
- Team
- Age group
- Coach

### Standard Export Options
- CSV format (for data analysis)
- PDF format (for printing/sharing)

### Performance Requirements
- Reports should load within 2 seconds for date ranges up to 1 year
- Export generation should complete within 5 seconds for up to 1000 records

### Access Control
- All reports are Admin-only
- Reports respect RLS policies at the database level
- Audit trail: Log when reports are generated and by whom

---

## Implementation Priority

### Phase 1: Essential Reports (High Priority)
1. Lesson Delivery Summary
2. Coach Activity Summary
3. Team Training History Report

### Phase 2: Feedback Analysis (Medium Priority)
4. Lesson Effectiveness Report
5. Session Ratings Report
6. Game Feedback by Team

### Phase 3: Advanced Analytics (Lower Priority)
7. Session Popularity Report
8. Lite Users Report

---

## Technical Considerations

### Data Sources
- `lessons` table
- `sessions` table
- `delivery_records` table
- `lesson_feedback` table
- `session_feedback` table
- `game_feedback` table
- `users` table
- `teams` table
- `team_members` table

### Query Optimization
- Use database views for complex aggregations
- Implement caching for frequently accessed reports
- Consider read replicas for reporting queries (future)
- Add indexes on commonly filtered columns (date, team_id, coach_id)

### UI Components
- Reusable filter panel component
- Reusable export button component
- Reusable data table with sorting
- Date range picker
- Loading states and error handling

---

## Next Steps

1. Create a spec for the Reporting feature using spec-driven development
2. Design the database views and queries needed
3. Build reusable UI components for filters and exports
4. Implement reports in priority order
5. Add unit tests for report calculations
6. Add integration tests for report generation
