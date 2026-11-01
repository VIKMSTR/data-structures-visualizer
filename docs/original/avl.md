# AVL tree app: re-implementation spec (source of truth for the TS/Svelte port)

Source: `/Users/viktor.krejcir/Dev/viktor/thesis2/bitbucket/avltree_version-2` (git HEAD `241c336`, 2015-09-19 "Updated presets").
Shared libs: `MT-common` (`cz.commons.*`, layout manager, animation control, graphics) and `MT-guiprovider` (`components.CommonControls`, toolbar and dialogs; another spec covers these).
All paths below are relative to `avltree_version-2/src/` unless they are prefixed `MT-common/` or `MT-guiprovider/`.

**Verification method.** I compiled the model (`AVLTree`, `AVLNode`, `events/*`, `utils/TreeStructureBuilder` etc. plus `MT-common` `TreeStructure`) against guava-18 without JavaFX. I ran it with an EventBus logger that records every event, and with a random fuzzer of 20 000 trees that checks the BST, AVL and parent-pointer invariants after one removal. Every event trace and every bug claim about the model below was **observed** this way, not inferred. The animation (JavaFX) part comes from reading the code; I could not run it, because JavaFX is not available on this machine.

---

## 0. TL;DR for the port

* A classic AVL tree of `int` keys. The key is both the node id and the value (`AVLNode.java:9,34-46`).
* Balance = `height(right) - height(left)`. Height: null = -1, leaf = 0 (`AVLTree.java:739-743, 948-961`). Positive means right-heavy.
* **Insert is correct.** It does a BST descent, attaches a leaf, then walks from the **new leaf** up to the root. It recomputes the balance of every ancestor and rotates when the balance is ±2. It never stops early (`AVLTree.java:186-241, 715-737`).
* **Remove uses the in-order predecessor** (rightmost node of the left subtree). The predecessor *node is relinked* into the removed node's place. Values are not swapped (`AVLTree.java:304-438`). Only when there is no left subtree does it try the in-order **successor**, and that branch always crashes (see §6).
* **No balance factors, heights or text descriptions are ever drawn.** `UpdateBalanceEvent` is only printed with `System.out` (`Animator.java:746-750`). There is no description panel: `arrangeScene(as)` is called without the description area (`Main.java:41`, `MT-guiprovider/.../CommonControls.java:198-200`). Everything the user sees comes from these visual elements:
  * a yellow **value badge ("cursor")** that flies from node to node;
  * nodes that slide or fade in and out;
  * lines that hide and reappear;
  * a curved **rotation arrow** that fades out over 2 s above the unbalanced node before each single rotation;
  * green or pink badge colour for search found / not found.
* Removal has several real bugs: a crash, a stale root, missed rebalancing and broken parent pointers. The port should implement a **correct** AVL delete (predecessor-relink semantics, with rebalancing that starts at the lowest modified node) and keep the visual vocabulary. See §6 for the list and for what to reproduce versus fix.

---

## 1. Data structure semantics

### 1.1 Node
`application/structure/AVLNode.java`
* Fields: `id`, `value`, `left`, `right`, `parent`, `balance` (`:10-15, :32`). `KEY_IS_VALUE = true`, so `id == value` (`:9, :39-46`). Graphics are looked up by id, so **ids must be unique values**.
* `isLeftChild()` returns false for the root (`:85-93`). `isRightChild()` throws an NPE when called on the root (`:95-97`). It is only called on non-root nodes.
* `hasOneChildren()` is true when the node has exactly one child (`:111-113`).

### 1.2 Height and balance
* `height(null) = -1`, `height(leaf) = 0`, otherwise `1 + max(height(l), height(r))` (`AVLTree.java:948-961`).
* `setBalanceOfNode(n)`: `balance = height(n.right) - height(n.left)`. It posts `UpdateBalanceEvent(value, balance)` **before** storing the balance (`:739-743`). The balance is recomputed from heights each time and is never maintained incrementally.
* Sign convention: **+ = right subtree taller, - = left subtree taller.** The trigger values are -2 and +2.

### 1.3 Rebalancing (`recursiveBalancing`, `AVLTree.java:715-737`)
```
recursiveBalancing(n):
  setBalanceOfNode(n)                       // emits UpdateBalanceEvent
  if n.balance == -2:
     if height(n.left.left) >= height(n.left.right): n = rotationR(n)    // LL -> single right
     else:                                           n = rotationLR(n)   // LR -> left(n.left), then right(n)
  elif n.balance == +2:
     if height(n.right.right) >= height(n.right.left): n = rotationL(n)  // RR -> single left
     else:                                             n = rotationRL(n) // RL -> right(n.right), then left(n)
  if n.parent != null: recursiveBalancing(n.parent)   // always continues to the root, never stops early
```
* The `>=` covers the **balance-0 child case on delete** (sibling balanced), which gives a single rotation, as in the textbook. Observed: tree `(20 (10 5 15) 30)`, remove 30 → 20 = -2, child 10 has balance 0 → single `rotationR(20)` → `(10 5 (20 15 .))`.
* After a rotation, `n` is the new subtree root, so the walk continues from that node's parent.
* `rotationLR(n)`: `n.left = rotationL(n.left); return rotationR(n)` (`:924-928`). `rotationRL(n)`: `n.right = rotationR(n.right); return rotationL(n)` (`:936-939`). A double rotation therefore emits **two** rotation events. Each one has its own arrow and its own animation step.
* Inside each single rotation, the rotation event is posted **after** the relinking. Then `setBalanceOfNode(n)` and `setBalanceOfNode(a)` are called (old root first, then new root), which emits two more `UpdateBalanceEvent`s (`:816-817, :911-912`). The root is updated when `a.parent == null` (`:813-815, :908-910`).

