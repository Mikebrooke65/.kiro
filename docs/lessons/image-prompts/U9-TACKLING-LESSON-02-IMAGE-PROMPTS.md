# U9 Tackling Lesson 02 - Image Generation Prompts
## Following IMAGE-PROMPT-GUIDELINES.md Standards

---

## Image 1: Shadow Defender
**Filename:** `session-shadow-defender-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/tackling/session-shadow-defender-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show a 20x20 meter square marked with orange cones at corners. Display 3 pairs of players spread throughout the area: attackers wearing orange bibs dribbling with football (soccer balls) at controlled pace, defenders wearing blue bibs without football (soccer balls) following 1-2 meters behind in ready position. Use solid arrows to show attacker's dribbling path with ball and dashed arrows to show defender's shadowing movement staying close behind. Include simple legend showing player icons (orange = attacker with ball, blue = defender shadowing) and arrow meanings (solid = dribbling path, dashed = shadowing movement). Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 2: Timing the Tackle
**Filename:** `session-timing-the-tackle-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/tackling/session-timing-the-tackle-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show five 10x10 meter grids arranged in a row. Each grid has two cones set 5 meters apart for figure-8 pattern. Focus detail on center grid: orange player (attacker) dribbling with football (soccer ball) in figure-8 pattern around two cones, blue player (defender) without football (soccer ball) waiting at edge of grid. Show attacker's figure-8 dribbling path with curved arrows. Show defender's timed entry with straight arrow toward the ball. Add emphasis circle or glow at the turn point where ball is furthest from attacker's body, indicating optimal tackle moment. Include small annotation "TACKLE HERE" at the optimal moment. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 3: Pressure and Tackle
**Filename:** `session-pressure-and-tackle-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/tackling/session-pressure-and-tackle-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show three 18x12 meter channels side by side. Each channel divided into three equal sections (thirds) with dotted lines. End zones (3 meters deep) marked at both ends of each channel. Focus detail on center channel: orange attacker at one end zone with football (soccer ball) attempting to dribble forward, blue defender without football (soccer ball) in middle third moving to close down. Use solid arrow for attacker's forward dribbling path with ball. Use angled arrow for defender's closing down movement. Add emphasis zones with labels: middle third marked "2 pts" and attacking third (nearest to attacker's target) marked "3 pts" to show scoring for winning ball. Include dotted line showing forced direction to one side. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 4: Transition Tackle Game
**Filename:** `session-transition-tackle-game-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/tackling/session-transition-tackle-game-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show 30x20 meter pitch with small goals at each end. Display 4v4 game situation: 4 orange players vs 4 blue players. Show specific transition moment: one orange player without football (soccer ball) sprinting back to their goal line (shown with long dotted arrow), while another orange player has football (soccer ball) being pressured by blue defender without ball. This creates 4v3 situation with blue team having numerical advantage. Show remaining 3 orange players and 3 blue players spread across pitch. Add emphasis circle around the 4v3 situation area. Include "BONUS POINT ZONE" label in opponent's half of pitch. Use arrows to show ball movement and defensive pressure. Show the transition clearly with the sprinting player and the numerical advantage. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Generation Checklist

For each image, verify:

- [x] Opens with "Create a football (soccer) coaching pitch diagram from top-down view"
- [x] Dimensions in meters (20x20, 10x10, 18x12, 30x20)
- [x] Player count and positions specified
- [x] Bib colors: orange (attackers), blue (defenders)
- [x] Ball possession clearly stated for each player
- [x] "football (soccer ball)" terminology used consistently
- [x] Movement arrows described with types (solid, dashed, dotted, curved)
- [x] Special indicators included where needed (emphasis circles, labels, zones)
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
  'session-shadow-defender-u9',
  'session-timing-the-tackle-u9',
  'session-pressure-and-tackle-u9',
  'session-transition-tackle-game-u9'
);
```

---

## Notes

- **Image 1 (Shadow Defender):** Shows shadowing technique with defender following attacker closely
- **Image 2 (Timing the Tackle):** Emphasizes the optimal moment to tackle at the turn in figure-8
- **Image 3 (Pressure and Tackle):** Shows channel work with scoring zones for tactical awareness
- **Image 4 (Transition Tackle Game):** Illustrates 4v3 situation created by transition rule

All prompts follow the mandatory 6-section structure from IMAGE-PROMPT-GUIDELINES.md.
