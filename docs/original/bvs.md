# BVS (Binary Search Tree) — Port Specification

Source repo: `/Users/viktor.krejcir/Dev/viktor/thesis2/bitbucket/bvs`. HEAD is `90d4d37` ("Updated structure", 2015-09-19), and it is the authoritative version.
Shared libs: `MT-common` (cz.commons.*: layout manager, graphics, AnimationControl, dialogs) and `MT-guiprovider` (components.CommonControls, Controller).
Paths below are relative to `bvs/src/` unless they are prefixed with `MT-common/` or `MT-guiprovider/`.

> **Important up front:** this app shows **no step/description messages**. There is no Czech step text anywhere. `CommonControls.arrangeScene(as)` is called without the description area (`application/Main.java:35`, `MT-guiprovider/src/components/CommonControls.java:198-200,227-235`). The only user-facing strings are the toolbar, the help dialog, the presets dialog, the error dialogs from the shared code, and three exception messages. Section 4 lists them all. Any step messages in the port must be **newly authored**. Section 2.7 has a proposed set, and it is clearly marked as not original.

---

## 0. Architecture of the original (for orientation)

- `Main` (`application/Main.java`) creates a `Pane canvas` and `TreeLayoutSettings(20,20,30,15)`. It also creates `CommonControls(true,false)` and `BSTController(tls, canvas)`.
- `BSTController` (`application/BSTController.java`) owns a Guava `EventBus` (Guava 18, `MT-common/lib/guava-18.0.jar`), the model `BinarySearchTree`, the `Animator` and one shared `AnimationControl ac`.
- The model posts **events** synchronously while it mutates (`application/structure/BinarySearchTree.java`). The `Animator` (`application/animation/Animator.java`) turns each event into one or more JavaFX `Transition`s and appends them to `ac.getTransitions()`. All graphics side effects that happen in the handlers (creating nodes, adding to the canvas, layout-manager bookkeeping) run **at event time**, before playback. Only the transitions run later.
- **Each top-level transition in `ac.getTransitions()` is one "step"**. "Krokovat" (stepping) pauses after each one (`MT-common/src/cz/commons/animation/AnimationControl.java:115-132`). This is the natural granularity for the port's `Step` list.
- `@Subscribe` sits on the interface `BSTEventHandler` (`application/animation/BSTEventHandler.java:18-46`). Guava 18 honours supertype annotations, so `handleReplaceEvent` and `handleStructuralChangeEvent` (which have no annotation in `Animator`) still receive events. Commit `8552af3`, "Handling Events fixed", added these annotations.
- The layout manager has its own internal EventBus (`DepthManager`, `MT-common/.../layoutManager/DepthManager.java:13,34`), and the Animator is registered on it as well (`Animator.java:61`). It receives `MoveElementEvent`s synchronously whenever `addElement`/`removeElement` recalculates positions.

---

## 1. Data-structure semantics

### 1.1 Node / identity
- `Node` (`application/structure/Node.java`) has `value`, `left`, `right`, `parent`. **id == value** (`KEY_IS_VALUE = true`, `Node.java:9,38-45`). Graphics elements are keyed by value, so values must be unique.
- Values are Java `int`, parsed with `Integer.parseInt(text)` (`CommonControls.java:99-104`). Negatives are allowed and whitespace is not trimmed. There is no range limit beyond 32-bit int (the 3-digit `NumberValidationHandler` is commented out at `CommonControls.java:72-77`). The node box is a fixed 30 px, so long numbers overflow it visually.

### 1.2 Insert — `add(int)` (`BinarySearchTree.java:188-241`)
1. **Empty tree:** `root = new Node(v)` and post `CreateRootEvent(v)`. No `StartEvent` and no comparisons (`:190-196`).
2. Otherwise post `StartEvent(v)` (`:198`), then loop with `parent = root`:
   - If `parent.value == v`, throw `Exception("Tento prvek je již ve stromu obsažen")` (`:201-203`). This check runs **before** that node's CompareEvent, so the duplicate node is never "visited" by the badge.
   - If `v < parent.value`, post `CompareEvent(v, parent.id)`. Descend left, or if left is null create the left child and post `CreateEvent(v, parent.id)`, then return (`:204-219`).
   - Otherwise (`v > parent.value`), post `CompareEvent(v, parent.value)` (same thing, since id == value). Descend right, or create the right child and post `CreateEvent` (`:221-236`).
   - The CompareEvent is posted **before** checking whether the child exists, so the path includes the node that becomes the new parent.
3. **Duplicates:** `BSTController.insert` catches **all** exceptions silently and does not call `playForward` (`BSTController.java:84-94`). A duplicate insert therefore does **nothing visible**: no dialog and no animation. The queued `StartEvent`/compare transitions are dropped at the next operation. One leftover remains: the yellow badge is added at canvas (0,0), which is off-screen when the view is centred. The shared `DuplicateException` dialog ("Prvek nelze vložit" / "Tento prvek již ve struktuře <b> existuje </b>.", `CommonControls.java:310-312`) is never triggered by this app.

