# Typography Audit & Inconsistencies

## Current Standards (from theme.css)

### Font Families
- **Headings (h1, h3)**: Inter (substitute for Aktiv Grotesk Corp)
- **Subtitles (h2)**: Exo 2
- **Body text**: Inter (default)
- **Labels, buttons, inputs**: Inherit from body (Inter)

### Default Heading Sizes (from theme.css @layer base)
- **h1**: text-2xl (2rem / 32px), font-weight 700, Inter
- **h2**: text-xl (1.25rem / 20px), font-weight 600, Exo 2
- **h3**: text-lg (1.125rem / 18px), font-weight 600, Inter
- **h4**: text-base (1rem / 16px), font-weight 500

## Inconsistencies Found

### 1. Page Headings — Mixed Sizes
Most pages use `text-2xl font-bold` for h1 (correct), but some vary:

**Correct (text-2xl):**
- Coaching.tsx: `text-2xl font-bold`
- Schedule.tsx: `text-2xl font-bold`
- SubsPage.tsx: `text-2xl font-bold`
- Landing.tsx: `text-2xl font-bold`

**Inconsistent:**
- AICoach.tsx: `text-2xl font-bold` ✅
- Lessons.tsx: `text-2xl font-bold` ✅

### 2. Font Family Overrides — Inline Styles
Some components override the default font family with inline styles:

**MainLayout.tsx (header):**
```tsx
<h1 className="font-bold text-xl" style={{ fontFamily: "'Inter', ..." }}>
```
- Uses `text-xl` instead of `text-2xl`
- Inline font-family override (unnecessary — Inter is default)

**Landing.tsx (announcements):**
```tsx
<h1 className="font-bold text-[30px]" style={{ fontFamily: 'Aktiv Grotesk Corp, Inter, sans-serif' }}>
```
- Uses custom `text-[30px]` instead of standard size
- Inline font-family override

**DesktopLayout.tsx (header):**
```tsx
<h1 className="text-2xl font-bold text-white">Urrah</h1>
```
- Correct ✅

### 3. Section Headings — Inconsistent Weights
Section headings (h2/h3) use mixed font-weight classes:

**font-semibold (600):**
- Coaching.tsx: `font-semibold text-gray-900 text-sm` (section headers)
- DesktopLayout.tsx: `text-xs font-semibold` (nav sections)

**font-bold (700):**
- Coaching.tsx: `font-bold text-lg` (team name)
- Landing.tsx: `font-semibold text-gray-900` (announcements heading)
- Schedule.tsx: `font-semibold text-gray-900 text-sm` (event titles)

**font-medium (500):**
- Various buttons and labels

### 4. Text Sizes — Inconsistent Patterns

**Small text (labels, metadata):**
- `text-xs` (12px) — used for nav labels, metadata, helper text
- `text-sm` (14px) — used for body text, descriptions, subtitles
- `text-[9px]` — custom size for bottom nav labels (MainLayout)
- `text-[10px]` — custom size for skill badges

**Body text:**
- Most use `text-sm` for descriptions/subtitles
- Some use `text-base` for form labels

**Card titles:**
- Mix of `text-sm font-medium`, `text-sm font-semibold`, `text-lg font-bold`

### 5. Button Text — Mostly Consistent
Buttons generally use `text-sm font-medium` ✅

### 6. Missing Font Family Declarations
Most components rely on the default body font (Inter), which is correct. However:
- No explicit `font-exo` utility class defined for Exo 2
- h2 elements should use Exo 2 per theme.css, but no Tailwind utility enforces this

## Recommendations

### 1. Create Tailwind Font Utilities
Add to tailwind config (or create one):
```js
fontFamily: {
  'heading': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
  'subtitle': ['Exo 2', 'sans-serif'],
  'body': ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
}
```

### 2. Standardize Page Headings
All page h1 headings should use:
```tsx
<h1 className="text-2xl font-bold text-gray-900">
```
- Remove inline font-family styles (unnecessary)
- Remove custom sizes like `text-[30px]`

### 3. Standardize Section Headings
Use consistent pattern for section headers:
```tsx
<h3 className="font-semibold text-gray-900 text-sm">
```

### 4. Standardize Card Titles
Use consistent pattern:
```tsx
<h3 className="font-semibold text-gray-900 text-sm">
```

### 5. Remove Inline Font Styles
Remove all inline `style={{ fontFamily: ... }}` — rely on defaults or Tailwind classes

### 6. Document Standard Patterns
Add to project-standards.md:

**Typography Hierarchy:**
- Page heading (h1): `text-2xl font-bold text-gray-900`
- Section heading (h2): `text-lg font-semibold text-gray-900`
- Card/component heading (h3): `text-sm font-semibold text-gray-900`
- Body text: `text-sm text-gray-600`
- Labels: `text-sm font-medium text-gray-700`
- Metadata/helper: `text-xs text-gray-500`

## Files Needing Updates

### High Priority (inline font overrides)
1. `src/layouts/MainLayout.tsx` — Remove inline fontFamily, change text-xl → text-2xl
2. `src/pages/Landing.tsx` — Remove inline fontFamily, change text-[30px] → text-2xl

### Medium Priority (size inconsistencies)
3. `src/pages/Coaching.tsx` — Standardize section headers
4. `src/pages/Schedule.tsx` — Standardize event card titles
5. `src/pages/Games.tsx` — Check card title consistency
6. `src/pages/Resources.tsx` — Check section headers

### Low Priority (minor tweaks)
7. Bottom nav labels — consider changing text-[9px] → text-xs for consistency
8. Skill badges — consider changing text-[10px] → text-xs for consistency

## Next Steps

1. Create tailwind.config.ts with font utilities
2. Update MainLayout and Landing to remove inline styles
3. Do a pass through all pages to standardize heading classes
4. Update project-standards.md with typography patterns
5. Consider creating reusable heading components (PageHeading, SectionHeading, CardHeading)