### 1.4 Rotations
`rotationL(n)` (`:751-820`): `a = n.right`. Then `n.right = a.left` (and that child's parent becomes n), `a.left = n`, the parent's child pointer is set to `a`, and `n.parent = a`.
`rotationR(n)` (`:828-916`) is the mirror image.
Each rotation builds a list of `ReferenceHelper`s. A `ReferenceHelper` is one child-line change, stored as (node, side, oldTarget, newTarget):
* **Left rotation**
  * `parentalReference` (when n is not the root): parent of n, n's side, old n → new a.
  * `replacingToChildReference`: a.left, old `a.left` (may be null) → new n.
  * `rotatedToChildReference`: n.right, old a → new `a.left` (or null).
* **Right rotation** has the mirror references. When n **is the root** it also adds a `rootyReference` (`:849-861, 897-900`): a.right, old = `a.right`, or `a` itself ("selfreference") when a.right is null, → new n.
* `structure` = BFS snapshot of the new subtree rooted at `a` (`utils/TreeStructureBuilder.java`, `utils/CustomWidthIterator.java`). The animator uses it to relayout that subtree.

### 1.5 Insert (`AVLTree.add`, `:186-241`)
1. Empty tree → `root = new AVLNode(v)`. Post `CreateRootEvent(v)`. Done (no `StartEvent`, no compare).
2. Otherwise post `StartEvent(v)`, then walk down from `parent = root`:
   * If `parent.value == v`, **throw `Exception("Tento prvek je již ve stromu obsažen")`** (`:199-201`). This check happens *before* the `CompareEvent` for that node, so the duplicate node is never "visited".
   * If `v < parent.value`, post `CompareEvent(v, parent.id)`. Go left, or attach `n` as the left child and post `CreateEvent(n.id, parent.id)`.
   * Otherwise post `CompareEvent(v, parent.value)` (same as the id). Go right, or attach as the right child and post `CreateEvent`.
   * After attaching: `recursiveBalancing(n)`, which starts at the **new leaf** (its balance is 0) and walks up to the root.
3. Fuzzing found no invariant violations after inserts.

### 1.6 Search (`AVLTree.searchV2`, `:142-184`)
* Empty tree: post `SearchFinishedEvent(false, v)` only, with no `StartEvent`. The Animator then throws inside the subscriber (empty transition list, `movePoint` null). Guava logs the error and nothing is shown.
* Otherwise post `StartEvent(v)`. At each node post `CompareEvent(v, node.id)` (this includes the node that matches). Then go left or right. If the needed child is null, post `SearchFinishedEvent(false, v)`. On a match, post `SearchFinishedEvent(true, v)`.

### 1.7 Remove (`AVLTree.remove`, `:243-613`)
1. Empty tree → `throw Exception("Strom je prázdný")` (`:247-249`).
2. `treeTraversal(v)` (`:98-140`) posts `StartEvent(v)` and then `CompareEvent(v, node.value)` for every node on the path, **including the matching node**. If not found → `throw Exception("Prvek není ve stromu obsažen")` (`:253-255`). The Start and Compare events have already been posted by then, but nothing plays (see §2.7).
3. **Leaf** → `removeLeaf` (`:637-657`): unlink from the parent. Post `RemoveEvent(id, parentId, leaf=true)`, then `recursiveBalancing(parent)`. If it was the root: `RemoveEvent(id, null, true)` and `root = null`.
4. **Inner node** (call it X). Let L = X.left and R = X.right.
   * **A: L exists and L.right == null.** L is the in-order predecessor (`:310-369`). L moves into X's place: X's parent now points to L, `L.right = R`, `L.parent = X.parent`, and L keeps its own left subtree. `replacedID = L`. If L has exactly one child (necessarily a left child), set `requiredStructureChange = true` (`:306-308`).
   * **B: L exists and L.right != null.** The predecessor P is the rightmost node of L (`:370-438`). `P.parent.right = P.left`. Then P takes X's place: it gets X's parent link (or becomes the root), `P.left = X.left`, `P.right = X.right`, and `P.parent = X.parent`. `requiredStructureChange` is still decided by `L.hasOneChildren()`, not by P.
   * **C: no L (only a right child).** This is the intended in-order successor branch: either R itself (`:446-505`) or the leftmost node of R (`:506-566`). **The code always crashes here with an NPE** (see §6.1).
5. `ReplaceEvent(removedValue, replacingId)` is posted with 6 line `ReferenceHelper`s (`:574-592`):
   * parent→X becomes parent→replacing;
   * X.left and X.right are cleared;
   * the replacing node's old parent line is cleared;
   * the replacing node's left and right lines point to its new children.
6. Then `RemoveEvent(removedValue, toRemove.parent?.id, leaf=false)`. **The local `toRemove` means different things per branch:**
   * in A it is still X, so the parent is X's original parent;
   * in B it is P after relinking, so the parent is X's original parent;
   * if X was the root in B, the parent is null.
   
   If that parent is not null, call `recursiveBalancing(parent)` (`:593-600`). **Rebalancing therefore starts at X's original parent.** It skips the replacing node itself and, in branch B, the whole path from P's old parent up to X. If the root was removed in B, no rebalancing happens at all. This is a bug (§6.3).
7. If `requiredStructureChange`, post `StructuralChangeEvent(structure = subtree rooted at the replacing node)` (`:602-608`). Then post `AnimationFinishedEvent` (a no-op in the animator) and return.

**Semantics decision for the port:** keep **predecessor + node relink** (the replacing node keeps its id and box). Use the in-order successor only when there is no left subtree, which is what the original intended. Run rebalancing correctly from the lowest structurally changed node:
* in branch A: the replacing node L;
* in branch B: P's old parent;
* in branch C: the analogous node.

The original's visual vocabulary (the swap of X and its replacement, then the fade-out of X) maps onto this directly.

### 1.8 Duplicates, validation, value range
* Input is parsed with `Integer.parseInt(text)` (`MT-guiprovider/.../CommonControls.java:99-104`). Any 32-bit int, including negative numbers, is accepted. There is no range check: the `NumberValidationHandler` is commented out (`CommonControls.java:72-77`). The node box is a fixed 30 px wide, so long numbers overflow the box visually.
* Parse failures show shared dialogs (verbatim, HTML):
  * Insert: title `Prvek nelze vložit`, body `Špatný formát vkládaného prvku <b> (není celým číslem) </b>.`
  * Remove: title `Prvek nelze odstranit`, body `Špatný formát odstraňovaného prvku <b> (není celým číslem) </b>.`
  * Search: title `Prvek nelze nalézt`, body `Špatný formát hledaného prvku <b> (není celým číslem) </b>.`
  (`CommonControls.java:288-291, 313-316, 352-355`)
* **Duplicate insert:** the model throws a plain `Exception`, and `AVLController.insert` catches **all** exceptions and only prints the message to stderr (`AVLController.java:117-128`). The shared duplicate dialog (`Prvek nelze vložit` / `Tento prvek již ve struktuře <b> existuje </b>.`, `CommonControls.java:310-312`) is **never shown**, because a `DuplicateException` is never thrown. The user sees nothing happen. A stray badge is created at canvas (0,0), which is off-screen (§2.2). **Port:** show the shared duplicate dialog.
* **Remove errors:** `AVLController.remove` declares `throws Exception` and rethrows (`:148-156`, changed in commit `8afbdfa` "Fixed removal exceptions"). But the committed `MT-guiprovider` `Controller.remove(T)` declares no checked exception (`Controller.java:31`), and its handler catches only `NumberFormatException` and `OutOfRangeException` (`CommonControls.java:277-297`). So HEAD does not compile against the committed guiprovider, and the intended dialog is unknown. **Port:** show `Prvek nelze odstranit` with body `Strom je prázdný` or `Prvek není ve stromu obsažen` (the exception messages, verbatim).
* **Search on an empty tree / not found:** there is no dialog. Not found is shown only by the pink badge.

### 1.9 Presets ("Vzory") (`AVLPresets.java:11-23`)
The dialog is the shared `PresetsDialog`, titled `Vytvorit strukturu` (sic, no diacritics; `AVLController.java:181-182`). Values are inserted in this order:

| Name | Values | Resulting tree (observed) | Rotations during build |
|---|---|---|---|
| `Sada 1` | 50, 100, 20, 80, 10, 40, 120 | `(50 (20 10 40) (100 80 120))` | none |
| `Sada 2` | 20, 10, 40, 5, 15, 35, 60, 30, 37, 50, 80 | `(20 (10 5 15) (40 (35 30 37) (60 50 80)))` | none |
| `Sada 3` | 60, 40, 50, 70, 80, 35 | `(50 (40 35 .) (70 60 80))` | LR at 60 when 50 is inserted; RR at 60 when 80 is inserted |
| `Degradovaný strom` | 10, 20, 30, 40, 50 | `(20 10 (40 30 50))` | RR at 10 (on inserting 30); RR at 30 (on inserting 50) |

Notation: `(v L R)`, `.` = empty, a bare number = a leaf. `Sada 2` was fixed in `f29fa55` (previously `50,100,80,75,120`). `Sada 3` was added in `241c336`.

Build behaviour (`AVLController.java:44-79`):
1. `totalClear()` (as Reset).
2. Post one `InitAnimationEvent`.
3. Insert every value; errors are swallowed.
4. `ac.setRate(10)` and register a finished-listener that sets the rate back to **1**. That ignores the slider value, and the listeners accumulate across builds.
5. `playForward()`.

So the whole build plays as **one continuous animation at 10× speed**, and it honours "Krokovat" (stepping). The dialog's `animovat` checkbox is ignored by this app. Because `handleStartEvent` removes the previous badge from the canvas at event-post time (`Animator.java:96-99`), all badges except the last insert's are invisible during a build. **Port:** treat build as a fast batch of inserts (one combined step list, or jump straight to the final snapshot). The cursor does not matter there.

### 1.10 Reset (`AVLController.java:192-206`)
`totalClear()`:
* new EventBus;
* `pane.getChildren().clear()`;
* new `AVLTree`;
* new `Animator` (which creates a new layout manager).

The `AnimationControl` object is **reused and not cleared** (its old queue survives until the next `InitAnimationEvent`). This is a minor quirk; the port should simply reset everything.

### 1.11 Help (`AVLController.java:208-214`), verbatim HTML
Shown by the shared help dialog (title `Nápověda`, 600×300, `CommonControls.java:409-417`):
```
<b>AVL (Adelson-Velskij, Landis) strom </b> <br><br>je binární vyhledávací strom rozšířený o samovyvažovací mechanismus, který zabraňuje degeneraci struktury.<br>Vyvážení stromu je dosaženo pomocí tzv. rotací, kdy jsou jednotlivé podstromy přesouvány tak, aby bylo dosaženo stavu, <br> kdy se délka nejdelší větve levého a pravého podstromu každého uzlu se liší nejvýše o 1 .
```
(Keep the typos as they are: "se ... se liší", the space before the final ".".)

---

## 2. Event and animation sequence

### 2.0 Plumbing
* `AVLController` posts `InitAnimationEvent` before every operation. The Animator then calls `ac.clear()`, which empties the transition queue (`Animator.java:78-89`).
* The model posts Guava EventBus events **synchronously** while it computes. The `Animator` (registered on the bus) appends JavaFX transitions to `ac.getTransitions()` and also updates its own layout manager immediately.
* After the model returns, the controller calls `ac.playForward()`. Each **top-level transition is one "step"** for `Krokovat`, `<<` and `>>` (`MT-common/.../AnimationControl.java`). Before each step plays, `AnimationsHelper.setNodesToVisible` sets `visible=true` on every node targeted by a Fade or Translate transition inside it, recursively (`MT-common/.../TransitionControl.java:13-19`).
* Subscriptions: `@Subscribe` is declared on the `AVLEventHandler` interface methods (`AVLEventHandler.java:21-58`), and Guava 18 honours annotations on interfaces. `handleRotationEvent(RotationEvent)` (`Animator.java:738-744`) receives both `RotationLeftEvent` and `RotationRightEvent` by supertype dispatch. The specific `handleRotationLeft/RightEvent` only print.
* Durations (`utils/AnimationTools.java:20-21`, scaled by the speed rate, slider 0.3–2.5, default 1):

| Constant | Value | Used for |
|---|---|---|
| `DURATION` | 1000 ms | moves |
| `SHORT_DURATION` | 200 ms | fades |
| `Duration.ONE` | 1 ms | instant hide/show |
| `TranslateTransitionBuilder` default | 400 ms | layout-shift moves (`Animator.java:595-609`) |
| `FADE_DURATION` | 2000 ms | rotation arrow (`BuilderRotationElement.java:24`) |

### 2.1 Event catalogue (`src/events`)
| Event | Data | Posted by | Animator reaction |
|---|---|---|---|
| `InitAnimationEvent` | baseRate (unused) | controller before each op | `ac.clear()` |
| `CreateRootEvent` | id | add to an empty tree (`AVLTree:192`) | create the node at (0,0), add it to the layout and canvas. **Step:** move it from (0,0) to the root slot, 1 s (`Animator:194-215`). |
| `StartEvent` | id = value being processed | add (non-empty), search, remove | Remove the previous badge and any faded removed node from the canvas. Create a new badge with the value text, at (0,0), visible (`:91-115`). No step. |
| `CompareEvent` | insertingID, comparedID | each visited node | **Step:** badge moves from its current point to the compared node's slot, 1 s. The badge ends up exactly covering that node (`:217-235`). The `"a<b"` / `"a>b"` text is computed but `setTextToNode` is commented out (`:222-228`). |
| `CreateEvent` | id, parentId | insert attach | Detailed in §2.2 (`:117-192`). |
| `SearchFinishedEvent` | found, value | search | Sets the onFinished of the *last queued* step (the last compare move) to colour the badge `LIGHTGREEN` (found) or `LIGHTPINK` (not found). **Step:** badge moves 50 px straight down, 1 s (`:237-268`). |
| `RemoveEvent` | id, parentId, leaf | remove | Detailed in §2.5 (`:270-299`). |
| `ReplaceEvent` | originalID, replacingID, lines | remove of an inner node | `SwapProcessor`, detailed in §2.6 (`:797-802`). |
| `StructuralChangeEvent` | subtree structure | remove A/B when the left child has one child | `RepairmanLayoutManager` relayouts the subtree. **Step:** parallel moves of all subtree nodes to their new slots, 1 s each (`:765-777`). |
| `RotationLeftEvent` / `RotationRightEvent` (extends `RotationEvent`, not `Event`) | structure, reference helpers | each single rotation | Detailed in §2.4 (`:738-744, 779-795`). |
| `UpdateBalanceEvent` | value, balance | every `setBalanceOfNode` | **Only `System.out.println`** (`:746-750`). Not visualised. |
| `MoveElementEvent` (MT-common) | id, oldPoint, newPoint | layout manager when a node's X changes on add/remove | Collected into `moveElements` (`:577-584`). |
| `AnimationFinishedEvent` | — | end of inner-node remove | No-op (`:586-593`). |
| Unused | `LineConnectionEvent`, `MoveNode`, `ResetEvent`, enum `EventType` (legacy from the BST app) | never posted | — |

### 2.2 Insert into a non-empty tree: steps
1. `StartEvent`: a new badge (value v, yellow) is placed at **canvas (0,0)**. That is the far top-left of the 4200 px canvas, off-screen because the view is scrolled to the centre.
2. For each node on the path: **step "compare"**. The badge flies to that node and covers it (1 s). The first flight comes from (0,0).
3. `CreateEvent`:
   * The new node box is created invisible, and its two child-line objects are added. The layout manager recomputes positions; neighbours may shift horizontally (§3.3) and produce `MoveElementEvent`s. The parent's line is pointed at the new node.
   * **Step "make room":** if any node shifted, all shifted nodes move in parallel (400 ms; attached lines follow) and the badge is hidden instantly (opacity → 0). Otherwise this step only hides the badge instantly (1 ms).
   * **Step "drop":** the new node slides from the badge's last point to its slot (1 s). The last point is the **parent's position before the shift**, so the slide usually goes down-left or down-right; it can be straight down if the parent moved.
   * **Step "fade in":** the new node fades 0→1 (200 ms). JavaFX already showed it at opacity 1 during the slide, so this is a blink. At the end the parent→child line becomes visible.
   * **Step "line":** the parent→child line fades in (200 ms).
4. Each balance update: nothing visible.
5. Each rotation: one rotation step (§2.4). A double rotation gives two rotation steps.

For the port's Step model, a reasonable mapping is:

| Port step | Snapshot | Highlight | Cursor |
|---|---|---|---|
| per compare | — | the compared node | the v-badge at that node |
| "insert" | the new node in place, with its line | the new node | — |
| per rotation | after the rotation | pivot n and new root a; arrow shown at n's old slot | — |

### 2.3 Insert into an empty tree
One step: the root node (not a badge) moves from (0,0) to the root slot (1 s). No StartEvent or compare steps.

### 2.4 Rotation step (`RotationPreparation`, `BuilderRotationElement`, `Animator.buildRotationDirectionElement`)
When the event is handled, which is synchronously right after the model relinked:

**Preparation**
1. Create a `RotationDirectionElement(30, 15, isLeft = event instanceof RotationLeftEvent)` (`Animator.java:779-791`). Position: the layout slot of the *layout parent of `a`*. At that moment this is still the **pivot n** (the unbalanced node, whose slot is the top of the subtree). The arrow is placed at (n.x, n.y + 15), i.e. directly below n's box, spanning its 30 px width. It starts with opacity 0 and visible=false.
2. `RepairmanLayoutManager(layout, structure).reconstruction()`: the subtree rooted at `a` is re-indexed into the layout grid under a's new parent, all positions are recomputed, and a `MoveElementEvent` is produced for every node of the subtree (`MT-common/.../RepairmanLayoutManager.java`).
3. For each `ReferenceHelper`, a `SwitchConnectorHelper` (line of `node` on `side`) records a back target (old) and a forward target (new). A null target means the line should be hidden in that direction.

**The step** (one top-level `SequentialTransition`, `BuilderRotationElement.java:38-49`)
1. **2000 ms:** a parallel fade of the arrow (0→1 and 1→0 together; the later child wins). The arrow is made visible by `setNodesToVisible`, so the user sees it **appear at full opacity and fade out over 2 s**. On finish it is hidden (`:87-104`).
2. **1 ms:** all helper lines fade to 0.
3. **1000 ms:** every node of the rotated subtree moves in parallel to its new slot. Non-helper lines follow, because their endpoints are bound to the nodes. When this finishes, the helper lines are re-pointed to their forward targets (`SwitchElementEndEventHandler`).
4. **1 ms:** helper lines fade to 1. Lines with no forward target are set invisible (`FadesTransitionHandler`; note the swapped names `disableVisibleForward` → `isBackVisible=false`, `SwitchConnectorHelper.java:45-50`).
5. An empty parallel transition (`moveParentsElements` is never filled).

**Arrow geometry** (`MT-common/.../graphics/RotationDirectionElement.java`), in local coordinates with w=30, h=15, black stroke, no fill:
* Arc: `M 0 15  Q 15 0  30 15`, a hump bulging upward.
* Left rotation: arrowhead polyline `M 0 5 L 0 15 L 10 15` (head at the left end, so it reads counter-clockwise).
* Right rotation: `M 20 15 L 30 15 L 30 5` (head at the right end, clockwise).

Note: in X, a rotation only changes depths (Y), because in-order ranks do not change. X changes only when the **root** changes: nodes cross the root column and the asymmetric root spacing in §3.3 then shifts them by 20 px.

### 2.5 Remove of a leaf: steps
1. `StartEvent` (badge at (0,0)).
2. A compare step for each node, including the leaf itself. The badge now covers the leaf.
3. `RemoveEvent(leaf=true)`:
   * **step:** the parent→leaf line fades out (200 ms);
   * **step:** the leaf node **and** the badge fade out together (200 ms). The node is removed from the layout (it stays in the canvas until the next `StartEvent`);
   * **step "close gap":** shifted nodes move (400 ms) and the badge is hidden instantly.
4. Rebalancing: rotation steps, if any.

### 2.6 Remove of an inner node: steps
1. `StartEvent`, then compare steps down to X. The badge covers X.
2. `ReplaceEvent` → `SwapProcessor.process` (`animation/utils/SwapProcessor.java:37-47`) gives one step:
   * a sequential of an empty parallel;
   * 1 ms: the 6 reference lines are hidden;
   * **1 s: X and the replacing node R swap positions** (the layout manager `swapElement`; both glide to each other's slot);
   * at the end, lines are re-pointed: parent→R, R→its new children;
   * 1 ms: lines reappear. Lines with no new target stay hidden: X's lines, and the predecessor's old parent line.
   * The badge (value of X) is **not moved**. After the swap it sits on top of R's box at X's old slot, hiding R's label.
3. `RemoveEvent(leaf=false)`:
   * **step:** X (now at R's old slot) and the badge fade out (200 ms), which reveals R;
   * `layMan.removeElement(X)`;
   * **step:** gap-closing moves (400 ms) and the badge is hidden.
   * Note: if R's old slot still has children in the layout grid, `removeElement` refuses (returns false) and X's ghost entry stays in the grid (`MT-common/.../BinaryTreeLayoutManager.java:79-99`).
4. Rebalancing from X's original parent: rotation steps, if any.
5. If `requiredStructureChange`: **step "repair":** R's subtree moves to its correct new slots (1 s). Visually R's left subtree moves up one level.

### 2.7 Errors and the animation
On a duplicate insert, a remove of a missing value, or the remove NPE, the exception is thrown **after** `StartEvent` and the compare steps were queued, but **before** `ac.playForward()`. Nothing plays. The badge sits at canvas (0,0), off-screen, and the tree stays unchanged. A search-not-found does play: the badge turns pink and then drops 50 px.
**Port:** for a missing value on remove, it is reasonable to play the search path and end with a "not found" mark plus a dialog. This is an improvement, not original behaviour.

### 2.8 Concrete traces (model events observed; visuals derived from §2.2–2.6)
`cX` = canvas centre X (2100). A slot is given as the box's top-left `(x, y)`. Y = 15 + 35·depth. X rule: §3.3.

**A. Insert 10, 20, 30 into an empty tree (RR → single left rotation at the root)**
```
i10: CreateRootEvent(10)
i20: StartEvent(20) Compare(20,10) CreateEvent(20,parent 10) UpdateBalance 20→0, 10→+1
i30: StartEvent(30) Compare(30,10) Compare(30,20) CreateEvent(30,parent 20)
     UpdateBalance 30→0, 20→+1, 10→+2
     RotationLeftEvent(structure root 20; helpers: [20.left old ∅ → new 10], [10.right old 20 → new ∅])
     UpdateBalance 10→0, 20→0
```
What the user sees:
1. **i10:** box 10 glides from the top-left to (cX-15, 15).
2. **i20:**
   * the badge "20" glides in onto 10;
   * the badge vanishes;
   * box 20 slides from 10's slot to (cX+35, 50);
   * blink fade-in, then the line 10→20 fades in.
3. **i30:**
   * the badge goes onto 10, then onto 20;
   * the badge vanishes;
   * 30 slides from 20's slot to (cX+85, 85);
   * fade-in, then the line 20→30;
   * **rotation step:**
     * a counter-clockwise arrow under box 10 (at (cX-15, 30)) shows and fades out over 2 s;
     * the line 10→20 disappears;
     * in parallel, 10 moves (cX-15,15)→(cX-85,50), 20 moves (cX+35,50)→(cX-15,15), and 30 moves (cX+85,85)→(cX+35,50); the line 20→30 follows;
     * the line 20→10 appears.
   * Final: `(20 10 30)`.

**B. Insert 30, 10, 20 (LR → left at 10, then right at 30)**
```
i20: Start(20) Compare(20,30) Compare(20,10) CreateEvent(20,parent 10)
     UpdateBalance 20→0, 10→+1, 30→-2
     RotationLeftEvent(root 20; [30.left 10→20], [20.left ∅→10], [10.right 20→∅]);  UpdateBalance 10→0, 20→-1
     RotationRightEvent(root 20; rooty [20.right 20(self)→30], [20.right ∅→30], [30.left 20→∅]); UpdateBalance 30→0, 20→0
```
Visuals:
1. **i30:** root at (cX-15, 15).
2. **i10:** box 10 at (cX-85, 50).
3. **i20:**
   * the badge goes to 30, then to 10;
   * **make-room step:** 10 shifts left (cX-85→cX-135, 400 ms), because 20 takes the column between 10 and 30;
   * 20 slides straight down from (cX-85,50) to (cX-85,85); fade-in; the line 10→20 appears;
   * **rotation 1 (left, arrow under 10 at (cX-135, 65)):** 20 rises to (cX-85,50), 10 drops to (cX-135,85), and the lines rewire to 30→20→10;
   * **rotation 2 (right, clockwise arrow under 30 at (cX-15, 30)):** 20 moves to (cX-15,15), 10 to (cX-85,50), 30 to (cX+35,50).
   * Final: `(20 10 30)`.

**C. Remove from [20,10,30,5,15,25,40,35]** (build tree: `(20 (10 5 15) (30 25 (40 35 .)))`)
Slots before:

| Node | 5 | 10 | 15 | 20 | 25 | 30 | 35 | 40 |
|---|---|---|---|---|---|---|---|---|
| x | cX-185 | cX-135 | cX-85 | cX-15 | cX+35 | cX+85 | cX+135 | cX+185 |
| depth | 2 | 1 | 2 | 0 | 2 | 1 | 3 | 2 |

* **remove 5** (leaf, no rotation):
  ```
  Start(5) Compare(5,20) Compare(5,10) Compare(5,5) RemoveEvent(5,parent 10,leaf) UpdateBalance 10→+1, 20→+1
  ```
  The badge goes 20 → 10 → 5; the line 10→5 fades; 5 and the badge fade; no shifts (left-side X is measured from the root). Tree: `(20 (10 . 15) (30 25 (40 35 .)))`.
* **then remove 10.** 10 now has only a right child (15). **The original crashes:**
  ```
  Start(10) Compare(10,20) Compare(10,10) → NullPointerException at AVLTree.java:449
  ```
  Nothing animates, the tree is unchanged and no dialog appears. In a correct implementation, 10 is replaced by its successor 15 (relinked) and the tree becomes `(20 15 (30 25 (40 35 .)))`. Then 20 = +2, and child 30 has balance +1 (h(40)=1 ≥ h(25)=0), so a **single left rotation at the root** gives `(30 (20 15 25) (40 35 .))`.
* **Rotation-causing removal that works in the original: remove 5, then 15** (observed):
  ```
  Start(15) Compare(15,20) Compare(15,10) Compare(15,15) RemoveEvent(15,parent 10,leaf)
  UpdateBalance 10→0, 20→+2
  RotationLeftEvent(root 30; [30.left 25→20], [20.right 30→25]); UpdateBalance 20→0, 30→0
  ```
  Visuals:
  * the badge goes 20 → 10 → 15; the line 10→15 fades; 15 and the badge fade;
  * **gap step:** 10 slides right (cX-135→cX-85, 400 ms);
  * **rotation:** a counter-clockwise arrow under 20 (at (cX-15, 30)) for 2 s; the lines 20→30 and 30→25 vanish. Moves:
    * 30 → root (cX-15, 15)
    * 20 → (cX-135, 50)
    * 10 → (cX-185, 85)
    * 25 → (cX-85, 85)
    * 40 → (cX+85, 50)
    * 35 → (cX+35, 85)
  * the lines 30→20 and 20→25 appear.
  * Final: `(30 (20 10 25) (40 35 .))`.
* **Inner-node example: remove 10 from the full tree** (branch A: the left child 5 has no right child), observed:
  ```
  Start(10) Compare(10,20) Compare(10,10)
  ReplaceEvent(10→5, lines: 20.left 10→5 | 10.left 5→∅ | 10.right 15→∅ | 10.left 5→∅ | 5.left ∅→∅ | 5.right ∅→15)
  RemoveEvent(10,parent 20,non-leaf) UpdateBalance 20→+1 AnimationFinished
  ```
  Visuals:
  * the badge goes onto 10;
  * the lines vanish; 10 and 5 swap places (1 s); the lines 20→5 and 5→15 appear;
  * box 10 (now bottom-left) and the badge fade out, which reveals 5 under it.
  * Final: `(20 (5 . 15) (30 25 (40 35 .)))`.
* **Remove the root 20 from the full tree** (branch B, predecessor 15):
  ```
  ReplaceEvent(20→15) RemoveEvent(20, parent null) StructuralChange? no (10 has 2 children) → no rebalancing at all
  ```
  Result: `(15 (10 5 .) (30 25 (40 35 .)))`. This one happens to be balanced.
* **Delete with a double rotation:** `(20 (10 . 15) 30)`, remove 30 → 20 = -2, and h(10.left) = -1 < h(10.right) = 0, so LR: left at 10, then right at 20. Final: `(15 10 20)`. Observed.

---

## 3. Visual style specific to this app

### 3.1 Node box (`animation/AVLNodeWithLine.java`)
* A rectangle **30 × 15 px** (`KEYWIDTH=30`, `HEIGHT=15`, `:14-15`).
* Fill `Color.YELLOW` (#FFFF00), stroke `Color.BLACK`, stroke type INSIDE, default width 1 (`:34-46`).
* The value text is centred, with the JavaFX default font (System, about 12–13 px, black).
* There is **no state colouring of tree nodes**. Every node is always yellow. The original has no highlight colours for visited, compared or rotating nodes.
* The badge/cursor is the same class at the same size: a yellow box with the processed value. It is drawn on top of the node it visits, because it was added to the canvas later. Badge colours:
  * search found: `LIGHTGREEN` (#90EE90);
  * search not found: `LIGHTPINK` (#FFB6C1) (`:70-76`).
* Known quirk: `setPosition` sets translateX twice and never sets Y (`:65-68`). It is only ever called with (0,0), so this is harmless.

### 3.2 Lines (`MT-common/.../graphics/LineElement.java`, `BinaryNodeWithLine.java`, `BranchNodeElement.java`)
* Default JavaFX line: black, 1 px.
* Start point: the parent's **bottom-left corner** for a left child (`x+0, y+15`) and the **bottom-right corner** for a right child (`x+30, y+15`) (`BranchNodeElement` child connectors: `x + i*fieldWidth`, `y + height`).
* End point: the child's **top centre** (`x+15, y+1`) (`AVLNodeWithLine.doParentBindings :84-90`).
* This matches the screenshots: lines leave from the box corners and arrive at the top middle.
* Each node owns two line objects (left and right). They are invisible until they are used.

### 3.3 Layout (`MT-common/.../BinaryTreeLayoutManager.java`, `LayoutNodesPositionInsertedNodes.java`, `TreeToList.java`, `BinaryTreeHelper.java`)
* `TreeLayoutSettings(20, 20, 30, 15)` (`Main.java:30`) gives:

  | Setting | Value |
  |---|---|
  | paddingTop | 15 |
  | horizontalSpace | 20 (used for **vertical** gaps) |
  | verticalSpace | 20 (used for **horizontal** column gaps) |
  | node | 30×15 |

* Mode `CALC_ONLY_INSERTED_NODES` (`Animator.java:72`): an **in-order column layout**. Every node gets its own column in in-order sequence. The columns are fixed width, so the horizontal spread of the tree depends only on how many nodes it has.
  * `colSize = 20 + 30 = 50`, `space = 20/2 = 10`.
  * `Y(depth) = 15 + depth*(15+20) = 15 + 35·depth`.
  * With `r` = in-order index of the root, `i` = in-order index of the node, `cX` = canvas width / 2:
    * root: `x = cX - 25 + 10 = cX - 15` (box centred on cX);
    * `i < r`: `x = cX - 25 - (r-i)*50 - 10`, so the nearest left neighbour is at `cX-85`;
    * `i > r`: `x = cX + 25 + (i-r-1)*50 + 10`, so the nearest right neighbour is at `cX+35`.
  * **Asymmetry:** the gap between the root and its in-order left neighbour is 70 px between box origins (40 px clear). On the right it is 50 px (20 px clear). This is visible in the screenshots (15 → 20 is 70 px, 20 → 25 is 50 px).
* Canvas: a `Pane` with prefSize **4200 × 500** inside a pannable `ScrollPane`, wrapped in a `Group`, scrolled to horizontal centre (`Main.java:43, 50`; `CommonControls.java:211-219, 271-273`). `cX` = 2100. Window 1000 × 500. The canvas background is the default light grey (#F4F4F4 in the screenshots).
* **Port recommendation:** keep the in-order column layout (it makes rotations read as purely vertical motion). Either keep the original 50/70 px spacing or drop the asymmetry; the asymmetry is an artefact of the algorithm.

### 3.4 Not drawn
No balance factors, no heights, no level guides, no text inside the canvas, and no description panel. If the port adds a balance-factor label (recommended for teaching), mark it as a deviation. The original's intent is visible only in the `UpdateBalanceEvent` stub (`Animator.java:746-750`) and the commented-out compare text (`:228`).

---

## 4. UI specifics
* Window title: **`AVL tree`** (`Main.java:45`). Size 1000×500 (`:21-22`).
* Toolbar: `CommonControls(debug=true, twoD=false)` (`Main.java:40`). The debug "!!!" button is created but never added to the toolbar. The toolbar shown, left to right (screenshots and `CommonControls.java:130-133`):
  * `Prvek:` [text field] |
  * `Vložit` `Odstranit` `Najít` |
  * `Krokovat` (checkbox) `<<` `>>` |
  * `Rychlost:` (slider 0.3–2.5, default 1) `Play/Pause` `Vzory` `Reset` `?`
* Dialog texts: §1.8 (errors), §1.9 (presets dialog title `Vytvorit strukturu`), §1.11 (help).
* There are no in-app description texts. If the port's Step model needs a message per step, it must define new ones. Suggested Czech wording, **not present in the original**, to be labelled as new:
  * compare: `Porovnání: {v} < {k}, pokračuji vlevo` / `{v} > {k}, pokračuji vpravo`
  * insert: `Vložen uzel {v}`
  * balance: `Vyváženost uzlu {k} je {b}`
  * rotations: `Levá rotace kolem uzlu {k}` / `Pravá rotace kolem uzlu {k}`, and for double rotations `Dvojitá rotace levo-pravá` / `pravo-levá`
  * search: `Prvek {v} nalezen` / `Prvek {v} nebyl nalezen`
  * remove: `Uzel {v} nahrazen předchůdcem {p}`

---

## 5. Tests (`application/testing`)
There are **no automated tests and no assertions** anywhere.
* `AVLExample.java`: a standalone, textbook-style AVL implementation (an `AvlNode` with key, balance and parent; recursive insert; `recursiveBalance`; delete by **successor with key copy**, i.e. a value swap). It contains no main and no asserts. It looks like a reference that `AVLTree` was modelled on: the balance logic, the `>=` tie rule and the rotation code are nearly identical. The differences are that the app uses the predecessor, relinks nodes, and starts rebalancing at a different node. This file is useful to the port as the "intended correct" behaviour for rebalancing after delete (`recursiveBalance(r.parent)` where `r` is the node physically removed).
* `StructTesting.java`: a `main` that inserts 50, 10, 90, 70, 95, 5, 60, 99 and removes 5. It has no output checks. Observed result: removing 5 makes 50 = +2 with child 90 at balance 0, so a single left rotation gives `(90 (50 10 (70 60 .)) (95 . 99))`. This is the delete balance-0 case.
* `LayoutTest.java`, `BSTblock.java`, `NodeElement.java`: a JavaFX scratch demo of blocks and coloured lines (blue and red `LineBuilder`). It is unused (the call in `Main.java:52` is commented out).

---

## 6. Known bugs, TODOs, intent, and deviations

### 6.1 Remove of a node whose only child is a right child always crashes (NPE)
`AVLTree.java:449` (and `:457`) call `toRemove.getLeft().getId()` inside the "no left subtree" branch, where left is null by definition. In an AVL tree a node with only a right child always has a leaf as that child, so `toRemove.getRight().getLeft() == null` always holds. The code therefore always takes this branch and always throws.
* Fuzz: 1427/1427 non-root cases and 17/17 root cases crashed.
* The tree is not modified (the exception happens before any relinking), nothing is animated, and no dialog appears.
* The intended behaviour is to replace the node with its right child (the successor).

### 6.2 Removing the root in branch A leaves a stale `root`
Branch A (the left child has no right child) never assigns `root` when X is the root (`:331-357`).
* Observed: `(20 10 30)`, remove 20. Visually 10 replaces 20, but the model keeps `root = 20` with stale children. Afterwards `search 20` is **found** and the in-order content is wrong.
* Fuzz: 1266/1266 and 8/8 cases ended with content mismatches.

### 6.3 Rebalancing after an inner-node delete starts too high
It starts at X's original parent (`:593-596`) instead of the lowest changed node.
* This skips the replacing node itself. Fuzz: 588 AVL violations in branch A, e.g. `(37 (21 20 (26 24 36)) (63 (53 39 .) (66 65 (98 70 .))))`, remove 66 → `65` is left with balance +2.
* In branch B it skips the predecessor's old-parent path (56 violations).
* For a root delete in branch B there is **no rebalancing at all** (395 violations). Example: `(67 (40 (16 9 29) 60) (82 (80 74 .) 97))`, remove 67 → `(60 (40 (16 9 29) .) …)`.

### 6.4 Broken parent pointer in branch B
`P.parent.setRight(P.left)` (`:392`) never sets `P.left.parent`. The predecessor's left child keeps a stale parent pointer (fuzz: 179 root and 17 non-root cases), which can corrupt later operations. The line from P's old parent to P.left is also not created in the ReplaceEvent (new reference null, `:376-378`). So unless a structural change happens to be triggered, that child is left visually disconnected.

### 6.5 `requiredStructureChange` checks the wrong node in branch B
It tests whether **L** has one child (`:306-308`), not whether **P** had a left child. So the "repair" relayout runs in some cases where it is not needed and is missing in others.

### 6.6 Duplicate-insert dialog never shown
See §1.8. The remove-error dialog is undefined, because of the interface mismatch with the committed guiprovider.

### 6.7 Search on an empty tree
The Animator throws inside the subscriber (§1.6); nothing is shown.

### 6.8 Preset build resets speed to 1
The slider value is ignored afterwards (`AVLController.java:68-77`), and finished-listeners accumulate.

### 6.9 Badge colour change on step-back
The green or pink colour is applied by a plain `onFinished` handler. Stepping back does not revert it.

### 6.10 Root right-rotation "selfreference"
In this case (`:855-859`) the a.right line's back target is `a` itself. On step-back this can draw a tiny line inside a's box. This is cosmetic.

### 6.11 Legacy and dead code
* `handleReplaceEventOld`, `hideLinesOLD`, `SwapNodesHandler` (an "EXPERIMENTAL – APPENDING THE CHILD" block whose LEFT/RIGHT are swapped), `replaceNode`, `getInOrderPredecessor`, `collectReferences` (TODO stub), `treeTraversal`/`EventType` comments (left over from the BST app), and the deprecated `recursiveBuilding`.
* `AVLNode` `// TODO: ID provider` (`:43`): the intent was to support non-unique keys later.
* `Animator.setTextToNode` exists but its call is commented out. The intent was to show `"v<k"` / `"v>k"` inside the badge during compare. The `else` branch would also print `>` for equality.

### 6.12 Deviations from textbook AVL
The balance definition, the height convention and the rotation case selection are textbook (and the insert is correct). The deviations are all in delete:
* predecessor rather than successor (a valid choice);
* node relink rather than key copy (a valid choice, and better for animation);
* bugs 6.1–6.5.

**Port:** implement a correct delete. Use the predecessor when a left subtree exists, otherwise the right child (successor). Rebalance from the parent of the physically detached position. Emit rotation steps exactly like insert.

### 6.13 The Bug_screens: what they document and whether they are fixed
They were added in commit `5a37318` (2015-09-05). Its message translates as "When the removal swaps with an element that has only one child, the structure is rebuilt. Many bugfixes. Lines in progress."
* `innerNodePred.PNG`: the full app window before a removal (input `40`). The tree is `(20 (10 5 15) (40 (30 25 35) (60 50 65)))`, all yellow boxes, lines from box corners to child top-centres.
* `innerNodePo.PNG` ("po" = after): the same window after removing 40 (branch B, predecessor 35). It shows `(20 (10 5 15) (35 (30 25 .) (60 50 65)))`, correctly drawn. This case worked.
* `innerNoderemove35.PNG`: the window after then removing **35** (input `35`). 35's left child 30 has only a left child (25), so this is branch A with `L.hasOneChildren()`. The bug as shown: 30 moved to 35's slot, but **25 stayed at depth 3, disconnected**; 30's left line dangles towards the empty slot; **the line 30→60 is missing**; and the 60/50/65 subtree did not move up under 30. In short, the layout and lines were not rebuilt after relinking a replacement that has a single child.
* `innerNode.PNG`: a small crop: 20 with its left child 10 connected, a box 70 on the right **without the 20→70 line**, and a line from 70 dangling to the lower right. It shows the same class of bug: after an inner-node replacement, the parent line was not re-pointed and a stale child line remained.

**Status at HEAD:**
* The `remove 35` case is addressed in code. `requiredStructureChange` plus `StructuralChangeEvent` relayouts the replacement's subtree (`5a37318`), and the ReferenceHelper-based `SwapProcessor` re-points the lines: parent→30, 30.left→25, 30.right→60 (`73b661b` "Lines Fixed"). The observed HEAD event for that exact scenario is:
  ```
  ReplaceEvent(35→30, lines 20.right 35→30 | 35.left 30→∅ | 35.right 60→∅ | 35.left 30→∅ | 30.left 25→25 | 30.right ∅→60)
  RemoveEvent  StructuralChangeEvent(root 30)
  ```
  Model result: `(20 (10 5 15) (30 25 (60 50 65)))`. So by code analysis this screenshot's bug is **fixed**; I could not run the visuals.
* The **same class of bug still exists** where a predecessor deep in the tree has a left child (§6.4/6.5), and the model bugs in §6.1–6.3 were never fixed.

---

## 7. Port mapping cheat-sheet (Step = snapshot + marks + message + cursor)
| Original step | Port step |
|---|---|
| badge flies to node k (compare) | cursor = v at k; mark k "compare" |
| insert: hide badge + make room, drop, fade-in, line | one or two steps: "new node placed" (mark new node). The shift is animated by snapshot interpolation. |
| rotation (arrow 2 s + subtree moves + rewire) | one step per single rotation. Snapshot after; marks: pivot n and new root a; show an arrow glyph (counter-clockwise for left, clockwise for right) under n's pre-rotation slot. A double rotation is two steps. |
| leaf remove: line fade, node and badge fade, gap close | cursor on the leaf (mark "remove") → snapshot without it |
| inner remove: swap, fade X, gap, optional repair | cursor on X; a step showing X and the replacement swapped (mark both); a step with X gone; then rotation steps |
| search found / not found | last compare step + a final step with the cursor marked success (light green) or fail (light pink), offset 50 px below the node |
| UpdateBalanceEvent | (optional, new) per-ancestor balance marks; not visualised in the original |