### 1.3 Search — `searchV2(int)` (`BinarySearchTree.java:144-186`)
- Empty tree: post `SearchFinishedEvent(false, v)` only (`:145-148`). In the Animator this throws `IndexOutOfBoundsException` (`ac.getTransitions().get(-1)`, `Animator.java:245`), which Guava catches and logs. **Result: nothing happens.** The port should show a "not found / empty tree" result instead.
- Otherwise post `StartEvent(v)`. For each visited node, post `CompareEvent(v, node.id)` (the found node and the last node of an unsuccessful path are included). Then:
  - `v < node` with no left child → `SearchFinishedEvent(false, v)`.
  - `v > node` with no right child → `SearchFinishedEvent(false, v)`.
  - equal → `SearchFinishedEvent(true, v)`.
- (`treeTraversal` at `:100-142` is the same walk, used by remove. It posts Start and Compare events but **no** SearchFinishedEvent, and it sets the field `actual` to the found node or null.)

### 1.4 Remove — `remove(int)` (`BinarySearchTree.java:243-611`)
Errors (thrown, `:247-255`):
- Empty tree → `Exception("Strom je prázdný")`. Thrown before any event.
- Not found → `Exception("Prvek není ve stromu obsažen")`. Thrown **after** `treeTraversal` has posted Start and Compare events. Those transitions are never played because `BSTController.remove` propagates the exception before `ac.playForward()` (`BSTController.java:115-123`).
- (Neither message reaches the user in the current shared code. See §6.1.)

Then the node `candidate = toRemove = found node`:

| Case | Condition | What the original does | Replacement |
|---|---|---|---|
| Leaf | no children | `removeLeaf` (`:724-743`): unlink from parent (or `root=null`). Post `RemoveEvent(id, parentId or null, leaf=true)`. | — |
| A1 | has **left** child L, and `L.right == null` | L is spliced into toRemove's place: parent link → L, `L.right = toRemove.right`, `L.parent = toRemove.parent` (`:310-367`). | **L** (the in-order predecessor, which is L itself) |
| A2 | has left child L, `L.right != null` | P = rightmost node of L's subtree. `P.parent.right = P.left`. P takes the candidate's place (parent link or `root = P`). Then `P.left = cand.left`, `P.right = cand.right`, and parents are fixed (`:368-436`). | **P** (in-order predecessor) |
| B1 | **no left** child, R = right child, `R.left == null` | **Crashes with NullPointerException** at `:447` (`toRemove.getLeft().getId()` while left is null; `:455` would crash too). Intended: R spliced up. | (R) |
| B2 | no left child, `R.left != null` | S = leftmost node of R's subtree. `S.parent.left = S.right`. S takes the candidate's place (`:504-564`). | **S** (in-order successor) |

Summary:
- **Two children → always the in-order predecessor** (maximum of the left subtree).
- **Left child only → the predecessor too.** This can be a deep node (A2) rather than simply lifting the child.
- **Right child only → the in-order successor** (B2), or a crash (B1).
- The operation relinks **nodes**; it never swaps or copies **values**. Graphically the two node elements swap **positions**, and then the removed node fades out.
- Return value is the removed value (`:609`), which is unused.

After relinking, the following are posted, in this order (`:586-608`):
1. `ReplaceEvent(originalID = removed value, replacingID = replacement value)` with `lines = List<ReferenceHelper>`. Each helper is (node id, left/right child line, oldReference, newReference) and describes how child lines are re-targeted. The list is: parent's line to toRemove (only if toRemove is not the root) → toRemove.L → toRemove.R → "parentalLineReplacing" (the line from the replacement's old parent) → replacement.L → replacement.R (`:572-583`).
2. `RemoveEvent(removed value, parentIdOfReplacement or null, leaf=false)`.
3. If `requiredStructureChange`: `StructuralChangeEvent`, whose structure is a BFS `TreeStructure` of the subtree rooted at the replacement (`utils/TreeStructureBuilder.java`, `utils/CustomWidthIterator.java`). `requiredStructureChange = (left child of the removed node has exactly one child)` in the A cases (`:306-308`), and the same test on the right child in the B cases (`:440-442`).
4. `AnimationFinishedEvent` (its handler is empty, `Animator.java:578-583`).

Textbook-equivalent result (A1/A2/B2, non-root or A2/B2 root): a correct BST in which the removed node is replaced by its in-order predecessor (or the successor when there is no left child). **For the port, use exactly this rule:**
- leaf → delete;
- has left subtree → replace by the in-order predecessor (max of left subtree), with the predecessor's left child taking the predecessor's old place;
- otherwise → replace by the in-order successor (min of right subtree), with the successor's right child taking its place.

This reproduces the original's observable choices **without its bugs** (§6). The one-child-left case with `L.right == null` simply lifts L (predecessor = L). The one-child-right case with `R.left == null` lifts R (B1 as intended).

Old unit tests (now deleted) assert exactly this behaviour (§5).

