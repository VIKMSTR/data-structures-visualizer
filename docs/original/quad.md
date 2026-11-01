# Quadtree ("Quad Tree") app — port specification

Source repo: `/Users/viktor.krejcir/Dev/viktor/thesis2/bitbucket/quad-tree` (latest commit `40cf402`, 2015-09-19 "Updated EventTesting").
All paths below are relative to `src/` unless stated otherwise. Shared libs: `MT-common` (`cz.commons.*`), `MT-guiprovider` (`components.*`).

How this was verified: I compiled `core/`, `events/` and `Box.java` against a stub `javafx.geometry.Point2D` (exact-double `equals`, same `toString`) with Guava 18, then ran scripted operations (harness in `/tmp/qt-harness`). Every "model event trace" below is **real output** of the current code. The Animator/GridView reactions come from reading the code by hand, because they need JavaFX.

Legend: **[JAVA]** = faithful behaviour of the original. **[PORT]** = recommendation for the TS port (marked when it deviates or invents).

---

## 1. Data structure semantics

### 1.1 Kind of quadtree
- It is a **point-region (PR) quadtree with bucket capacity 1**. Each leaf holds at most one *location* (`QuadLeaf` = x, y, `ArrayList<T> values`, `core/nodes/QuadLeaf.java:10-20`).
  - `values` can in theory hold several values for the same coordinates. In this app `T = Point2D` and the value **is** the coordinate (`QTreeController.java:97` → `quadtree.put(x, y, value)`), so a leaf effectively holds exactly one point.
- A node is either a **leaf** (`hasChildren=false`, `leaf` is null or holds a point) or an **inner node** (`hasChildren=true`, exactly 4 children, `leaf==null`) (`QuadNode.java:30-37`).
- **There is no maximum depth** (no guard anywhere). Two points that are very close produce a long chain of splits. Example: the eventTest data, inserting (10,12) next to (10,10), splits down to level 6 (see §2.6). Identical coordinates never split: they count as duplicates.
- Region splitting is always at the **geometric centre** of the cell. It never splits at the point.

### 1.2 Coordinate system and bounds
- The root bounds are `Box(0,0,100,100)` (`QTreeController.java:55`). `Box` normalises min/max and computes `centerX=(minX+maxX)/2`, `centerY=(minY+maxY)/2` (`cz/commons/quadtree/shared/Box.java:16-23`).
- Model axes are mathematical: **"North" = larger y, "South" = smaller y; "West" = smaller x, "East" = larger x** (see `divide()` below).
- **The grid view draws y downward** (`GridView.java:110-119`: `screenY = rectTop + y*4`). So on screen, y=0 is the TOP edge and model "North" (high y) is at the **bottom** of the square. The original does this and never labels quadrants on the grid, so the mismatch is not visible to users. **[PORT]** Keep y-down to match the original exactly, or flip to y-up so NW really appears top-left. Either way, document the choice. Flipping y changes only rendering, not the model.
- The root is created with the event point `((maxX-minX)/2, (maxY-minY)/2) = (50,50)` (`core/tree/QuadTree.java:29`). That formula is only correct because minX=minY=0.

### 1.3 Quadrant order and naming
- Names are English abbreviations, used everywhere: `NW, NE, SW, SE` (`cz/commons/quadtree/shared/NodePosition.java:3-5`). No Czech quadrant names exist.
- Child boxes (`QuadNode.java:108-111`):
  - NW = `(minX, centerY) – (centerX, maxY)` (low x, high y)
  - NE = `(centerX, centerY) – (maxX, maxY)` (high x, high y)
  - SE = `(centerX, minY) – (maxX, centerY)` (high x, low y)
  - SW = `(minX, minY) – (centerX, centerY)` (low x, low y)
- Child order in the **tree view** (left→right) is **NW, NE, SW, SE**: slot index = `parentIndex*4 + {0,1,2,3}` (`treeview/layoutmanager/QuadTreeHelper.java:49-63`, `TreeLayoutManager.java:59-79`; Animator adds them in that order, `Animator.java:276-279`).
- The scan (used by the grid view) visits children in the order NE, NW, SE, SW, post-order (`QuadNode.java:434-439`). Only the grid view uses this, and order does not matter there.

### 1.4 Child selection and boundary rule (`QuadNode.getChild`, `QuadNode.java:361-392`)
```
if x <  centerX:  (y < centerY) ? SW : NW
else:             (y < centerY) ? SE : NE
```
- A point exactly on the vertical split line (x == centerX) goes **East**. A point exactly on the horizontal split line (y == centerY) goes **North**. Example: (50,50) goes to the NE child of the root, and (25,25) goes to NE of SW (verified by the `boundary` harness run).
- Points on the outer border (0 or 100) are accepted and go to the edge quadrants: (0,0) → SW…SW, (100,100) → NE…NE. `getChild` never tests containment, so out-of-range values would also be routed. The UI prevents them (§4.2).
- **Side effect to replicate in events:** `getChild` itself posts the `GoNW/GoNE/GoSW/GoSE` event, carrying the **centre of the chosen child** (`QuadNode.java:366,373,380,386`). So every call to `getChild` emits one direction event.

### 1.5 Insert (`QuadNode.put(QuadLeaf)`, `QuadNode.java:47-99`)
Recursive. At node N:
1. **N is inner**: `child = getChild(p)` (emits GoXX(child centre)), then posts `GoDownEvent(child centre)`, then calls `getChild(p)` **again** (emits a second, identical GoXX) and recurses. (`QuadNode.java:48-56`; the double call is a quirk, see §6.)
2. **N is an empty leaf**: posts `CreateEvent(p)`, stores the leaf, returns true (`:58-64`).
3. **N holds the same coordinates** (exact `double ==`): for each incoming value not already contained, the value is added. If anything was added, `CreateEvent(p)` is posted. Returns `changed` (`:65-90`). With T=Point2D, a re-insert of the same point is always `changed=false` → returns **false** → duplicate.
4. **N holds a different point (split)**:
   - `getChild(p)` is called but N has no children yet, so it returns null and emits nothing (`:92`, a leftover).
   - posts `GoDownEvent(N centre)` (`:95`)
   - `divide()` (`:102-125`): creates the 4 children; posts `IncreaseLevelEvent(N centre, NW c, NE c, SW c, SE c)`; sets `hasChildren=true`; then for the old point: posts `MoveEvent(old point)`, then `getChild(old)` (emits GoXX), then `child.put(old)` (normally emits `CreateEvent(old)`), and sets `N.leaf=null`.
   - then `getChild(p).put(p)` (emits GoXX, then recursion). If the new point lands in the same child as the old one, that child is now an occupied leaf, so case 4 repeats one level deeper. This produces the cascade of splits.
