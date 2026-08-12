# Lesson Delivery and Feedback Specification

## Overview
Add lesson delivery tracking and session feedback functionality to the LessonDetail page, following Requirements.md (Requirement 6 & 7) and Figma design.

## Database Schema (Already Exists)

### lesson_deliveries table
- id (UUID)
- lesson_id (UUID) → lessons
- team_id (UUID) → teams
- coach_id (UUID) → users
- delivery_date (DATE) - When lesson was delivered
- is_locked (BOOLEAN) - Prevents further edits
- created_at, updated_at

### session_deliveries table
- id (UUID)
- lesson_delivery_id (UUID) → lesson_deliveries
- session_id (UUID) → sessions
- delivered (BOOLEAN)
- rating (INTEGER 0-5) - Likert scale
- feedback (TEXT) - Optional comments
- delivered_at (TIMESTAMPTZ)
- created_at, updated_at

## User Flow

### Step 1: View Lesson (Current State)
- Coach views lesson detail page
- Sees all 4 sessions with content
- NO delivery date set yet
- NO feedback forms visible

### Step 2: Set Delivery Date
**UI Component**: Button at top of page
- Label: "Mark as Delivered"
- Opens modal/dialog
- Fields:
  - Team selector (dropdown of coach's teams)
  - Delivery date picker (defaults to today)
  - Confirm button
- On confirm:
  - Creates lesson_delivery record
  - Creates 4 session_delivery records (one per session)
  - Refreshes page to show feedback forms

### Step 3: Provide Session Feedback
**UI Component**: Feedback form per session (appears after delivery date set)
- Position: Below each session content block
- Fields:
  - Rating: 0-5 star selector (required)
    - 0 = Not delivered
    - 1 = Poor
    - 2 = Below average
    - 3 = Average
    - 4 = Good
    - 5 = Excellent
  - Feedback: Text area (optional, max 500 chars)
  - "Save Feedback" button
- Validation:
  - Can only submit if delivery_date exists
  - Rating is required (0-5)
  - Feedback is optional
- On save:
  - Updates session_delivery record
  - Shows success message
  - Keeps form visible for editing

### Step 4: Lock Delivery (Optional)
**UI Component**: Button at top of page (appears after delivery date set)
- Label: "Lock Feedback"
- Confirmation dialog: "Are you sure? You won't be able to edit feedback after locking."
- On confirm:
  - Sets is_locked = true on lesson_delivery
  - Disables all feedback forms
  - Changes button to "Locked" (disabled state)

## UI Layout Changes

### Header Section (Add)
```
[Back Button]

[Lesson Title]
[Age Group] [Level] [Duration] [Skill Category]

[Delivery Status Badge]  [Mark as Delivered Button] [Lock Button]
                         (or "Delivered: Mar 9, 2026")

[Print] [Share] [Favorite]
```

### Session Block (Add Feedback Section)
```
[Session Number] [Session Title]
[Duration] • [Session Type]

[Pitch Diagram]
[How It Runs]
[Equipment]
[Coaching Points]
[Steps]
[Player Learning Objectives]

--- NEW SECTION BELOW ---

[Session Feedback] (only if delivery_date exists)
  Rating: [0] [1] [2] [3] [4] [5] (star icons)
  Feedback: [Text area]
  [Save Feedback Button]
  
  (if locked: show read-only view)
```

## Component State

```typescript
interface LessonDelivery {
  id: string;
  delivery_date: string;
  is_locked: boolean;
  team_id: string;
  team_name: string; // for display
}

interface SessionFeedback {
  session_id: string;
  rating: number | null; // 0-5
  feedback: string | null;
  session_delivery_id: string;
}

// Add to existing Lesson interface
interface Lesson {
  // ... existing fields
  delivery?: LessonDelivery; // null if not delivered yet
  session_feedbacks: SessionFeedback[]; // array of 4
}
```

## API Calls

### Fetch Lesson with Delivery (Modified)
```typescript
// 1. Fetch lesson + sessions (existing)
// 2. Check if delivery exists for this lesson + current team
const { data: delivery } = await supabase
  .from('lesson_deliveries')
  .select(`
    id,
    delivery_date,
    is_locked,
    team:teams(id, name),
    session_deliveries(
      id,
      session_id,
      rating,
      feedback
    )
  `)
  .eq('lesson_id', lessonId)
  .eq('team_id', selectedTeamId)
  .single();
```

### Create Delivery
```typescript
// 1. Insert lesson_delivery
const { data: delivery } = await supabase
  .from('lesson_deliveries')
  .insert({
    lesson_id: lessonId,
    team_id: teamId,
    coach_id: user.id,
    delivery_date: selectedDate,
  })
  .select()
  .single();

// 2. Insert 4 session_deliveries
const sessionDeliveries = lesson.sessions.map(session => ({
  lesson_delivery_id: delivery.id,
  session_id: session.id,
  delivered: false,
  rating: null,
  feedback: null,
}));

await supabase
  .from('session_deliveries')
  .insert(sessionDeliveries);
```

### Update Session Feedback
```typescript
await supabase
  .from('session_deliveries')
  .update({
    rating: rating,
    feedback: feedback,
    delivered: rating > 0, // Mark as delivered if rated
    delivered_at: rating > 0 ? new Date().toISOString() : null,
  })
  .eq('id', sessionDeliveryId);
```

### Lock Delivery
```typescript
await supabase
  .from('lesson_deliveries')
  .update({ is_locked: true })
  .eq('id', deliveryId);
```

## Validation Rules

1. Cannot set delivery date without selecting a team
2. Cannot provide feedback without delivery date
3. Rating must be 0-5 (0 = not delivered)
4. Cannot edit feedback if is_locked = true
5. Cannot delete delivery if is_locked = true
6. Feedback text max 500 characters

## UI States

### Not Delivered
- Show "Mark as Delivered" button
- No feedback forms visible
- Can view lesson content only

### Delivered (Not Locked)
- Show delivery date badge
- Show "Lock Feedback" button
- Show feedback forms (editable)
- Can save/update feedback

### Delivered (Locked)
- Show delivery date badge
- Show "Locked" badge (disabled)
- Show feedback forms (read-only)
- Cannot edit anything

## Mobile Responsive Considerations

- Modal for delivery date: Full screen on mobile
- Star rating: Large touch targets (min 44x44px)
- Text area: Comfortable typing size
- Buttons: Full width on mobile

## Next Steps

1. Review this spec against Figma design
2. Confirm UI layout and flow
3. Implement in LessonDetail.tsx
4. Test with real data
5. Add to Coaching page (show delivered lessons in "Past Lessons")

