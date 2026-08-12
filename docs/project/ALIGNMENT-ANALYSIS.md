# Requirements vs Figma Handover - Alignment Analysis

**Date:** March 4, 2026  
**Purpose:** Identify gaps, conflicts, and alignment issues between the original requirements document and the Figma handover specifications

---

## Executive Summary

### Overall Assessment
The Figma handover and requirements document are **largely aligned** but have some important differences that need resolution before development proceeds.

### Key Findings
- ✅ **Aligned:** User roles, authentication, core features
- ⚠️ **Partial Alignment:** Navigation structure, feature naming
- ❌ **Conflicts:** Technology stack, some feature specifications
- 📝 **Gaps:** New features in Figma not in requirements

---

## Detailed Comparison

### 1. User Roles & Permissions

#### ✅ ALIGNED
Both documents define the same 5 roles:
- Player (Lite version)
- Caregiver (Lite version)
- Coach (Full version)
- Manager (Full version)
- Admin (Full version + Desktop)

**No action needed.**

---

### 2. Technology Stack

#### ❌ CONFLICT

**Requirements Document:**
- Mobile: .NET MAUI (iOS/Android)
- Desktop: Azure Static Web App
- Database: Azure Table Storage
- Storage: Azure Blob Storage

**Figma Handover:**
- Current implementation: React + Vite
- Deployed on: Netlify
- Database: Not specified
- Storage: Not specified

**DECISION REQUIRED:**
1. Continue with React/Netlify (current prototype)?
2. Migrate to .NET MAUI + Azure (original requirements)?
3. Hybrid approach?

**Recommendation:** Stick with React/Netlify for Version 1.0 trial, consider migration later if needed.

---

### 3. Navigation & Feature Areas

#### ⚠️ PARTIAL ALIGNMENT

**Requirements Document - 6 Main Areas:**
1. Landing Page
2. Coaching Area
3. Games Area
4. Resources Area
5. Schedule Area
6. Messaging Area

**Figma Handover - Mobile (6 Areas):**
1. Landing ✅
2. Coaching (with 3 sub-pages: AI Coach, Lessons, Lesson Detail) ⚠️
3. Games ✅
4. Resources ✅
5. Schedule ✅
6. Messaging ✅

**Figma Handover - Desktop Admin (12 Areas):**
1. Landing ✅
2. Coaching ✅
3. Games ✅
4. Resources ✅
5. Schedule ✅
6. Messaging ✅
7. Session Builder ✅
8. Lesson Builder ✅
9. Teams Management ✅
10. User Management ✅
11. Reporting 📝 NEW
12. Announcements 📝 NEW

**Issues:**
- Figma adds "AI Coach" sub-feature not in requirements
- Figma adds "Reporting" area not in requirements
- Figma adds separate "Announcements" admin area (requirements had it embedded in Landing Page management)

**Action:** Decide if AI Coach, Reporting, and Announcements admin area are in scope for Version 1.0 trial.

---

### 4. Coaching Area Structure

#### ⚠️ DIFFERENT STRUCTURE

**Requirements:**
- Single "Coaching Area" for browsing and managing lesson deliveries
- Lessons composed of 4 Session Plans

**Figma:**
- "Coaching" section with 3 sub-pages:
  1. AI Coach (NEW)
  2. Lessons (browse)
  3. Lesson Detail (view)

**Figma Lesson Structure:**
- 4 Session Blocks (matches requirements):
  1. Warm-Up & Technical
  2. Skill Introduction
  3. Progressive Development
  4. Game Application

**Issue:** Requirements don't mention AI Coach feature.

**Action:** Confirm if AI Coach is required for Version 1.0 or future release.

---

### 5. Session & Lesson Terminology

#### ✅ MOSTLY ALIGNED

**Requirements:**
- Session Plan = 20-minute training activity
- Lesson = 4 Session Plans combined

**Figma:**
- Session = individual training activity (matches Session Plan)
- Lesson = 4 Sessions combined (matches)
- Uses "Session Blocks" terminology for the 4 parts

**No major issues, just terminology clarification needed.**

---

### 6. Announcements Management

#### ⚠️ DIFFERENT APPROACH

**Requirements:**
- Announcements managed through Admin Site
- Two types: General and Team-Specific
- Auto-expire after 7 days
- Displayed on Landing Page

**Figma:**
- Separate "Announcements" admin area (12th desktop feature)
- Announcement feed/cards on Landing Page
- No mention of auto-expiry or team-specific targeting

**Action:** Clarify announcement requirements - use requirements doc spec or Figma design?

---

### 7. AI Coach Feature

#### 📝 NEW IN FIGMA

**Not in Requirements Document**

**Figma Specification:**
- Chat interface with AI
- Coaching tips and suggestions
- Drill recommendations
- Q&A functionality
- Requires LLM integration (ChatGPT/Claude)