- `QuadTree.put` increments `size` on success (`QuadTree.java:33-39`). Size is not displayed anywhere.

### 1.6 Duplicates
- A duplicate insert returns false. The controller then throws `DuplicateException("Prvek [" + x + "," + y + "] je již ve struktuře obsažen")` (`QTreeController.java:103-105`, e.g. `Prvek [30.0,10.0] je již ve struktuře obsažen`). That message is **not shown**: CommonControls catches the exception and shows its own generic dialog (§4.3).
- The descent events for the duplicate were already posted and turned into transitions, but `ac.playForward()` is never called. The next operation's cleanup discards them. Visible result: **no animation, only the error dialog**. One artefact: the fresh "cursor" box is added to the tree pane at translate (0,50) and stays visible until the next operation (see §6, setPosition bug).
- **[PORT]** On duplicate, produce zero steps (or one error step), show the dialog text from §4.3, and leave the model unchanged.

### 1.7 Search (`QuadTree.searchForSinglePoint` → `QuadNode.pointSearch`, `QuadNode.java:313-336`)
- This is an exact point search. It descends only along the path of the point: at each inner node `getChild` (GoXX) then `GoDownEvent(child centre)`. Here `getChild` is called only once per level, unlike insert.
- At the reached leaf it posts `SearchComplete(point, found, containing = leaf centre)`:
  - empty leaf → found=false
  - leaf whose `values.contains(new Point2D(x,y))` → found=true
  - leaf with a different point → found=false
- Searching an empty tree gives `SearchComplete(false, containing=(50,50))` on the root.
- Search does **not** rescan, so the grid view is not touched (`QTreeController.java:144-155`).
- Unused alternatives in `QuadNode`: nearest-neighbour `get(x,y,bestDistance)` (`:186-263`; its pruning is broken because `Double bestDistance` is passed by value; it posts GoDown/GoXX plus an `AnimationFinishedEvent` marked `/* TESTING */`), radius query `get(x,y,maxDistance,list)` (`:288-311`), and box query `get(Box,list)` (`:338-359`). None of these is reachable from the UI. **[PORT]** Do not port them.

### 1.8 Remove and collapse (`QuadTree.remove`, `QuadTree.java:41-66`; `QuadNode.remove`, `QuadNode.java:137-155`; `inspectCollapsing`, `:157-184`)
- Descent: at an inner node, `getChild` (GoXX) then `GoDownEvent(child centre)`, recursing (one GoXX per level).
- At the leaf: if `leaf.x==x && leaf.y==y && values.remove(value)` then the leaf becomes null when its values are empty, `RemoveEvent(point)` is posted, and the call returns true. Otherwise it returns false with **no event**.
- After a **successful** removal only, `size--`, then `root.inspectCollapsing(cache)` and `collapseNodes()`:
  - `inspectCollapsing` walks the tree in **pre-order (self, then NW, NE, SW, SE)**. An inner node qualifies when **all 4 children are leaves AND all 4 are empty** (`:159-160`). For each qualifying node it posts `CollapseEvent(node centre)` with the 4 child centres set (`:164-169`), then it keeps recursing into the children.
  - `collapseNodes` then calls `clear()` on the cached nodes in reverse order (`QuadTree.java:57-66`). `clear()` drops the children and sets `hasChildren=false` (`QuadNode.java:269-286`).
- **Collapse is a single level per removal, not cascading.** The check runs before any clearing, so a grandparent that ends up with 4 empty leaf children after its child collapses is **not** collapsed in the same removal. It only collapses at the *next successful* removal anywhere in the tree. Verified:
  - insert (10,10),(20,20) gives a 3-level chain. Remove (20,20): no collapse. Remove (10,10): only node (12.5,12.5) collapses. The tree is now empty, but the root and SW(25,25) **remain split** (harness `cascade`).
  - A collapse can also happen in a part of the tree unrelated to the removed point. Any qualifying node anywhere collapses on the next successful remove.
- The root collapses like any other node when its 4 children are empty leaves.
- Removing a point that does not exist gives a descent (GoXX/GoDown) only, then `false`. **No message to the user**: the controller swallows everything (`QTreeController.java:130-141`). It still posts `AnimationFinishedEvent`, rescans and plays.
- **[PORT]** Replicate the "one level per successful removal" rule exactly, including the pre-order check over the whole tree. Ports often cascade by mistake.

### 1.9 Input validation (shared toolbar, `MT-guiprovider/src/components/CommonControls.java:106-116`)
- There are two text fields (X, Y). Each is parsed with `Double.parseDouble` (decimals with `.` are allowed, e.g. `12.5`; surrounding whitespace is trimmed by Java; `1e1` would be accepted).
- Range check: `d < 0 || d > 100` on either value → `OutOfRangeException("Jedna či více ze zadaných hodnot leží mimo rozsah (0-100)")`. So **0 and 100 are inclusive**.
- Equality is exact `double ==` (so 10 and 10.0 are the same point; 10.0000001 is a different point).
- The core performs no validation of its own.

### 1.10 Presets ("Vzory"), `application/QuadTreePresets.java:16-31`
| Name | Points (in insertion order) |
|---|---|
| `Sada 1` | (60,40), (10,20), (30,70), (80,80) |
| `Sada 2` | (40,40), (10,10), (30,70), (80,80) |
| `Sada 3` | (60,60), (10,10), (30,70), (80,20) |
| `Sada 4` | (60,40), (5,22), (10,80), (60,60) |

