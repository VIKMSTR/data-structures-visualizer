# Porting notes: 2015 JavaFX thesis apps → this app

Sources of truth (in priority order):
1. **The 2015 code** in `thesis2/bitbucket/` (`bvs`, `avltree_version-2`, `2-3-tree`, `quad-tree`) plus the shared
   libraries `MT-common` and `MT-guiprovider`. Detailed specs extracted from it: [`docs/original/`](original/).
2. **The thesis text** (`bitbucket/diplomov-pr-ce-teorie/DPKrejcirViktor.docx`) where the code and the text disagree
   or the code is broken.

## Kept from the original

| Area | Original | Here |
|---|---|---|
| Toolbar | `Prvek:` · `Vložit` `Odstranit` `Najít` · ☐`Krokovat` `<<` `>>` · `Rychlost:` slider · `Play/Pause` `Vzory` `Reset` `?` | same order and labels (CS), EN translation |
| Playback | step list per operation; Krokovat = stop after each step; `<<` without Krokovat rewinds the whole operation | same (`player.svelte.ts`) |
| Speed | rate 0.3–2.5, duration = base / rate; moves 1000 ms, fades 200 ms, shifts 400 ms; EASE_BOTH easing | same |
| BVS/AVL nodes | 30×15 yellow `#FFFF00`, black 1 px border, 12 px text; edges from parent's bottom corner to child's top-centre | same |
| BVS/AVL layout | one 50 px column per node in in-order order, rows 35 px apart | same (without the 20/40 px quirk next to the root) |
| Search badge | value box travels down; LIGHTGREEN / LIGHTPINK result; drops 50 px | same |
| AVL rotation | curved arrow under the rotated node, then the subtree glides | same |
| 2-3 nodes | 44×22 yellow, two 22 px cells with divider; key badge = yellow circle; found key in red | same |
| 2-3 texts | "Došlo k rozdělení prvku…", "Odstraňuji klíč X z listu.", "Klíč X byl NALEZEN." / "NEBYL NALEZEN." | verbatim |
| Quad grid | white 400×400 square, black split lines, red points, hover label `[x,y]` | same |
| Quad tree view | 48×50 boxes, `[centre]` / `[point]` (font 9), light yellow / light cyan, chartreuse / red border after search | same |
| Quad input | two decimal fields, 0–100 inclusive, point on a split line goes East / North | same |
| Presets ("Vzory") | dialog "Vytvořit strukturu", `Sady:`, `Vkládané prvky:`, `animovat`; build replayed at 10× | same; the `animovat` checkbox now works |
| Dialogs | error 400×150 / help "Nápověda" 600×300 / presets 500×300 light yellow; verbatim Czech texts | same |
| Window titles | "Binary Search tree", "AVL tree", "2-3 strom", "Quad Tree" | used as page titles per tab |

## Decisions where code and thesis disagree (chosen by the author)
- **Removal of an inner node** (BVS, AVL, 2-3): swap with the **in-order successor**, as the thesis describes
  (the BVS/AVL code used the predecessor; its successor branch crashed). The swap is animated as the original's
  cross-move of the two nodes.
- **Quadtree collapse**: when only one point remains among four sibling quadrants, it moves up and the quadrants
  disappear, repeated upwards (thesis). The code only collapsed four *empty* leaves, one level at a time.
- **Quadtree y axis**: drawn upwards (math convention) so NW/NE are on top; the original grid drew y downwards.

## Original bugs not reproduced
- BVS/AVL: NullPointerException when removing a node whose only child is on the right; root not updated when
  removing a root whose left child has no right child; AVL rebalancing starting too high after inner removals.
- 2-3: inner keys could never be removed (one-line regression in commit 974a813); NPE removing from a leaf root;
  wrong results for underflow at height 1 and deeper propagation; NPE on some splits under a 2-node.
- Duplicates / missing elements were silently ignored in BVS, AVL and 2-3 → now the shared error dialog.
- "Reset" left the 2-3 model and the quad grid in place → now clears everything.
- Preset builds permanently reset the speed slider to 1×.

## Additions (not in the original)
- Step descriptions for BVS, AVL and Quad (the original only had them for the 2-3 tree); clicking a line jumps to it.
- Intermediate 2-3 snapshots: the temporary 3-key overflow node and the empty "hole" node are shown.
- Quadtree: both views side by side on wide screens; click into the plane to insert; current cell highlighted.
- Pan/zoom/pinch on every drawing; keyboard (Space, ←/→, Home/End); English translation; works on phones.
- The skip list ("Hierarchie seznamů") described in the thesis has no code in `bitbucket/` and is not ported.