### 1.5 Build / presets ("Vzory") — `BSTController.showPresets/build` (`BSTController.java:44-79,147-158`)
- Shared `PresetsDialog` with title **"Vytvorit strukturu"** (sic, no diacritics), labels "Sady:" and "Vkládané prvky:", and a checkbox "animovat" (`MT-common/.../dialogs/PresetsDialog.java:57-59,84-86`). The dialog is 500×300 and shows the selected set's items comma-separated. The **"animovat" checkbox is ignored**: the build is always animated.
- Preset list (`application/BSTPresets.java:15-19`), in this order:
  1. **"Sada 1"**: 50, 100, 20, 80, 10, 40, 120
  2. **"Sada 2"**: 20, 10, 40, 5, 15, 35, 60, 30, 37, 50, 80
  3. **"Sada 3"**: 60, 40, 50, 70, 80, 35 (added in HEAD commit 90d4d37)
  4. **"Degradovaný strom"**: 10, 20, 30, 40, 50
- On OK: `totalClear()` (new EventBus, canvas cleared, new BST and new Animator; `ac` is kept), then `InitAnimationEvent` (clears `ac`), then `bst.add(v)` for each value in order (exceptions swallowed, so duplicates are skipped). Then `ac.setRate(10)`, add a TransitionFinished listener that calls `ac.setRate(1)`, and `ac.playForward()`. The whole build is therefore one long animation at **10× speed**, consisting of the concatenated insert steps of every value (§2).
- Port: build = sequential inserts recorded as steps and auto-played fast (10×), or optionally jump to the end. Rate returns to normal afterwards.

### 1.6 Reset — `BSTController.reset → totalClear()` (`BSTController.java:160-174`)
Immediately clears the canvas and creates an empty tree and a new Animator. No animation. (`ac` is not cleared. See §6.)

---

## 2. Events and animation sequence

### 2.1 Durations (`utils/AnimationTools.java:20-21`)
- `DURATION` = **1000 ms**: all node/badge translations made with `moveTransition`.
- `SHORT_DURATION` = **200 ms**: fades of nodes, badge and lines.
- Layout-shift translations in `moveElementsWhileLayoutChanges` use `TranslateTransitionBuilder` **without a duration**, so they get the JavaFX default of **400 ms** (`Animator.java:585-599`).
- "Immediate" fades are 1 ms (`Duration.ONE`): `immediateHide` and the SwapProcessor line fades.
- Everything is multiplied by the speed slider rate (0.3–2.5, default 1), or by 10 during preset builds.

### 2.2 Event classes (`src/events`) and Animator handling