Final structures (harness):
- Sada 1: root split once. NW=(30,70), NE=(80,80), SW=(10,20), SE=(60,40).
- Sada 2: root split, SW split. NW=(30,70), NE=(80,80), SE=empty; SW→{NW empty, NE=(40,40), SW=(10,10), SE empty}.
- Sada 3: root split once. NW=(30,70), NE=(60,60), SW=(10,10), SE=(80,20).
- Sada 4: root split once. NW=(10,80), NE=(60,60), SW=(5,22), SE=(60,40).

Build flow (`QTreeController.build`, `:58-90`):
1. `clear()` (= Reset, below).
2. `InitAnimationEvent((0,0), cleanup=true, startAnimation=false)`.
3. For each point: `InitAnimationEvent(p, cleanup=false, startAnimation=true)` then `put`. Exceptions are printed to stderr only; duplicates silently return false.
4. One `scanStructure()`.
5. Register a finished-listener that resets the rate to 1. These listeners accumulate on every build.
6. `ac.playForward()`.

All insertions are queued into **one** continuous animation. The commented `// ac.setRate(10)` (`:78`) shows the intent to fast-forward builds. The dialog's "animovat" checkbox is **ignored** by this controller.

### 1.11 Reset (`QTreeController.reset/clear`, `:190-204`)
- Posts `ResetEvent`. The Animator clears the layout manager, the tree pane and the animation queue (`Animator.java:161-165`).
- `quadtree.clear()` then makes the root an empty leaf with the same bounds. `size=0`.
- Posts `CreateRootEvent(50,50)`, which re-creates the root box in the tree view.
- **The grid view is NOT cleared.** `GridView` does not subscribe to `ResetEvent`, and Reset does not rescan, so old points and lines stay until the next insert/remove/build (bug, §6). **[PORT]** Clear both views.

### 1.12 Initial state
- At startup the root (empty leaf, centre (50,50)) is shown in the tree view (`QuadTree` constructor posts `CreateRootEvent`, `QuadTree.java:29`).
- The grid view is **blank**: nothing is drawn until the first `ScanFinishedEvent`. **[PORT]** Draw the empty 100×100 frame from the start.

---

## 2. Events and animation

### 2.1 Infrastructure
- There is one Guava `EventBus` (`QTreeController.java:51-55`) with subscribers `Animator` (tree view) and `GridView` (grid view).
- The model posts events synchronously while it mutates. The Animator turns each relevant event into a JavaFX transition (or nothing) and appends it to `AnimationControl.getTransitions()`. Each appended `ParallelTransition` is **one step** for the shared step/play controls (`MT-common/.../animation/AnimationControl.java`: `goForth` plays one, play mode chains them, `goBack` plays the transition reversed).
- Before a step plays, `AnimationsHelper.setNodesToVisible` sets `visible=true` on every animated node. It does **not** reset opacity (`AnimationsHelper.java:32-63`).
- `GridView` is **not animated**. It rebuilds immediately from a scan (`ScanStarted` → n×`ScannedNode` → `ScanFinished`) after insert, remove and build. So the grid always shows the final state as soon as an operation starts.
- Durations (`animation/utils/AnimationTools.java:26-27`): `DURATION` = 1000 ms (moves, search stroke), `SHORT_DURATION` = 200 ms (fades, fills). Re-layout translate transitions have no explicit duration, so the JavaFX default of **400 ms** applies (`Animator.java:511-513`). `immediateHide` = 1 ms.
- Speed slider: rate 0.3–2.5, default 1 (`CommonControls.java:87-89`).

### 2.2 Event classes (`events/*.java`). All extend `Event(point)` except where noted
| Class | Payload | Posted by | toString |
|---|---|---|---|
| `CreateRootEvent` | root centre | `QuadTree` ctor (`:29`), `QTreeController.clear` (`:195`) | `"Create root" + "Event : " + p` |
| `InitAnimationEvent` | point, `cleanup` (default true), `startAnimation` (default true) | controller before every insert/remove/search; build (`:62,67`) | `"Event : Initializing animation"` |
| `GoDownEvent` | centre of node being entered (or of node being split) | `put`, `remove`, `pointSearch`, `get` | `"Event : GoDown: " + p` |
| `GoNWEvent`/`GoNEEvent`/`GoSWEvent`/`GoSEEvent` | centre of chosen child | `getChild` (and `get`) | `"Event : Going NW: " + p` etc. |
| `IncreaseLevelEvent` | split node centre + NW/NE/SW/SE child centres | `divide` | `"Event : Creating new Level " + p` |
| `MoveEvent` | the point being pushed down from the split node | `divide` | `"Event : Moving points: " + p` |
| `CreateEvent` | inserted point | `put` (empty leaf, or merged value) | `"Event : Create: " + p` |
| `RemoveEvent` | removed point | `remove` | `"Event : Removing: " + p` |
| `CollapseEvent` | collapsing node centre + 4 child centres | `inspectCollapsing` | `"Event : Collapsing event" + p + child list` |
| `SearchComplete` | searched point, `found`, `containing` = leaf centre | `pointSearch` | `"Event : Search complete: " + p + " Found: " + found` |
| `AnimationFinishedEvent` (not an `Event`) | — | controller after insert/remove/search; `get()` TESTING | default |
| `ResetEvent` | (0,0) | `clear()` | default |
| `ScanStartedEvent` / `ScanFinishedEvent` | null | `scanStructure()` | default |
| `ScannedNodeEvent` | node centre, bounds `Box`, level (root=0), child centres if inner, `value` (the leaf point) | `QuadNode.scan` | multi-line |
| `MoveElementEvent` (`cz/commons/quadtree/treeview/layoutmanager`) | elementId, oldPoint, newPoint | layout manager `DepthRow.movePoint` on its *own* EventBus, consumed by the Animator | — |
| `AnimationStartedEvent`, `ValueInsertedEvent` | — | never posted (dead) | — |

### 2.3 Tree-view node identity
- `NodeTools.idConverter(p) = (int)((int)p.x * 100 + p.y)` (`animation/utils/NodeTools.java:19-22`). Example: (12.5,37.5) → 1237; root → 5050.
- The Animator finds tree boxes by the **centre coordinates** carried in events.
- IDs collide from depth 6 on: (3.125,3.125) at depth 4 and (3.90625,3.90625) at depth 6 both map to 303 (brute-force check). **[PORT]** Use path-based ids (e.g. "", "SW", "SW.NE") instead.

