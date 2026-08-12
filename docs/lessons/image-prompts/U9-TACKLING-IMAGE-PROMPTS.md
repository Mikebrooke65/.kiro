# U9 Tackling Lesson 01 - Image Generation Prompts
## Following IMAGE-PROMPT-GUIDELINES.md Standards

---

## Image 1: Mirror Jockey
**Filename:** `session-mirror-jockey-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/tackling/session-mirror-jockey-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show an 18x18 meter square marked with orange cones at corners. Display 3 pairs of players spread throughout the area: attackers wearing orange bibs without football (soccer balls) moving freely, defenders wearing blue bibs without football (soccer balls) in side-on jockey stance 2-3 meters away from their partner. Use curved arrows to show attacker movement patterns (random directions and speed changes) and straight dashed arrows to show defender mirroring movements maintaining distance. Include simple legend showing player icons (orange = attacker, blue = defender) and arrow meanings (solid = attacker movement, dashed = defender mirror). Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 2: Block Tackle Introduction
**Filename:** `session-block-tackle-intro-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/tackling/session-block-tackle-intro-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show five 9x9 meter grids arranged in a row. Each grid contains one orange player (attacker) with football (soccer ball) dribbling slowly and one blue player (defender) without football (soccer ball) in jockey position. Focus detail on center grid showing proper tackle technique: blue defender approaching at 45-degree angle (not straight on) with planted foot beside the football (soccer ball) and tackling foot contacting the ball. Show incorrect head-on approach with dotted line and red X mark in one grid. Include small inset diagram in corner showing detailed foot positioning during tackle: planted foot beside ball, tackling foot locked ankle striking through middle of ball. Use consistent icons, colors (orange/blue), and line weights. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 3: 1v1 Tackle Under Pressure
**Filename:** `session-1v1-tackle-pressure-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/tackling/session-1v1-tackle-pressure-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show three 14x9 meter channels side by side, each with small goals at both ends. Focus detail on center channel: orange attacker at one end dribbling forward with football (soccer ball), blue defender without football (soccer ball) at opposite end jockeying backward in side-on stance. Use solid arrow for attacker's forward movement with ball, dashed arrow for defender's backward jockey movement, then solid arrow showing forward tackle motion when opportunity arises. Include dotted arrow showing counter-attack path if defender wins the football (soccer ball). Add "heavy touch" indicator icon (small starburst or emphasis mark) near ball to show ideal tackle moment. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 4: Tackle Game Application
**Filename:** `session-tackle-game-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/tackling/session-tackle-game-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show 27x18 meter pitch with small goals at each end. Display 4v4 game: 4 orange players vs 4 blue players in realistic game positions spread across pitch. One orange player in center-left area has football (soccer ball). Highlight one defensive situation with emphasis circle or glow: blue defender without football (soccer ball) using correct side-on jockey position before tackling orange attacker with ball. Use arrows to show ball movement path and defensive pressure direction. Include "bonus point" star icon near the highlighted tackle area to indicate special scoring rule. Show all 8 players in typical small-sided game formation (not clustered). Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Generation Checklist

For each image, verify:

- [x] Opens with "Create a football (soccer) coaching pitch diagram from top-down view"
- [x] Dimensions in meters (18x18, 9x9, 14x9, 27x18)
- [x] Player count and positions specified
- [x] Bib colors: orange (attackers), blue (defenders)
- [x] Ball possession clearly stated for each player
- [x] "football (soccer ball)" terminology used consistently
- [x] Movement arrows described with types (solid, dashed, dotted, curved)
- [x] Special indicators included where needed (legend, inset, icons)
- [x] Technical specifications closing paragraph included

---

## After Generation

1. **Download images** from AI generator
2. **Verify quality:**
   - 4:5 aspect ratio
   - Minimum 800px short edge
   - White background
   - Clear, high contrast
   - All elements visible and readable
3. **Rename files** to match session names exactly
4. **Upload to Supabase Storage** at specified paths
5. **Update database** with URLs

---

## Database Update SQL

After uploading images to Supabase Storage, run this SQL to update the session records:

```sql
-- Replace {project-id} with your actual Supabase project ID
UPDATE sessions 
SET diagram_url = 'https://{project-id}.supabase.co/storage/v1/object/public/lesson-media/media/pitch-diagrams/u9/tackling/' || session_name || '.png'
WHERE session_name IN (
  'session-mirror-jockey-u9',
  'session-block-tackle-intro-u9',
  'session-1v1-tackle-pressure-u9',
  'session-tackle-game-u9'
);
```

---

## Notes

- **Image 1 (Mirror Jockey):** No balls initially - this is a mirroring exercise focused on footwork
- **Image 2 (Block Tackle):** Shows technique detail with inset diagram for foot positioning
- **Image 3 (1v1 Pressure):** Emphasizes the moment to tackle with "heavy touch" indicator
- **Image 4 (Game Application):** Shows realistic game context with bonus point system highlighted

All prompts follow the mandatory 6-section structure from IMAGE-PROMPT-GUIDELINES.md.