| Event | Data | Emitted by | Animator handling (`Animator.java`) |
|---|---|---|---|
| `InitAnimationEvent` | `baseRate` (unused) | Controller before each insert/remove/search/build (`BSTController.java:55,85,116,127`) | `ac.clear()`: empties the step list and resets the index (`:66-77`). |
| `StartEvent(id)` | value being inserted, searched or removed | add (non-empty tree), searchV2 (non-empty), treeTraversal (remove) | At event time: removes the previous badge and the previous `toBeRemovedNode` (+ its two child lines) from the canvas. Creates a new **badge** = `BSTNodeWithLine(value, 30, 15)`, a yellow box showing the value, visible at canvas **(0,0)**. Sets `movePoint=(0,0)`, `moveElements=[]` (`:81-103`). **No transition added.** |
| `CompareEvent(insertingID, comparedID)` | value, compared node id | add/search/traversal, once per visited node | One step: `Parallel(Translate badge movePoint → layoutPos(comparedID), 1000 ms)`. Sets `movePoint = target` (`:211-226`). The badge exactly covers the compared node (same size and position). A comparison string such as `"26>20"` / `"35<40"` is computed but its display is commented out (`:213-219`). The tree node itself gets **no** highlight. |
| `CreateRootEvent(id)` | value | add on empty tree | New node element plus its two (hidden) child lines added to the canvas; `layMan.addElement(root, null, false)`. One step: `Parallel(Translate root (0,0) → rootPos, 1000 ms)`, so the root **slides in from the canvas top-left corner**. `movePoint = rootPos` (`:186-207`). |
| `CreateEvent(id, parentId)` | new value, parent value | add | At event time: new node created with `visible=false`, its child lines added to the canvas, `layMan.addElement(node, parentId, id<parentId)`. This triggers layout recalculation, and `MoveElementEvent`s for shifted nodes are collected. The parent's child line (LEFT if `id<parentId`, else RIGHT) is re-targeted with `setEnd(node)` while still hidden. Steps added (`:107-184`): **(a)** if there were layout moves: `Parallel(each moved node Translate old→new 400 ms, badge fade 1→0 in 1 ms)`; else just `badge fade 1→0 in 1 ms`. **(b)** `Translate newNode movePoint(parent's pre-shift pos) → newPos, 1000 ms`. Because it is a bare (non-parallel) transition, the shared `setNodesToVisible` does not unhide the node, so this step is **an invisible 1 s pause**. **(c)** `Parallel(Fade newNode 0→1, 200 ms)`; when it finishes, the parent→child line becomes visible. **(d)** `Fade line 0→1, 200 ms`. |
| `SearchFinishedEvent(found, value)` | | searchV2 | Sets onFinished of the **last queued step** (the final compare move): badge fill becomes **LIGHTGREEN** if found, **LIGHTPINK** if not. Adds the step `Parallel(Translate badge movePoint → movePoint + (0, +50), 1000 ms)`: the badge drops 50 px below the last node (`:228-259`). The badge then stays there until the next operation. On an empty tree this crashes (see 1.3). |
| `RemoveEvent(id, parentId, leaf)` | removed value; parent (leaf case: the removed leaf's parent; non-leaf: the replacement's new parent); leaf flag | removeLeaf / remove | Steps (`:261-288`): **(a)** only if `leaf && parentId != null`: `Fade parent's child line (LEFT if id<parentId else RIGHT) 1→0, 200 ms`. **(b)** `Parallel(Fade removed node 1→0 200 ms, Fade badge 1→0 200 ms)`. Then `layMan.removeElement(id, false)` (recalculates the layout, collects MoveElementEvents), records `toBeRemovedNode`, and adds step **(c)** `Parallel(moved nodes Translate 400 ms, badge 1 ms hide)`. The faded node object stays on the canvas at opacity 0 until the next StartEvent. |
| `ReplaceEvent(originalID, replacingID, lines)` | removed value, replacement value, line re-target list | remove (non-leaf) | One step = `SwapProcessor.process(e)` (`:662-668`, `application/animation/utils/SwapProcessor.java:37-47`), a **SequentialTransition** of: (1) an empty Parallel; (2) **all lines listed in `lines` fade 1→0 in 1 ms**, i.e. vanish instantly; (3) **position swap**: `layMan.swapElement(original, replacing)` runs at event time, then `Parallel(Translate removed node from its slot → replacement's slot, Translate replacement → removed node's slot, 1000 ms)`. On finish (`SwitchElementEndEventHandler`) every listed line is re-targeted to its *new* reference (forward) or *old* reference (back). (4) **all listed lines fade 0→1 in 1 ms**. On finish (`FadesTransitionHandler`), lines whose new reference is null are hidden again (forward). When stepping back, lines whose old reference was null are hidden. Lines with a null reference are pointed at the node's opposite child connector as a placeholder (`SwapProcessor.java:64-80`). Net visual: affected edges blink out, the two nodes cross-move into each other's places in 1 s, and the edges reappear in the new topology. |
| `StructuralChangeEvent(structure)` | BFS `ITreeStructure` of the replacement's subtree | remove when `requiredStructureChange` | `RepairmanLayoutManager.reconstruction()` reassigns the depth/slot of every node in that subtree to match the model. One step: `Parallel(Translate each node old→new, 1000 ms)` (`Animator.java:670-682`, `MT-common/.../RepairmanLayoutManager.java:33-61`). Used to pull a predecessor's or successor's child subtree up one level. |
| `AnimationFinishedEvent` | — | end of non-leaf remove | No-op. |
| `MoveElementEvent(id, old, new)` (from MT-common) | | layout manager on add/remove recalculation | Collected into `moveElements` (`:566-574`), consumed by the CreateEvent/RemoveEvent steps above. |
| `LineConnectionEvent`, `MoveNode` | | **never emitted** | unused. |

### 2.3 Step list per operation (one row = one step)

**Insert v into empty tree**
1. Root node slides from canvas (0,0) to the root slot (1000 ms). No badge.

