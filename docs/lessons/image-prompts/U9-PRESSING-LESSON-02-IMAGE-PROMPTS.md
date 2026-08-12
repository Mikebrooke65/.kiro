# U9 Pressing Lesson 02 - Image Generation Prompts
## Following IMAGE-PROMPT-GUIDELINES.md Standards

---

## Image 1: Pressing in Pairs
**Filename:** `session-pressing-pairs-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/pressing/session-pressing-pairs-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show a 20x20 meter square marked with orange cones at corners. Display groups of 3: orange player (attacker) with football (soccer ball) dribbling, two blue players (defenders without football (soccer balls)) working together in press-and-cover roles. First blue defender pressing ball carrier closely (within 2 meters). Second blue defender positioned 3-4 meters behind providing cover. Add speech bubbles showing communication: "Press!" from first defender and "Cover!" from second defender. Use dotted line connecting two defenders showing partnership. Arrows show coordinated movement as attacker moves. Emphasis on teamwork and roles. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 2: Pressing Traps
**Filename:** `session-pressing-traps-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/pressing/session-pressing-traps-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show five 15x10 meter channels arranged in a row. Focus detail on center channel showing 3v2: 3 orange players (one with football (soccer ball), two without) vs 2 blue players (both without football (soccer balls)). Show first blue defender forcing orange attacker toward sideline with angled approach arrow. Second blue defender closing trap from other side with curved arrow. Add emphasis zone near sideline labeled "TRAP ZONE" with shading. Include annotation "LINE = EXTRA DEFENDER" near sideline. Show attacker being squeezed between two defenders and sideline. Add small diagram showing escape routes blocked. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 3: Team Pressing Shape
**Filename:** `session-team-pressing-shape-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/pressing/session-team-pressing-shape-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show three 20x15 meter areas side by side. Each area has small goals at both ends. Focus detail on center area showing 4v4: 4 orange players vs 4 blue players. One orange player has football (soccer ball). Blue team pressing with compact shape. Draw dotted lines connecting all blue players showing distances between them (maximum 10 meters). Add shaded zone around blue team showing compact unit. Large annotation "MAX 10m BETWEEN PLAYERS" with measurement indicators. Include small inset showing poor shape (players spread out more than 10m) with red X mark for contrast. Emphasis on tight, organized pressing unit. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
```

---

## Image 4: High Press Game
**Filename:** `session-high-press-game-u9.png`
**Storage Path:** `/media/pitch-diagrams/u9/pressing/session-high-press-game-u9.png`

### Prompt:
```
Create a football (soccer) coaching pitch diagram from top-down view. Show 30x20 meter pitch with small goals at each end. Divide pitch into three equal thirds with dotted lines. Display 4v4 game: 4 orange players vs 4 blue players. Focus on attacking third (opponent's defensive third near orange goal) with emphasis shading. One orange player has football (soccer ball) near their own goal. Show blue team pressing high in this zone with multiple blue players without ball moving toward orange players. Use arrows to show pressing movements and quick counter-attack opportunity after winning ball. Add large annotation "+2 BONUS PTS" in the attacking third zone. Include small legend explaining thirds and bonus point system. Show aggressive high pressing with urgency. Use consistent icons, colors (orange/blue), and arrow styles. High contrast, clean minimal design. White background. 4:5 aspect ratio. Minimum 800px on short edge. PNG format. Professional coaching diagram style for mobile app display.
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
- [x] Special indicators included (speech bubbles, zones, measurements, insets)
- [x] Technical specifications closing paragraph included

---

## Database Update SQL

After uploading images to Supabase Storage, run this SQL to update the session records:

```sql
-- Replace {project-id} with your actual Supabase project ID
UPDATE sessions 
SET diagram_url = 'https://{project-id}.supabase.co/storage/v1/object/public/lesson-media/media/pitch-diagrams/u9/pressing/' || session_name || '.png'
WHERE session_name IN (
  'session-pressing-pairs-u9',
  'session-pressing-traps-u9',
  'session-team-pressing-shape-u9',
  'session-high-press-game-u9'
);
```

---

## Notes

- **Image 1 (Pressing in Pairs):** Shows press-and-cover partnership with communication
- **Image 2 (Pressing Traps):** Illustrates using sideline as extra defender to trap attackers
- **Image 3 (Team Pressing Shape):** Emphasizes compact shape with 10-meter maximum distances
- **Image 4 (High Press Game):** Shows pressing in attacking third for bonus points

All prompts follow the mandatory 6-section structure from IMAGE-PROMPT-GUIDELINES.md.
