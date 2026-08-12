# U9 1v1 Lesson 01 - Image Generation Prompts
## Following IMAGE-PROMPT-GUIDELINES.md Standards

---

## Image 1: 1v1 Basics
**Filename:** `session-1v1-basics-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/1v1/session-1v1-basics-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show a 20x20 meter square marked with cones at corners. Display multiple pairs spread across square. Focus on one pair: orange player (attacker) with football (soccer ball) facing blue player (defender without ball) 3 meters away. Draw curved arrow showing attacker change of direction, then solid arrow showing acceleration past defender. Blue defender in jockey stance. Add large annotation "CHANGE PACE + DIRECTION" with emphasis. Include small inset showing body positioning: attacker between ball and defender, using body as shield. Show attacker movement pattern: slow, fake, accelerate. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 2: 1v1 Moves
**Filename:** `session-1v1-moves-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/1v1/session-1v1-moves-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show five 9x9 meter grids arranged in a row. Focus on center grid showing three-stage sequence: 1) Orange player with football (soccer ball) performing step-over (foot circling over ball, body fake left shown with dotted arrow), 2) Same orange player performing drag-back (pulling ball back with sole, shown with curved arrow), 3) Same orange player performing chop (inside foot cutting ball right, shown with angled arrow). Blue defender in each stage reacting to fake. Draw arrows showing ball movement and direction changes for each move. Add large annotation "3 MOVES: STEP-OVER, DRAG-BACK, CHOP". Include small inset showing detailed foot positioning for each move with numbered steps. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 3: 1v1 Under Pressure
**Filename:** `session-1v1-pressure-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/1v1/session-1v1-pressure-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show three 12x9 meter channels side by side. Each channel has small goals at both ends. Focus on center channel showing 1v1: orange player (attacker) with football (soccer ball) taking on blue player (defender without ball). Draw solid arrow showing attacker movement toward goal. Add timer icon showing "10 SEC" with emphasis and urgency indicators. Display scoreboard showing point system. Both goals visible showing two-way play potential. Add large annotation "ATTACK WITH PURPOSE" with emphasis. Show pressure situation with motion lines around attacker. Include small inset showing decision-making: shoot vs dribble more. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 4: 1v1 Game
**Filename:** `session-1v1-game-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/1v1/session-1v1-game-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show 30x20 meter pitch with small goals at each end. Display 4v4 game: 4 orange players vs 4 blue players. Highlight one 1v1 situation with large emphasis circle: orange player with football (soccer ball) taking on blue defender (without ball). Draw curved arrow showing attacker beating defender with move, then solid arrow showing attack toward goal. Add large annotation "+1 BONUS PT FOR 1v1 BEAT" with star icon. Show multiple players spread across pitch in realistic game positions. Include small inset showing successful 1v1 sequence: before (attacker facing defender) and after (attacker past defender with space). Add celebration icon for successful 1v1. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Generation Checklist

For each image, verify:

- [x] Opens with "Create a football (soccer) coaching pitch diagram from top-down view"
- [x] Dimensions in meters (20x20, 9x9, 12x9, 30x20)
- [x] Player count and positions specified
- [x] Bib colors: orange (attackers), blue (defenders)
- [x] Ball possession clearly stated for each player
- [x] "football (soccer ball)" terminology used consistently
- [x] Movement arrows described with types (solid, dashed, dotted, curved)
- [x] Special indicators included (insets, annotations, sequences, timer, scoreboard)
- [x] Technical specifications closing paragraph included

---

## Database Update SQL

After uploading images to Supabase Storage, run this SQL to update the session records:

```sql
-- Replace {project-id} with your actual Supabase project ID
UPDATE sessions 
SET diagram_url = 'https://{project-id}.supabase.co/storage/v1/object/public/lesson-media/media/pitch-diagrams/u9/1v1/' || session_name || '.png'
WHERE session_name IN (
  'session-1v1-basics-u9',
  'session-1v1-moves-u9',
  'session-1v1-pressure-u9',
  'session-1v1-game-u9'
);
```

---

## Notes

- **Image 1 (1v1 Basics):** Shows fundamental change of pace and direction with body positioning inset
- **Image 2 (1v1 Moves):** Three-stage sequence showing all three basic moves with foot positioning details
- **Image 3 (1v1 Under Pressure):** Emphasizes quick decision-making with timer and two-way goals
- **Image 4 (1v1 Game):** Game scenario with bonus point system and before/after 1v1 sequence

All prompts follow the mandatory 6-section structure from IMAGE-PROMPT-GUIDELINES.md.