**Insert v into non-empty tree (path n₁…n_k, where n_k is the new parent)**
1…k. The badge "v" moves to nᵢ (the first move starts from canvas (0,0)), 1000 ms each.
k+1. The layout makes room: shifted nodes move 400 ms (in-order neighbours on the far side of the new node move ±50 px); the badge vanishes (1 ms). If nothing shifts, only the badge vanishes.
k+2. 1000 ms with nothing visible (invisible translate of the new node from the parent's old position to the new slot).
k+3. The new node fades in at its final slot (200 ms).
k+4. The edge parent→new node fades in (200 ms).

Port suggestion: merge k+1..k+4 into 1–2 steps ("make room + node appears", "edge appears"), keeping the shift and the fade-in.

**Search v (non-empty)**
1…k. The badge moves to each visited node (1000 ms each). At the end of step k the badge turns light green (found) or light pink (not found).
k+1. The badge drops 50 px below the last visited node (1000 ms) and stays there coloured.

**Remove v, leaf**
1…k. The badge moves along the path to v (it ends on top of v).
k+1. (if v is not the root) The edge parent→v fades out (200 ms).
k+2. Node v and the badge fade out together (200 ms).
k+3. Layout compaction: nodes shift 400 ms.

**Remove v, internal (replacement r = predecessor/successor)**
1…k. The badge moves along the path to v.
k+1. Swap step: affected edges vanish, then v and r cross-move into each other's positions (1000 ms), then the edges reappear in the new topology. The badge stays where v was and therefore covers r once r arrives (the badge is above all nodes in z-order).
k+2. v (now sitting in r's old position) and the badge fade out (200 ms).
k+3. Layout compaction (400 ms).
k+4. (only if requiredStructureChange) The subtree under r is re-laid out (1000 ms). In practice this lifts the replacement's orphaned child.

### 2.4 Trace 1 — insert 35 into [20,10,30,5,15,25,40]
Layout (C = canvas centre x ≈ 2100, see §3.3). Positions are top-left of the 30×15 box:
- 20 (2085,15)
- 10 (1965,50), 30 (2185,50)
- 5 (1915,85), 15 (2015,85), 25 (2135,85), 40 (2235,85)

Events:
- `InitAnimationEvent`, `StartEvent(35)`
- `CompareEvent(35,20)`, `CompareEvent(35,30)`, `CompareEvent(35,40)`
- `CreateEvent(35, 40)` (35 < 40 → left child; the layout adds depth 3)

What the user sees:
1. A yellow "35" box flies from canvas (0,0) onto 20 (1 s).
2. It moves onto 30 (1 s).
3. It moves onto 40 (1 s).
4. Node 40 slides right 50 px to (2285,85) in 400 ms (the in-order index of 40 went from 6 to 7) while the badge disappears instantly. The edge 30→40 follows because it is bound to the nodes.
5. 1 s pause (invisible move of 35 from (2235,85) to (2235,120)).
6. Node 35 fades in at (2235,120) (200 ms).
7. The edge 40→35 (from 40's bottom-left corner to 35's top-centre) fades in (200 ms).

Model: 40.left = 35.

### 2.5 Trace 2 — search 26 in [20,10,30,5,15,25,40]
Events:
- `InitAnimationEvent`, `StartEvent(26)`
- `CompareEvent(26,20)`, `CompareEvent(26,30)`, `CompareEvent(26,25)`
- `SearchFinishedEvent(false,26)` (26 > 25 and 25 has no right child)

What the user sees:
1. A yellow "26" box flies from (0,0) onto 20.
2. It moves onto 30.
3. It moves onto 25. When it arrives, the box turns **light pink**.
4. The pink box drops 50 px to (2135,135), just below 25, and stays there.

The tree nodes never change colour.

(Found variant, e.g. search 25: the box turns light green on arrival at 25, then drops 50 px.)

### 2.6 Trace 3 — remove 20 (two children) from [20,10,30,5,15,25,40]
Model:
- 20 is the root and has a left child 10 with `10.right = 15` → case A2. The predecessor is P = 15 (the rightmost node of 10's subtree, a leaf).
- `10.right = 15.left = null`. Then `root = 15`, `15.left = 10`, `15.right = 30`. requiredStructureChange = false (10 has two children).
- Result: 15 (10 (5, -), 30 (25, 40)).

Events:
- `InitAnimationEvent`, `StartEvent(20)`, `CompareEvent(20,20)`
- `ReplaceEvent(20, 15, lines)` with lines:
  - [20.L old 10 → null]
  - [20.R old 30 → null]
  - [10.R old 15 → null]
  - [15.L null → 10]
  - [15.R null → 30]
- `RemoveEvent(20, null, false)`
- `AnimationFinishedEvent`

What the user sees:
1. The yellow "20" box flies from (0,0) onto the root 20 (1 s).
2. Swap step: the edges 20–10, 20–30 and 10–15 vanish instantly. Node 20 moves down to 15's slot (2015,85) while node 15 moves up to the root slot (2085,15), 1 s, crossing paths. The "20" badge stays at the root and ends up covering 15. The edges 15–10 and 15–30 then appear instantly.
3. Node 20 (at the bottom) and the badge fade out (200 ms), revealing 15 at the root.
4. Compaction: 10 moves (1965→2015, y 50) and 5 moves (1915→1965, y 85), both +50 px in 400 ms. The right side is unchanged.

### 2.7 Messages — NOT IN ORIGINAL (proposal for the port only)
The original has none. If the port's `Step.message` must be filled, derive messages from the events above, for example:
- Compare: "Porovnávám 35 s 20: 35 > 20, pokračuji vpravo"
- Create: "Vkládám 35 jako levého potomka uzlu 40"
- Search end: "Prvek 26 nalezen" / "Prvek 26 nebyl nalezen"
- Remove: "Uzel 20 má dva potomky – nahrazuji jej inorder předchůdcem 15"
- Leaf removal: "Odstraňuji list 5"

Mark these as new text, not taken from the original. (The commented-out `setTextToNode(compareString)` at `Animator.java:213-219` shows the author meant to display "a<b"/"a>b" in the badge. The `>` branch was also used for equality.)

---

## 3. Visual style (this app)

### 3.1 Node element — `BSTNodeWithLine` (`application/animation/BSTNodeWithLine.java`)
- Shape: **Rectangle 30 × 15 px** (`KEYWIDTH=30`, `HEIGHT=15`, `:14-15`), stroke **black**, stroke type INSIDE (1 px), fill **YELLOW** (`#FFFF00`) (`:38-41`).
- Content: `Text(value)` centred in a StackPane, JavaFX default font (System ~12–13 px, black).
- There is only one node state colour: tree nodes are always yellow. No highlight for compared, new or removed nodes. "New" = fade-in, "removed" = fade-out, "swapping" = translation only.
- Connection points:
  - **parent anchor** (where the incoming edge ends) = (x + 15, y + 1), i.e. the top-centre (`:85-90`);
  - **left-child anchor** = (x, y + 15), the bottom-left corner;
  - **right-child anchor** = (x + 30, y + 15), the bottom-right corner (`MT-common/.../graphics/BranchNodeElement.java:67-86`).

### 3.2 Moving value element ("badge" / cursor)
- The same class and look: a 30×15 yellow box with a black border showing the operated value (`Animator.java:95`). It is added to the canvas after the existing nodes, so it is on top.
- Starts at canvas **(0,0)**, moves onto each compared node (exactly overlapping it), 1 s per hop.
- Search result colour: **LIGHTGREEN** `#90EE90` when found, **LIGHTPINK** `#FFB6C1` when not found (`BSTNodeWithLine.java:70-76`). After the colour change it drops 50 px (§2.2).
- Insert: hidden instantly once the parent is reached. Remove: fades out together with the removed node.
- (The `AnimationSettings` colours GREEN/RED/ROYALBLUE are **not** used by this app.)

### 3.3 Edges and layout
- Edges are `LineElement`s (JavaFX `Line`, default stroke **black, 1 px**, no arrowheads; `MT-common/.../graphics/LineElement.java`). Each node owns two child lines (left, right), hidden until used (`BinaryNodeWithLine.java:10-16`). A line runs from the parent's bottom corner (left or right) to the child's top-centre. Lines are added to the canvas before their node, so they sit below the nodes.
- Layout settings: `TreeLayoutSettings(20,20,30,15)` (`Main.java:30`), i.e. paddingTop 15 (default), "horizontalSpace" 20 (the vertical gap between rows), "verticalSpace" 20 (the horizontal gap between columns), node 30×15. Layout manager: `BinaryTreeLayoutManager(..., CALC_ONLY_INSERTED_NODES)` (`Animator.java:60`) → `LayoutNodesPositionInsertedNodes` (`MT-common/.../LayoutNodesPositionInsertedNodes.java:51-80`). It is an **in-order column layout**: every node gets its own column by in-order index *i*, and r is the root's in-order index.
  - y(depth d) = 15 + d·(15+20) = **15 + 35·d** (`BinaryTreeHelper.getDepthYPosition`, `MT-common/.../BinaryTreeHelper.java:28-31`)
  - root: x = C − 15 (box centred on C)
  - i > r: x = C + 35 + (i − r − 1)·50
  - i < r: x = C − 35 − (r − i)·50
  - Note the asymmetry (a quirk): the gap between the root and its right in-order neighbour is 20 px, but 40 px to its left neighbour. Columns are otherwise 50 px apart (20 px gaps).
  - C = `canvas.getWidth()/2` at Animator construction (`BinaryTreeLayoutManager.java:31`). The canvas pref width is 4200, so C ≈ 2100.
  - Effect: inserting a node shifts every node on the far side of the insertion point **away from the root** by 50 px (the root stays fixed), and removing one shifts them back.
  - Port: an in-order column layout with fixed root, column pitch 50, row pitch 35 and node 30×15 reproduces this. Keeping the 20/40 px asymmetry is optional.
- Canvas: `Pane` with pref size **4200 × 500** (`Main.java:37`), wrapped in `Group` inside a pannable `ScrollPane` with a transparent background (`CommonControls.java:215-224`). Initially scrolled to `hvalue = 0.5` (centred) (`Main.java:44`, `CommonControls.java:272-274`). Window **1000 × 500** (`Main.java:21-22,35`).

---

## 4. UI specifics

- Window title: **"Binary Search tree"** (`Main.java:39`).
- Toolbar: `CommonControls(debug=true, twoD=false)` (`Main.java:34`) gives the standard single-input toolbar (`CommonControls.java:130-133`):
  - "Prvek:" [text field] |
  - "Vložit", "Odstranit", "Najít" |
  - "Krokovat" (checkbox), "<<", ">>" |
  - "Rychlost:" slider (min 0.3, max 2.5, default 1), "Play/Pause", "Vzory", "Reset", "?"
  - `debug=true` creates a "!!!" button, but it is never added to the toolbar, so it is not visible.
- Help ("?") dialog: `HTMLDialog.show("Nápověda", provideHelp(), INFORMATION, OK, 600, 300)` (`CommonControls.java:410-411`). Content verbatim (`BSTController.java:179-181`):
  ```
  <b>Binární vyhledávací strom (BVS) </b> <br> <br>Je binární strom, pro jehož každý vrchol "x", charakterizovaný klíčem K platí, že hodnota klíče vrcholu levého podstromu (tzn. levého potomka vrcholu "x") je menší než K a současně hodnota klíče vrcholu pravého podstromu (tzn. pravého potomka vrcholu "x") je větší než hodnota klíče K. <br>Toto uspořádání umožňuje efektivní procházení stromu postupným porovnáváním hledané hodnoty s  hodnoty klíči vrcholu a postupným traverzováním do levého či pravého podstromu až ke hledanému klíči nebo listům stromu. <br>
  ```
  (Note the original double space and the typo "s  hodnoty klíči".)
- Presets dialog: see §1.5. Title "Vytvorit strukturu", items "Sada 1", "Sada 2", "Sada 3", "Degradovaný strom".
- Error dialogs that can actually appear (shared code, title / HTML body, 400×150, ERROR icon):
  - Insert with non-integer input: "Prvek nelze vložit" / "Špatný formát vkládaného prvku <b> (není celým číslem) </b>." (`CommonControls.java:313-316`)
  - Remove with non-integer input: "Prvek nelze odstranit" / "Špatný formát odstraňovaného prvku <b> (není celým číslem) </b>." (`:288-291`)
  - Search with non-integer input: "Prvek nelze nalézt" / "Špatný formát hledaného prvku <b> (není celým číslem) </b>." (`:346-349`)
- App-level error strings (exception messages, `BinarySearchTree.java:202,248,254`):
  - "Tento prvek je již ve stromu obsažen" (duplicate insert; swallowed, never shown)
  - "Strom je prázdný" (remove on empty tree)
  - "Prvek není ve stromu obsažen" (remove of a missing value)
  - The last two are not displayed by the shared HEAD code (§6.1). **Port recommendation:** show them in an error dialog titled "Prvek nelze odstranit", and show the duplicate one titled "Prvek nelze vložit". For the not-found remove, animate the search path first, then report.

---

## 5. Tests

- **No tests exist at HEAD.** `src/application/testing/` contains only manual JavaFX scratch classes, not tests:
  - `LayoutTest` draws two `BSTblock`s (200×50 yellow rectangles) joined by blue/red/black lines and animates one 800 px over 2 s;
  - `BSTblock` and `NodeElement` are helper graphics.
  - None of them is referenced by `Main`.
- JUnit tests existed under `test/structure/` and were **deleted in commit 52d564c** (they remain in history: `git show 52d564c^:test/structure/RemoveTest.java`). Worth porting as model tests. Fixture: insert 5,2,8,4,9,1,7,0, which gives 5(2(1(0),4), 8(7,9)).
  - `RemoveTest` / `NextGenRemoveTest` (the same assertions, against `remove` and the deprecated `nextGenRemove`):
    - `buildTest`: root == 5.
    - `removeLeafTest`: root.right.right == 9 before; after remove(9), root.right.right == null.
    - `removeInnerNode8Test`: remove(8) → root.right == 7, root.right.right == 9, root.right.left == null (predecessor 7 replaces 8).
    - `removeInnerNode0Test`: remove(1) → root.left.left == 0, root.left == 2, and 0 has no children (the single left child lifts up).
    - `removeRootTest`: remove(5) → root == 4, root.left == 2, root.right == 8, root.left.right == null (root replaced by predecessor 4).
  - `SwapEventTest`: for fixture + 10, rebuild and remove each of 8, 2, 5, 1, 9. Must not throw, and every `ReplaceEvent` must have originalID ≠ replacingID (only logged).
  - `BSTtest`: smoke tests. Build [5,2,8,4,9,1,7]; searchV2(9), (5), (10); remove(8), remove(9), nextGenRemove(8), nextGenRemove(5). Must not throw.
  - Suggested extra port tests (from §6): remove of a node with only a right child (B1), remove of the root when root.left has no right child (A1-root), and remove where the predecessor has a left child (A2 orphan). Assert BST validity and the in-order sequence.

---

## 6. Known bugs, quirks, dead code, intent

### 6.1 Bugs (do NOT replicate; implement the textbook behaviour of §1.4)
1. **B1 NullPointerException**: removing a node that has no left child and whose right child has no left child crashes (`BinarySearchTree.java:447`, also `:455`). Examples: every non-leaf in "Degradovaný strom" (10…40); 70 in "Sada 3". The traversal steps are queued but never played.
2. **A1 root not updated**: removing the root when root.left has no right child (e.g. tree 20,10,30 → remove 20). The model's `root` keeps pointing at the removed node, because `root = …` is missing in `:310-367`; HEAD commit 90d4d37 only added null-guards there. The view shows the correct tree, but the model is corrupt: the removed value is still "found", and later inserts can misplace nodes.
3. **Stale parent pointers**: in A2/B2 the predecessor's left child (or the successor's right child) is re-linked with `P.parent.setRight(P.left)` (`:390`, `:525`) but its `parent` field is not updated.
4. **Orphan subtree in the view**: if the predecessor P (A2) has a left child but the removed node's left child L has two children, `requiredStructureChange` is false and the line helpers declare P.L's old reference as null. P's former left child then stays at its old depth with no incoming edge. Example: [20,10,30,5,15,25,40,13], remove 20 → 13 is left floating. The `requiredStructureChange` heuristic (`:306,440`) only catches some cases. In the A1 + one-child case `layMan.removeElement` returns false (the slot still has a child) and the ghost entry remains in the layout map.
5. **Errors never shown**: `BSTController.remove` is declared `throws Exception` (commit 90a46c1, "Removal exceptions fixed"), but `MT-guiprovider` HEAD `Controller.remove(T)` declares no exception (`MT-guiprovider/src/components/Controller.java:31`), so this does not compile against the shared HEAD. Even if it did, `CommonControls`' remove handler catches only `NumberFormatException` and `OutOfRangeException` (`CommonControls.java:281-295`), so "Strom je prázdný" and "Prvek není ve stromu obsažen" would surface only as uncaught exceptions on the console. The intent is clearly a user-visible error.
6. **Duplicate insert silently ignored** (no dialog) and **search on an empty tree does nothing** (see 1.2 and 1.3). A stray badge is left at canvas (0,0) after a failed insert or remove.
7. **Rate reset leak**: each preset build adds a permanent TransitionFinished listener that calls `ac.setRate(1)` (`BSTController.java:68-77`). From then on, every animation end, and every step end in stepping mode, resets the speed to 1× while the slider still shows the user's value.
8. **Reset doesn't clear `ac`** (`totalClear`, `BSTController.java:160-168`). "<<" and ">>" after a reset replay the old transitions on detached nodes.
9. Search-result colour changes are not undone when stepping back (they are one-way onFinished handlers).
10. Animator quirks that are cosmetic but visible:
    - The cursor and the first root fly in from canvas (0,0), which is off-screen when the view is centred.
    - The new node's 1 s invisible "move" is dead time.
    - In a removal swap the badge covers the replacement node.
    - During preset builds every StartEvent removes the previous badge at event time, so only the **last** value's badge is ever visible. It sits at (0,0) from the start.
11. `BSTNodeWithLine.setPosition` sets translateX twice (`:65-68`; it should set Y). It is harmless because it is only called with (0,0).
12. Layout asymmetry (40 px left of the root vs 20 px elsewhere) comes from `LayoutNodesPositionInsertedNodes`. It is a quirk, not BVS-specific.

### 6.2 Dead / legacy code and what it signals
- `Animator.handleReplaceEventOld`, `swapBSTNodes`, `showLines`, `hideLines`, `hideLinesOLD`, `SwapNodesHandler`, `ManipulatedNodesDTO`: an earlier swap implementation with hand-written line rewiring. It was replaced by `SwapProcessor` (imported from the AVL app in commits 52d564c and 1ff478e). It is unused (no subscription).
- `BuilderAnimMoveNode`, `RotationNodeWrapper` (used only by the builder), `Animator.clear()`, `setTextToNode`/`setBeforeTransition`: unused. The badge was meant to show "a<b" comparison text.
- `BinarySearchTree.nextGenRemove` (@Deprecated, with English messages "The tree is empty" / "There is no such element."), `getInOrderSuccessor`/`getInOrderPredecessor`, `replaceNode`, `removeRoot`, `preorderTraversal`, `treeTraversal`'s commented `EventType` queue, and the constructor's commented "OLD WAY" balanced-build: all leftovers. `nextGenRemove` documents the intended textbook semantics: one child → splice; two children → predecessor if there is no right subtree, otherwise successor. Note that this **differs** from the live `remove`, which prefers the predecessor whenever a left subtree exists. The live `remove` (predecessor-first) and the old tests are authoritative.
- `BSTController.recursiveBuilding` (commented) and `recursiveIndex`: an abandoned per-value build animation.
- `InitAnimationEvent.baseRate`, `LineConnectionEvent`, `MoveNode`: unused.
- `oldfiles/BinarySearchTree.java`: the pre-1ff478e model (no ReferenceHelper line lists, no StructuralChangeEvent, English messages). The only changes since then are the line-helper bookkeeping, Czech messages and the null-guards. Ignore it.
- Git history: 52d564c "Added files from AVL for rebuilding the structure after successful swap"; 1ff478e "Imported shared functionality from AVL"; 8552af3 "Lines fixed. Handling Events fixed. Ready to go."; 90a46c1 "Removal exceptions fixed." (Czech messages, exceptions propagate); 90d4d37 "Updated structure" (Sada 3, null-guards in A1/B1).

### 6.3 Differences vs a textbook BST
- Delete prefers the **in-order predecessor** whenever a left subtree exists, including for a node whose only child is on the left (it may pull a deep predecessor instead of lifting the child). The successor is used only when there is no left subtree.
- Deletion is shown as a **node swap** (positions exchanged, then the target node fades out), not as value copying.
- No duplicates. Comparisons are strict `<` / `>`.
- Search animation shows only the cursor. Nodes are never highlighted.