**Action:** Decide if this is in scope for Version 1.0 trial (PROJECT-ROLLOUT.md says NO AI in Version 1.0).

**Recommendation:** Defer to future release per rollout plan.

---

### 8. Reporting Feature

#### 📝 NEW IN FIGMA

**Not in Requirements Document**

**Figma:** Listed as 11th desktop admin area, but no detailed specification provided in handover.

**Action:** Get specifications for Reporting feature or defer to future release.

**Recommendation:** Defer to future release (not in Version 1.0 trial scope).

---

### 9. Session Builder & Lesson Builder

#### ✅ ALIGNED

Both documents describe:
- Session Builder: Create individual 20-minute sessions
- Lesson Builder: Combine 4 sessions into lessons
- Admin-only desktop features
- Searchable/filterable libraries

**Figma adds UI details:**
- Left panel (library) + Right panel (builder) layout
- Specific filter options
- Collapsible entries
- Progress indicators (80% complete)

**No conflicts, Figma provides implementation details.**

---

### 10. Teams & User Management

#### ✅ ALIGNED

Both documents cover:
- Team creation and management
- User account management
- Coach-team associations
- Player-caregiver relationships

**Figma adds:**
- Bulk import (CSV upload) for teams
- More detailed UI specifications

**No conflicts.**

---

### 11. Schedule & Messaging

#### ✅ ALIGNED

Both documents describe similar features:
- Calendar/schedule with events
- RSVP/attendance tracking
- Team messaging
- Direct messages and group chats

**Figma adds:**
- Calendar view options (month/week/day)
- Personal calendar sync (optional)
- Read receipts
- File attachments

**No conflicts, Figma provides more detail.**

---

### 12. Games Area

#### ✅ MOSTLY ALIGNED

**Requirements:**
- Game feedback using 4 Moments of Football framework
- WWW (What Went Well) and EBI (Even Better If)

**Figma:**
- Match/game management
- Team lineup management
- Match statistics
- Opposition notes

**Issue:** Figma doesn't explicitly mention 4 Moments framework or WWW/EBI structure.

**Action:** Ensure Games area implements 4 Moments framework per requirements.

---

### 13. Resources Area

#### ✅ ALIGNED

Both describe:
- Coaching materials library
- Categorized resources
- Search and filter
- Admin file upload

**No conflicts.**

---

## Critical Decisions Needed

### 1. Technology Stack
**Question:** Continue with React/Netlify or migrate to .NET MAUI/Azure?
**DECISION:** ✅ React/Netlify - Figma was for UI/UX prototype only. Continue with current stack.

### 2. AI Coach Feature
**Question:** Include AI Coach in Version 1.0?
**DECISION:** ✅ NO - defer per PROJECT-ROLLOUT.md (no AI in Version 1.0)

### 3. Reporting Feature
**Question:** Include Reporting in Version 1.0?
**DECISION:** ✅ YES - Add to requirements document as part of admin desktop app
**ACTION REQUIRED:** Add Reporting requirements specification

### 4. Announcements Admin Area
**Question:** Separate admin area or embedded in Landing Page management?
**DECISION:** ✅ Follow requirements doc (embedded in Landing Page management), use Figma UI design

### 5. Games Area - 4 Moments Framework
**Question:** Ensure Figma design implements 4 Moments framework?
**DECISION:** ✅ YES - Requirements are correct. Awaiting confirmation from football team. Prototype intentionally left this section blank.

---

## Recommendations for Version 1.0 Trial

### Include (Aligned Features):
1. ✅ Authentication & user roles
2. ✅ Landing Page with announcements
3. ✅ Coaching: Lessons browse and detail (NO AI Coach)
4. ✅ Games with 4 Moments framework
5. ✅ Resources library
6. ✅ Schedule with RSVP
7. ✅ Messaging
8. ✅ Session Builder (admin desktop)
9. ✅ Lesson Builder (admin desktop)
10. ✅ Teams Management (admin desktop)
11. ✅ User Management (admin desktop)
12. ✅ Reporting (admin desktop) - NEEDS REQUIREMENTS SPEC

### Defer to Future Releases:
1. ❌ AI Coach (not in Version 1.0 scope per rollout plan)

### Clarify Before Development:
1. ⚠️ Games area 4 Moments framework details (awaiting club confirmation)

---

## Next Steps

1. **Review this analysis** with stakeholders
2. **Make decisions** on critical questions above
3. **Update requirements document** to reflect decisions
4. **Update Figma handover** if needed
5. **Create aligned specification** for Version 1.0 development
6. **Update PROJECT-ROLLOUT.md** with final scope

---

## Summary

The requirements and Figma handover are **80% aligned**. Main issues are:
- New features in Figma (AI Coach, Reporting) not in requirements
- Technology stack mismatch (React vs .NET MAUI)
- Some structural differences in feature organization

**Recommended approach:** Use requirements document as source of truth for features, use Figma handover for UI/UX implementation details, defer new features to post-trial releases.