### 2.4 What the Animator does per event (`animation/Animator.java`)
Animator state is reset by `InitAnimationEvent`: `movePoint=(0,0)`, `parentID=null`, `editedNodeID=null`, `moveElements=[]`, `removeElements=[]` (`:83-107`).

- **InitAnimationEvent** (`:83-107`)
  - If `cleanup`: `initialCleanup()` (`:167-193`). It clears the transition queue, removes the old cursor, resets the lines of the last collapsed node (`resetLines`), resets the stroke of the last searched node to BLACK, and **now** removes the collapsed children of the previous operation from the layout (`layoutManager.removeElement`).
  - Creates a new **cursor** `animationNode = new QuadElement(id, 48, 50, "[x,y]")`. The string argument is ignored, `setCoords` is never called and the value text is hidden, so the cursor renders as an **empty light-yellow 48×50 box with the divider line** and no text.
  - If `startAnimation`: adds the cursor to the pane and appends **Step: TranslateTransition cursor (0,0) → root position, 1000 ms** (`:109-122`). Then `movePoint = rootPos`.
- **CreateRootEvent** (`:133-140`): creates the root `QuadElement` with coords label, adds it to the layout at depth 0 and places it. No transition.
- **GoDownEvent** (`:241-250`): `parentID = editedNodeID = id(p)`; `movePoint = layoutPosition(p)`. No transition.
- **GoNW/NE/SW/SE** (`:422-460`, `moveNodeToPosition` `:497-506`): **Step: cursor translate from `movePoint` → position of child p, 1000 ms.** `editedNodeID = id(p)`. `movePoint` is **not** updated here; only GoDown updates it.
- **IncreaseLevelEvent** (`:257-332`):
  1. Creates the 4 child boxes with coords labels. Adds them to the layout under `parentID` (or root) as NW, NE, SW, SE. Takes the parent's 4 child lines, binds their ends to the children and adds them to the canvas.
  2. If adding a new depth row caused existing rows to re-layout (collected `MoveElementEvent`s): **Step: Parallel(translate every moved box old → new, 400 ms; cursor fade to 0 in 1 ms)** (`:301-303`, `:508-519`).
  3. Places the children at their layout positions. **Step: Parallel(fade-in 0→1 of 4 children + 4 lines, 200 ms)** (`:311-326`).
  - Note: `moveElements` is never cleared between two IncreaseLevel events of the same operation. A second new-depth split in one insert replays the earlier moves too (bug).
- **MoveEvent** (`:400-415`): on the `editedNodeID` box (the node being split) it calls `setValue(null)` (the value text becomes "" **immediately**, at queue-build time). **Step: fill → LIGHTYELLOW, 200 ms.** The node turns into an inner node. Its point is shown "moving" only by the next GoXX cursor move.
- **CreateEvent** (`:200-217`): **Step: cursor fade 1→0, 200 ms.** Then on the `editedNodeID` box (or root if null): `setValue(p)` and **Step: Parallel(fill → LIGHTCYAN, 200 ms; value text fade-in, 200 ms)**.
- **RemoveEvent** (`:477-495`): **Step: cursor fade out, 200 ms.** Then **Step: Parallel(edited box fill → LIGHTYELLOW, value text fade-out), 200 ms**. The text string is kept but has opacity 0.
- **CollapseEvent** (`:362-393`): the parent becomes `collapsedNode`; the 4 children go into `removeElements`. **Step: Parallel(fade-out of 4 children + 4 parent→child lines), 200 ms.** The elements are physically removed from the layout at the *next* operation's cleanup.
- **SearchComplete** (`:339-355`): **Step: cursor fade out, 200 ms.** Then **Step: stroke of the containing box BLACK → CHARTREUSE (found) or → RED (not found), 1000 ms**. The stroke persists until the next operation.
- **AnimationFinishedEvent**: println only.
- **ResetEvent**: `layoutManager.clear()`, `pane.clear()`, `initialCleanup()`.

### 2.5 Cursor visibility quirk [JAVA]
After the first `CreateEvent` (or the 1 ms hide in a re-layout step) the cursor's opacity is 0. Later cursor *moves* make it `visible=true` but leave opacity at 0. So in Java **the cursor is only visible until the first point is placed (or until the first re-layout)**. After a split, the relocation of the old point and the descent of the new point therefore happen with an invisible cursor; only the cyan fills show them.
- **[PORT]** Show the cursor (the "carried" point) on every descent step. A suggested refinement: show the old point as the cursor while it is relocated, then the new point.

### 2.6 Concrete traces
Model events are real harness output (excluding Init/AnimationFinished/scan, which the controller adds). Steps are the transitions the Java Animator would queue. `pos(X)` = tree layout position of node X.

#### Trace A — insert (60,40), (10,20), (30,10) into an empty tree (two splits)
**Insert (60,40)**
```
Event : Create: Point2D [x = 60.0, y = 40.0]
```
Steps:
1. cursor (0,0) → pos(root)
2. cursor fade out
3. root fill → LIGHTCYAN, value text "[60.0,40.0]" fades in

Grid: frame plus a red dot at (60,40).

**Insert (10,20)**: split of the root
```
Event : GoDown: (50,50)
Event : Creating new Level (50,50) NW=(25,75) NE=(75,75) SW=(25,25) SE=(75,25)
Event : Moving points: (60,40)
Event : Going SE: (75,25)
Event : Create: (60,40)
Event : Going SW: (25,25)
Event : Create: (10,20)
```
Steps:
1. cursor (0,0) → pos(root)
2. 4 children `[25.0,75.0] [75.0,75.0] [25.0,25.0] [75.0,25.0]` plus 4 lines fade in. No re-layout: depth 2 is a new row.
3. root value text cleared; root fill LIGHTCYAN → LIGHTYELLOW
4. cursor pos(root) → pos(SE)
5. cursor fade out
6. SE fill → cyan, "[60.0,40.0]" fades in
7. cursor pos(root) → pos(SW). The start is pos(root) because movePoint was not updated; the cursor is invisible.
8. cursor fade (no-op)
9. SW fill → cyan, "[10.0,20.0]" fades in

Grid: cross through (50,50); dots at (60,40) and (10,20).

