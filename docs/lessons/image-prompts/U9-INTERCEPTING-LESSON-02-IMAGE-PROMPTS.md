# U9 Intercepting Lesson 02 - Image Generation Prompts
## Following IMAGE-PROMPT-GUIDELINES.md Standards

---

## Image 1: Scanning for Interceptions
**Filename:** `session-scanning-for-interceptions-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/intercepting/session-scanning-for-interceptions-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show a 20x20 meter square marked with orange cones at corners. Display 4v4 possession game: 4 orange players (one with football (soccer ball), three without) vs 4 blue players (all without ball). Show blue defenders with head-turn icons indicating scanning movements. Draw dotted lines from defenders' eyes showing their vision of multiple passing options around them. Add speech bubble from coach position showing "SCAN!". Emphasize awareness with multiple potential pass paths shown as dotted arrows. Include small inset diagram showing proper scanning technique: head movement, checking over shoulders, peripheral vision. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 2: Intercepting Through Balls
**Filename:** `session-intercepting-through-balls-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/intercepting/session-intercepting-through-balls-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show five 15x10 meter channels arranged in a row. Each channel has end zone (3 meters deep) at far end. Focus detail on center channel showing 2v1: orange attacker 1 with football (soccer ball) at near end, orange attacker 2 without ball making forward run toward end zone (shown with solid arrow), blue defender without ball positioned between them. Draw dotted line showing anticipated through ball pass into space. Draw solid arrow showing defender's sprint to intercept pass before it reaches attacker 2. Add emphasis on reading the run early. Include annotation "SEE RUN → ANTICIPATE PASS → INTERCEPT" with icons. Add scoreboard showing "2 pts for interception, 1 pt for through ball". Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 3: Team Interception Shape
**Filename:** `session-team-interception-shape-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/intercepting/session-team-interception-shape-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show three 20x15 meter areas side by side. Each area has small goals at both ends. Focus on center area showing 4v4: 4 orange players vs 4 blue players. Ball with orange player on left side of area. Show blue team shifted collectively to left side creating compact shape. Use shaded zone to show compressed area with crowded passing lanes. Draw dotted lines showing limited passing options due to compression. Show team shape with arrows indicating collective shift movement. Add annotation "COMPRESS SPACE = MORE INTERCEPTIONS". Include small inset showing poor shape (spread out, not compressed) with red X mark for contrast. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 4: Counter-Attack from Interception
**Filename:** `session-counter-attack-from-interception-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/intercepting/session-counter-attack-from-interception-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show 30x20 meter pitch with small goals at each end. Display 4v4 game: 4 orange players vs 4 blue players. Show moment where blue player just intercepted football (soccer ball) from orange team. Add large "5 SECONDS!" timer annotation with clock icon. Use arrows to show rapid forward movement and passing sequence toward goal. Show orange players caught out of position and disorganized. Show blue team exploiting space with quick counter-attack. Add large annotation "3 PTS IF SCORE IN 5 SEC!". Use motion lines to emphasize speed and urgency. Show clear goal-scoring opportunity being created from interception moment. Include small inset showing the interception moment. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Generation Checklist

For each image, verify:

- [x] Opens with "Create a football (soccer) coaching pitch diagram from top-down view"
- [x] Dimensions in meters (20x20, 15x10, 20x15, 30x20)
- [x] Player count and positions specified
- [x] Bib colors: orange (attackers), blue (defenders)
- [x] Ball possession clearly stated for each player
- [x] "football (soccer ball)" terminology used consistently
- [x] Movement arrows described with types (solid, dashed, dotted, curved)
- [x] Special indicators included (scanning icons, timers, emphasis, insets, annotations)
- [x] Technical specifications closing paragraph included

---

## Database Update SQL

After uploading images to Supabase Storage, run this SQL to update the session records:

```sql
-- Replace {project-id} with your actual Supabase project ID
UPDATE sessions 
SET diagram_url = 'https://{project-id}.supabase.co/storage/v1/object/public/lesson-media/media/pitch-diagrams/u9/intercepting/' || session_name || '.png'
WHERE session_name IN (
  'session-scanning-for-interceptions-u9',
  'session-intercepting-through-balls-u9',
  'session-team-interception-shape-u9',
  'session-counter-attack-from-interception-u9'
);
```

---

## Notes

- **Image 1 (Scanning for Interceptions):** Shows scanning technique with head-turn icons and vision lines
- **Image 2 (Intercepting Through Balls):** Illustrates reading forward runs and intercepting passes into space
- **Image 3 (Team Interception Shape):** Shows team compression to crowd passing lanes
- **Image 4 (Counter-Attack from Interception):** Emphasizes quick transition with 5-second rule

All prompts follow the mandatory 6-section structure from IMAGE-PROMPT-GUIDELINES.md.
