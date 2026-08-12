# U9 1v1 Lesson 02 - Image Generation Prompts
## Following IMAGE-PROMPT-GUIDELINES.md Standards

---

## Image 1: 1v1 Space Creation
**Filename:** `session-1v1-space-creation-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/1v1/session-1v1-space-creation-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show a 20x20 meter square marked with cones. Four 5x5 meter zones in each corner marked with different colored cones. Display multiple pairs spread across square. Focus on one pair: orange player (attacker) with football (soccer ball) using body feint shown with dotted arrow faking left, then accelerating right with solid arrow into corner zone. Blue defender (without ball) reacting to fake and moving wrong direction. Add large annotation "FAKE → CREATE SPACE → ACCELERATE" with emphasis on sequence. Include small inset showing body feint technique: shoulders drop one way, hips turn other way, creating gap. Show space created between attacker and defender with shaded area. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 2: 1v1 Advanced Moves
**Filename:** `session-1v1-advanced-moves-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/1v1/session-1v1-advanced-moves-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show five 9x9 meter grids arranged in a row. Focus on center grid showing three-stage sequence: 1) Orange player with football (soccer ball) performing scissors (both feet circling over ball in figure-8 motion shown with curved arrows), 2) Same orange player performing Cruyff turn (fake kick forward shown with dotted arrow, pull ball behind standing leg shown with curved arrow), 3) Same orange player performing elastico (outside foot push shown with arrow, inside foot flick shown with curved arrow). Blue defender in each stage. Draw detailed arrows showing ball movement and foot paths for each move. Add large annotation "ADVANCED: SCISSORS, CRUYFF, ELASTICO". Include small inset showing detailed foot positioning for each move with numbered steps (1, 2, 3). Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 3: 1v1 Combination Play
**Filename:** `session-1v1-combination-play-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/1v1/session-1v1-combination-play-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show three 15x12 meter areas side by side. Each area has small goal at one end. Focus on center area showing 2v2: 2 orange players (one with football (soccer ball), one without) vs 2 blue players (both without ball). Display sequence: 1) Orange player with ball passes to teammate shown with dotted arrow, 2) Receiving orange player (now with football (soccer ball)) beats blue defender 1v1 shown with curved arrow and emphasis circle, 3) Shot on goal shown with solid arrow. Add large annotation "PASS → 1v1 → SHOOT" showing sequence. Emphasize combination creating 1v1 opportunity with shaded zone. Display scoreboard visible. Include small inset showing teamwork principle: pass creates space for 1v1. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 4: 1v1 Tournament
**Filename:** `session-1v1-tournament-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/1v1/session-1v1-tournament-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show six 12x9 meter channels arranged in two rows of three. Each channel has small goals at both ends. Focus on two channels showing 1v1 matchups: orange player with football (soccer ball) vs blue player (without ball) in first channel, different orange player with football (soccer ball) vs different blue player (without ball) in second channel. Draw arrows showing two-way play with both goals as targets in each channel. Add large tournament bracket or scoreboard visible showing matchups, rounds, and wins. Add large annotation "1v1 TOURNAMENT - 3 GAMES" with emphasis. Show multiple channels with different players competing. Add celebration icons (stars, trophies) for winners. Include small legend showing tournament format: 3 rounds, 2 minutes each. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Generation Checklist

For each image, verify:

- [x] Opens with "Create a football (soccer) coaching pitch diagram from top-down view"
- [x] Dimensions in meters (20x20 with 5x5 zones, 9x9, 15x12, 12x9)
- [x] Player count and positions specified
- [x] Bib colors: orange (attackers), blue (defenders)
- [x] Ball possession clearly stated for each player
- [x] "football (soccer ball)" terminology used consistently
- [x] Movement arrows described with types (solid, dashed, dotted, curved)
- [x] Special indicators included (insets, sequences, tournament bracket, celebration icons)
- [x] Technical specifications closing paragraph included

---

## Database Update SQL

After uploading images to Supabase Storage, run this SQL to update the session records:

```sql
-- Replace {project-id} with your actual Supabase project ID
UPDATE sessions 
SET diagram_url = 'https://{project-id}.supabase.co/storage/v1/object/public/lesson-media/media/pitch-diagrams/u9/1v1/' || session_name || '.png'
WHERE session_name IN (
  'session-1v1-space-creation-u9',
  'session-1v1-advanced-moves-u9',
  'session-1v1-combination-play-u9',
  'session-1v1-tournament-u9'
);
```

---

## Notes

- **Image 1 (1v1 Space Creation):** Shows body feint creating space with corner zones and technique inset
- **Image 2 (1v1 Advanced Moves):** Three-stage sequence showing advanced moves with detailed foot positioning
- **Image 3 (1v1 Combination Play):** Pass-1v1-shoot sequence emphasizing teamwork creating opportunities
- **Image 4 (1v1 Tournament):** Tournament format with multiple channels, bracket, and celebration elements

All prompts follow the mandatory 6-section structure from IMAGE-PROMPT-GUIDELINES.md.