**Insert (30,10)**: split of SW
```
Event : Going SW: (25,25)
Event : GoDown: (25,25)
Event : Going SW: (25,25)          <- duplicate getChild call
Event : GoDown: (25,25)            <- split path GoDown(this centre)
Event : Creating new Level (25,25) NW=(12.5,37.5) NE=(37.5,37.5) SW=(12.5,12.5) SE=(37.5,12.5)
Event : Moving points: (10,20)
Event : Going SW: (12.5,12.5)
Event : Create: (10,20)
Event : Going SE: (37.5,12.5)
Event : Create: (30,10)
```
Steps:
1. cursor → pos(root)
2. cursor pos(root) → pos(SW)
3. cursor pos(SW) → pos(SW): a no-op 1 s "pause"
4. re-layout: depth-2 boxes slide to their wider positions (400 ms); cursor hidden (1 ms)
5. SW's 4 children `[12.5,37.5] [37.5,37.5] [12.5,12.5] [37.5,12.5]` plus lines fade in
6. SW value cleared; SW fill → yellow
7. cursor (old pos(SW)) → pos(SW.SW), invisible
8. cursor fade
9. SW.SW cyan, "[10.0,20.0]" fades in
10. cursor (old pos(SW)) → pos(SW.SE)
11. cursor fade
12. SW.SE cyan, "[30.0,10.0]" fades in

Grid: root cross, plus a smaller cross inside the SW cell (horizontal at y=25 for x∈[0,50], vertical at x=25 for y∈[0,50]); dots at (60,40), (10,20), (30,10).

**Duplicate insert (30,10)** (model events: GoSW, GoDown, GoSW, GoSE(37.5,12.5), GoDown, GoSE → `false`): no animation; dialog "Prvek nelze vložit / Tento prvek již ve struktuře <b> existuje </b>."

(For a two-splits-in-one-insert case: inserting (10,10) then (20,20) gives 3 consecutive split groups in a single insert, root → SW → SW.SW (harness `cascade`). Each group is `GoDown, IncreaseLevel, Move, GoXX, Create(old)`, followed by GoXX for the new point.)

#### Trace B — search, on the tree from Trace A
**Search (30,10)**, found:
```
Event : Going SW: (25,25)
Event : GoDown: (25,25)
Event : Going SE: (37.5,12.5)
Event : GoDown: (37.5,12.5)
Event : Search complete: (30,10) Found: true
```
Steps: cursor → root; root → SW; SW → SW.SE; cursor fade; SW.SE stroke → CHARTREUSE (1 s). Grid unchanged.

**Search (40,40)**, missing, lands on an empty leaf:
```
Going SW (25,25); GoDown (25,25); Going NE (37.5,37.5); GoDown (37.5,37.5); Search complete (40,40) Found: false
```
Steps: cursor → root → SW → SW.NE; fade; SW.NE stroke → RED.

**Search (70,30)**, missing, lands on a leaf holding another point (60,40):
```
Going SE (75,25); GoDown (75,25); Search complete (70,30) Found: false
```
Steps: cursor → root → SE; fade; SE stroke → RED.

#### Trace C — remove with collapse (continuing from Trace A)
**Remove (30,10)**, no collapse (SW.SW still holds (10,20)):
```
Going SW (25,25); GoDown (25,25); Going SE (37.5,12.5); GoDown (37.5,12.5); Removing: (30,10)
```
Steps: cursor → root → SW → SW.SE; cursor fade; SW.SE fill → yellow plus value text fade-out. Grid: dot (30,10) gone; SW cross still drawn.

**Remove (10,20)**, which collapses SW:
```
Going SW (25,25); GoDown (25,25); Going SW (12.5,12.5); GoDown (12.5,12.5); Removing: (10,20)
Collapsing event (25,25) NW:(12.5,37.5) NE:(37.5,37.5) SW:(12.5,12.5) SE:(37.5,12.5)
```
Steps: cursor → root → SW → SW.SW; fade; SW.SW → yellow, text fades out; Parallel fade-out of SW's 4 children and 4 lines. The SW box itself stays yellow/empty and becomes a leaf. Grid: SW cross removed; only the root cross and the dot (60,40) remain. The root does not collapse, because SE still holds a point.

**Remove (99,99)**, missing: `Going NE (75,75); GoDown (75,75)` → false. Steps: cursor → root → NE. The cursor stays visible there; no message.

#### Trace D — eventTest data (from `eventTest/QuadTreeEventTest.java`)
Insert (40,40),(10,10),(30,70),(80,80), then (10,12). The last insert splits SW.SW → … five consecutive splits, down to level 6 (centres 6.25, 9.375, 10.9375, …), finally SW at (10.15625,10.15625) holds (10,10) and NW at (10.15625,11.71875) holds (10,12). This is a good stress test for deep layout.

### 2.7 [PORT] Suggested Step mapping
Each Java step above maps to one port Step (snapshot + marks + message + cursor). Recommendations:
- Merge Java's "fade cursor" + "fill/text" pair into one step ("placed").
- Drop the duplicate no-op GoXX on inner nodes, or keep it as a deliberate "enter node" step.
- Show the re-layout implicitly: the port's tree layout is recomputed from each snapshot.

Marks:
- `visiting` (cursor at node)
- `splitting` (node + new children appearing)
- `moving` (old point carried down)
- `placed` (leaf becomes cyan)
- `removed` (leaf back to yellow)
- `collapsing` (4 children fading)
- `found` (CHARTREUSE border)
- `notFound` (RED border)

On the grid, highlight the current cell (`Box`) and the cursor point.

**Step messages:** the original app has **no** step description texts at all. No description area is enabled (`Main.java:42` calls `arrangeScene(as)` without the description flag), and the Animator produces no strings. Any Czech messages are **PORT-NEW**. Suggested wording, to stay consistent with the other apps:
- `Vkládám bod [x, y]`
- `Uzel [cx, cy] je obsazen – dělím na 4 kvadranty`
- `Přesouvám bod [x, y] do kvadrantu SE`
- `Pokračuji do kvadrantu SW [cx, cy]`
- `Bod [x, y] vložen`
- `Bod [x, y] nalezen` / `Bod [x, y] nebyl nalezen`
- `Bod [x, y] odstraněn`
- `Uzel [cx, cy] má 4 prázdné potomky – slučuji`
- `Bod [x, y] ve struktuře není`

---

## 3. Visual style

### 3.1 Window and canvas
- Title **"Quad Tree"** (`application/Main.java:47`). Scene **1000×500** (`:23-24,42`). `application.css` is empty.
- `AnimationSettings.drawPane` is a `DoubleLayerPane`. Its **bottomLayer** is the tree view and its **topLayer** is the grid view. Both have prefSize **4200×500** (`Main.java:44-45`). Each is shown in its own pannable `ScrollPane` (content wrapped in a `Group`) in the BorderPane centre. **Only one view is visible at a time** (`CommonControls.java:207-213,243-256`).
- At startup the tree view is shown with horizontal scroll centred (`centerifyScrollPane`, Hvalue 0.5).

### 3.2 View switch
- A `ViewSwitchButton` sits in the toolbar (`MT-common/.../utils/ViewSwitchButton.java`). It is icon-only: `icons/gridview.png` / `icons/treeview.png`. The icon shows the view you will switch **to**: initially the grid icon while the tree is shown.
- Each click builds a new ScrollPane for the target layer, so the scroll position resets to 0 and is **not** re-centred (the grid sits at x≈1900 inside a 4200-wide pane, so users have to scroll).
- **[PORT]** The current port shows both views side by side. That is acceptable (the help text describes both views). If a toggle is kept, use the labels/tooltips "Plošné zobrazení" / "Stromové zobrazení" (PORT-NEW).

### 3.3 Grid ("plošné") view (`animation/GridView.java`)
- Scale `RATIO = 4` px per unit, so the square is **400×400 px** (`:24,41`).
- Root rectangle: fill **WHITE**, stroke **BLACK** (1 px default). Placed at `layoutX = canvasWidth/2 − 200`, `layoutY = 20` (`:41-46`).
- Cut lines: for every **inner** node (from the scan) one horizontal line at `centerY` spanning `[minX,maxX]` and one vertical line at `centerX` spanning `[minY,maxY]`. Default JavaFX `Line` styling: **black, 1 px** (`:52-55,83-101`).
- Points: `Circle` radius **2 px** (`RATIO/2`), fill **RED**, no stroke, at `(rectX + 4x, rectY + 4y)` (y down) (`:58-66,103-119`).
- Hover label: a `Text` initially `"[ , ]"` at x = square centre, y = 0 (baseline at 0, so it sits just above the square area) (`:48-50`). When the mouse moves over a point it becomes `"[" + x + "," + y + "]"` with Java double formatting, e.g. `[60.0,40.0]` (`:72-81`). It is not reset when the mouse leaves.
- No quadrant labels, no axis labels, no cell fill colours, no highlight of the current cell, and no animation: the view is redrawn wholesale from the scan (`:122-147`).
- Draw order: rectangle, hover text, lines, points.
- Old approach (`oldfiles/Animator.java`, abandoned): it animated the grid itself, with RED cut lines and a ROYALBLUE root stroke, plus a StrokeTransition RED→ROYALBLUE on visited cells. **[PORT]** Highlighting the visited cell on the grid matches that earlier intent and fits the Step model.

### 3.4 Tree ("stromové") view
Node box `QuadElement` (`cz/commons/quadtree/example/layoutManager/QuadElement.java:36-66`):
- Rectangle **48×50**, stroke **BLACK**, width **1.2**, `StrokeType.INSIDE`, initial fill **LIGHTYELLOW (#FFFFE0)**.
- Centred VBox containing:
  1. `coordsText`: font size **9**. It shows the **cell centre** as `"[" + cx + "," + cy + "]"` with Java doubles, e.g. `[50.0,50.0]`, `[12.5,37.5]`, `[6.25,18.75]`. Bottom margin 5 px.
  2. `divider`: horizontal `Line(0,25,45,25)`, 45 px wide, black.
  3. `valueText`: font size **9**, hidden until a value is set. It shows the stored point as `"[" + x + "," + y + "]"`, e.g. `[60.0,40.0]`.

States and colours:
| State | Fill | Value text | Border |
|---|---|---|---|
| Empty leaf | LIGHTYELLOW #FFFFE0 | empty | black 1.2 |
| Leaf with point | **LIGHTCYAN #E0FFFF** | `[x,y]` | black |
| Inner node | LIGHTYELLOW (set by MoveEvent) | empty | black, plus 4 child lines |
| Search found (until next op) | unchanged | unchanged | **CHARTREUSE #7FFF00** |
| Search not found (until next op) | unchanged | unchanged | **RED #FF0000** |
| Cursor | LIGHTYELLOW | none (blank box with divider) | black |

Inner and empty nodes look identical except for the lines going down. **[PORT]** You may keep that, or give inner nodes a slightly different look; mention it in the legend.

There are **no quadrant labels** (NW/NE/SW/SE) in the tree view; only child order conveys the quadrant. **[PORT]** Small edge labels "NW/NE/SW/SE" are a harmless improvement (PORT-NEW).

Edges (`AbstractQuadNodeElement.java:17-29`, `BranchNodeElement.java:67-86`, `QuadElement.java:113-119`):
- `LineElement` (default black 1 px).
- Start: on the parent's **bottom edge** at x offset `j*12` for j = 0..3 (NW, NE, SW, SE), i.e. parent.x + 0/12/24/36, parent.y + 50.
- End: at the child's top, x offset 12 (`width/4`), y + 1.
- So lines do not meet children at their centres. **[PORT]** Use parent bottom → child top centre, or replicate the offsets.

Layout constants: `TreeLayoutSettings(30, 20, 48, 50)` (`Main.java:32`) → paddingTop **15**, "horizontalSpace" (actually the row gap) **30**, "verticalSpace" (actually the sibling gap) **20**, node **48×50** (`TreeLayoutSettings.java:14-37`).
- Row y (depth d, root d=1): `15 + (d−1)·(50+30)` → 15, 95, 175, 255, …
- The layout is a full 4-ary slot grid. Depth d has `4^(d−1)` slots, and a node at slot i has children at slots 4i..4i+3. Empty slots take space (`DepthRow.java`, `QuadTreeHelper.java`).
- Width of the deepest row D: `W = 4^(D−1)·48 + (4^(D−1)−1)·20`. Range: `half = floor(W/4)`, `minX = C − 2·half`, `maxX = C + 2·half`, where C = canvasWidth/2 (2100 with a 4200-wide canvas) (`CanvasRangeInfo.java:17-21`).
- The deepest row is packed tightly: `x_i = minX + i·68` (`DepthRow.initPoints`).
- Each existing row other than the root row is re-spread when a new row is added (`DepthRow.recalculateNodesPositions`, `DepthManager.addDepth`):
  - `minimalOffset = (maxX−minX)/4^(D−1)`, `m = 4^(D−1)/slots`
  - `x_0 = minX − 24 + floor(m/2)·minimalOffset`, `x_i = x_{i−1} + m·minimalOffset`
- The **root row is never recalculated**: the root stays at `C − 24`, y = 15.
- Examples with C=2100:
  - depth 2 only: children at x = 1974, 2042, 2110, 2178 (y = 95)
  - after depth 3 appears: depth-2 boxes at 1675.5, 1942.5, 2209.5, 2476.5; depth 3 at 1566 + 68i (y = 175)
  - depth 4 needs 4332 px, wider than the 4200 canvas; depth 6 would need ~70 000 px.
- Removing the deepest row (after a collapse empties it) calls `removeLastDepth`: the new last row is re-packed and the others re-spread. But the `MoveElementEvent`s generated there are discarded, so the boxes keep their old screen positions (bug, §6).
- **[PORT]** Use any tidy layout. Recommended: keep the "full slot grid" look for shallow trees, or use a subtree-width layout so deep chains do not explode horizontally. Recompute it from each snapshot.

---

## 4. UI specifics

### 4.1 Toolbar (2D mode, `CommonControls(true,true)`, `Main.java:41`; `CommonControls.java:118-128`)
Left to right:
- `Prvek:` label, X text field (50 px), Y text field (50 px)
- | `Vložit`, `Odstranit`, `Najít`
- | view-switch icon button
- | `Krokovat` checkbox, `<<`, `>>`
- | `Rychlost:` slider (0.3–2.5, default 1), `Play/Pause`, `Vzory`, `Reset`, `?`

The debug button `!!!` is created (debug=true) but never added to the toolbar. The shared-toolbar agent covers the generic behaviour.

### 4.2 Input format
- Two separate numeric fields, x and y, both decimal (`.` separator), both in the range 0–100 inclusive (§1.9). There is no combined "x,y" syntax.
- The help text states the range: "Tato implementace pracuje s rozsahem x a y souřadnic 0 - 100."

### 4.3 Error dialogs (verbatim, `CommonControls.java:276-355`; `HTMLDialog`, ERROR icon, OK button, 400×150)
| Situation | Title | Body (HTML) |
|---|---|---|
| Insert, unparsable number | `Prvek nelze vložit` | `Špatný formát vkládaného prvku <b> (není celým číslem) </b>.` |
| Insert, out of range | `Prvek nelze vložit` | `Jedna či více ze zadaných hodnot leží mimo rozsah (0-100)</b>.` (stray `</b>` is in the original) |
| Insert, duplicate | `Prvek nelze vložit` | `Tento prvek již ve struktuře <b> existuje </b>.` |
| Remove, unparsable | `Prvek nelze odstranit` | `Špatný formát odstraňovaného prvku <b> (není celým číslem) </b>.` |
| Remove, out of range | `Prvek nelze odstranit` | `Jedna či více ze zadaných hodnot leží mimo rozsah (0-100)</b>.` |
| Search, unparsable | `Prvek nelze nalézt` | `Špatný formát hledaného prvku <b> (není celým číslem) </b>.` |
| Search, out of range | `Prvek nelze nalézt` | `Jedna či více ze zadaných hodnot leží mimo rozsah (0-100)</b>.` |

- Note: "(není celým číslem)" is wrong for this app, because decimals are accepted. **[PORT]** Keep it verbatim or adjust (e.g. "(není číslem)"), and flag the change.
- There is no error for removing a missing point, and none for searching (search shows the red outcome).
- Unused controller message: `Prvek [x,y] je již ve struktuře obsažen` (`QTreeController.java:104`).

### 4.4 Help (`QTreeController.provideHelp`, `:206-213`; dialog title `Nápověda`, INFORMATION icon, 600×300)
Verbatim HTML:
```
<b>Quad Strom</b> <br> <br>Je stromová struktura, ve který každý vnitřní vrchol má právě 4 potomky. Motivací využití této struktury je dělení dvoudimenzionálních dat do čtyř kvadrantů.<br>V případě vizualizace můžeme Quad strom znázornit jak plošným zobrazením, na kterém jsou zřetelně vidět oddělené jednotlivé regiony, tak hierarchickým (stromovým), jenž přináší pohled na hierarchickou reprezentaci jednotlivých oblastí.<br><br><br>Tato implementace pracuje s rozsahem x a y souřadnic 0 - 100. 
```
(The typo "ve který" is in the original.)

### 4.5 Presets dialog (`MT-common/.../dialogs/PresetsDialog.java`)
- Title `Vytvořit strukturu` (`QTreeController.java:172-173`); label `Sady:`; combo box with `Sada 1`–`Sada 4` (first one preselected); label `Vkládané prvky:`; then the items joined by ", ".
- Items render with JavaFX `Point2D.toString()`, e.g. `Point2D [x = 60.0, y = 40.0], Point2D [x = 10.0, y = 20.0], Point2D [x = 30.0, y = 70.0], Point2D [x = 80.0, y = 80.0]`. **[PORT]** Render as `[60, 40], [10, 20], …` (PORT-NEW) unless pixel-faithfulness to that string is wanted.
- Checkbox `animovat` (ignored here); OK / Cancel buttons.
- OK calls `build(points)` (§1.10).

---

## 5. Tests
- **`tests/structuraltests/QuadTreeTest.java`**: not a JUnit test and has **no assertions**. Its `public static void main()` takes no `String[]`, so it is not even a runnable entry point. It builds a `QuadTree<String>` over 0..100, inserts A(60,60), B(80,80), C(20,20), removes A and B, and prints every `Event` via `@Subscribe handleEvents(Event)`.
  - Expected behaviour (current code): the root splits at insert B. (60,60) and (80,80) both fall in NE, so NE splits too: (60,60) goes to NE.SW and (80,80) to NE.NE. C goes to SW.
  - Removing A produces no collapse (NE.NE still holds B). Removing B collapses NE, since its 4 children are now empty leaves. The root stays split because SW holds C.
- **`eventTest/QuadTreeEventTest.java`** + **`EventLogger.java`**: a JavaFX `Application` whose `start` calls `main()`. It inserts (40,40),(10,10),(30,70),(80,80), prints a separator, then inserts (10,12). `EventLogger` implements `QuadTreeEventHandler` and prints every event. The `@Subscribe` annotations live on the interface; Guava 18 finds them through supertypes. No assertions. The trace of the last insert is §2.6 Trace D (deep split chain).
- **`log_output.txt`**: a stale trace from an **older** event protocol. Differences from the current code:
  - In the old version, "Going NE/SW" carried the leaf point rather than the child centre.
  - The first split had no `GoDown`/`IncreaseLevel` before the "Moving points" step.
  - Some "Creating new Level" lines appear before moves.

  It covers inserts (60,60),(10,10) and then (60,60),(40,40),(10,10),(80,80),(95,95). Use it only to understand intent; the harness traces above are authoritative.
- **[PORT] test suggestions** derived from these:
  - Presets give the structures in §1.10.
  - The boundary rule: (50,50) → NE; (25,25) under SW → SW.NE.
  - The non-cascading collapse in `cascade` (§1.8).
  - Duplicate → false with no mutation.
  - Remove of a missing point → no mutation and no collapse check.
  - The (10,10)+(10,12) depth-6 chain.

---

## 6. Known bugs, TODOs, intent in commented code
1. **Double `getChild` on insert through inner nodes** (`QuadNode.java:50,55`) emits two identical GoXX events, which become a 1 s no-op cursor move. The commented `// eventBus.post(new GoDownEvent(new Point2D(leaf.x, leaf.y)))` (`:49`) shows earlier variants.
2. **Leftover `getChild` in the split path** (`QuadNode.java:92`, marked `// !!!!`). It returns null and is harmless. A commented alternative posted GoDown at the child centre (`:93-94`); the current code posts GoDown at the splitting node's centre (`:95`, `// !!!`). That was the fix for "inserting into same node that is subject to be moved and split" (commit 6e8a3f6).
3. **`movePoint` not updated after GoXX moves** (`Animator.java:497-506`). The cursor's second move in a split starts from the stale parent position.
4. **Cursor stays at opacity 0** after the first fade, so later moves are invisible (§2.5).
5. **`QuadElement.setPosition` bug**: it sets translateX twice and never sets Y (`QuadElement.java:88-91`). The cursor therefore sits at (0,50) when created, not at (0,0); harmless because the first transition starts at (0,0).
6. **Cursor shows no label**: the `"[%d,%d]"` string passed to the `QuadElement` constructor is ignored (`QuadElement.java:36`, `Animator.java:92-93`). The intent was clearly to show the carried point.
7. **`moveElements` not cleared** between two re-layouts within one operation (`Animator.java:301-303`).
8. **Re-layout after row removal is lost**: `initialCleanup` removes collapsed elements, which generates MoveElementEvents into `moveElements`, and `handleInitAnimationEvent` immediately replaces that list (`Animator.java:176,185-190` vs `:95`). The boxes keep stale positions and later jump.
9. **Root row never re-centred** (`DepthManager.addDepth` loop starts at i=1, `DepthManager.java:25`). The root stays put while the children re-spread (it stays centred only by coincidence of the symmetric formula).
10. **ID scheme** `(int)x*100 + y` collides from depth 6 (§2.3).
11. **No max depth**: very close points produce huge layouts (depth 4 already exceeds the 4200 px canvas).
12. **Collapse is not cascading** (§1.8). It may be intentional, but it leaves an empty tree still split.
13. **Reset does not clear the grid view** (§1.11). The grid is also blank at startup.
14. **Duplicate insert** leaves an orphan cursor box on the pane; the controller's specific exception message is discarded by CommonControls.
15. **Remove of a missing point** gives no feedback; the cursor stays visible at the leaf it reached.
16. **Build**: `addTransitionFinishedListener` accumulates on every build (`QTreeController.java:79-87`). `// ac.setRate(10)` and `// animator.hideAnimationNode()` (`:77-78`) show the intent to fast-forward and hide the cursor at the end. The "animovat" option is ignored.
17. Commented `// quadtree = new QuadTree<Point2D>(...)` in `clear()` (`:193`): the author chose `clear()` over re-creation. Commit 8d5c60b "Fixed covered root issue" added `startAnimation=false` for the build's initial InitAnimation so the cursor no longer covers the root.
18. **Error texts say "není celým číslem"** although decimals are valid (§4.3). The out-of-range message has a stray `</b>`.
19. **Nearest-neighbour `get`** is broken (Double passed by value) and posts a `/* TESTING */` AnimationFinishedEvent (`QuadNode.java:252-254`). `collapse()` (`:127-131`) is a `/* TESTING */` stub. `QuadHelpers` and `GridViewLayoutManager` are empty stubs. `AnimationStartedEvent` and `ValueInsertedEvent` are unused.
20. **Misleading names in `TreeLayoutSettings`**: "horizontalSpace" is used as the vertical row gap and "verticalSpace" as the horizontal sibling gap.
21. Git history: "THERE IS A BUG WHEN INSERTING AFTER THE STRUCTURE HAS BEEN GENERATED" (b1192d9) was addressed by the reset/cleanup work in 6e8a3f6 and 8d5c60b. The latest commit only added the event logger, the interface `QuadTreeEventHandler`, and a blank line in presets.
22. `oldfiles/`: a previous Animator (animated grid with red/royal-blue strokes, `NodeView2D*`), an older `TreeLayoutManager`, and an empty skeleton `QtreeController` (bounds-based constructor, empty insert/remove/search). These are superseded and only useful for the "highlight cells in grid" intent.
