# 2-3 tree ("2-3 strom") – port specification

Source repo: `/Users/viktor.krejcir/Dev/viktor/thesis2/bitbucket/2-3-tree` (HEAD `9b1e66c`, 2015-09-19, "Updated presets").
All paths below are relative to `src/` unless noted. Shared libs: `MT-common` (`cz.commons.*`), `MT-guiprovider` (`components.*`).

How I verified this: the model (`B23tree`, `B23Node`, events, `TreeStructureBuilder`) has no JavaFX dependency. I compiled it headless with Java 17 and Guava 18 (`MT-common/lib/guava-18.0.jar`) and ran a harness that logs every event plus the resulting tree. I also ran a fuzzer (3000 random sequences) that checks the B-tree invariants. Every trace in §2.5 is real program output. Node ids are printed as `#id`.

---

## 0. What is live and what is dead

| Path | Status |
|---|---|
| `application/Main.java`, `TwoThreeTreeController.java`, `TwoThreePresets.java`, `TwoThreePresetItem.java`, `IDProvider.java` | **live** |
| `proto/twothreetree/B23tree.java`, `B23Node.java` | **live**: the model |
| `events/**` | **live**. These are only declared or never posted: `CreateEmptyRootEvent`, `MergeEvent`, `MoveKeyFromLeft/RightSiblingEvent`, `PositionSetEvent`, `search/MoveToNodeEvent`, `AnimationFinishedEvent` (posted, but nothing subscribes) |
| `animation/Animator.java` | **live**: the only renderer. `animation/utils/AnimationTools.java` is live. `animation/TwoThreeNode.java` and `animation/utils/TwoThreeAnimationTools.java` are unused |
| `cz/commons/twothreetree/layoutmanager/*` (`TreeLayoutManager`, `DepthManager`, `DepthRow`, …) | **live**: this is the layout used (`Animator.java:32,88`) |
| `cz/commons/twothreetree/example/layoutManager/TwoThreeElement.java`, `TwoThreeKey.java`, `helpers/*` (`TreeStructureBuilder`, `ITreeStructure`, iterators) | **live**: the node graphic, the moving key badge, and the snapshot builder |
| `cz/commons/twothreetree/example/layoutManager/{Example,SplitExample,LayoutManagerV2,ElementAlignmentManager,TestingStruct*}.java` | dead (demos) |
| `cz/commons/twothreetree/shared/*` | live (`NodeKeys`, `NodePosition`, `IB23Node`, `NodeIDProvider`) |
| `proto/layoutManager/*`, `proto/helpers/I23TreeStructure.java` | **dead**. Nothing outside the package imports them. This is an older layout attempt |
| `layoutManager/TwoThreeLayoutManagerV2.java` (in src) | dead (an empty class) |
| top-level `layoutManager/`, `deprecated/`, `DeprecatedFiles/` | dead. They are outside `src/`. `layoutManager/` is a duplicate of `cz/commons/twothreetree/example/layoutManager`. `deprecated/twothreetree/TwoThreeTree.java` is the old Šára-based tree, which produced `log_insert.txt` (see Appendix A) |
| `twothreetree/test/TreeTest.java`, `EventLogger.java` | manual console test, not JUnit (§5) |

---

## 1. Data structure semantics

### 1.1 Node representation (`proto/twothreetree/B23Node.java`)
- Fields (lines 14-24): `Integer keyOne, keyTwo`, children `left, center, right`, `parent`, `int id`, and a `boolean twoNode` flag that is **immutable after construction**.
- A **2-node** (`twoNode=true`) uses `keyOne`, `left` and `right`. `center` is always null. The right child of a 2-node is stored in `right`, not in `center`.
- A **3-node** uses `keyOne < keyTwo`, `left`, `center` and `right`. The constructor `B23Node(id,k1,k2)` sorts the two keys (lines 142-154).
- **The model never holds a 3-key overflow node.** A split is computed directly from the full 3-node plus the incoming value (`splitNode`, `B23tree.java:566-621`). The "promoted" key travels upward inside a temporary 2-node (the return value of `recursiveInserting`).
- Converting between 2-node and 3-node always **creates a new `B23Node` object**. The new object either reuses the old id (the `create2Node(IB23Node node,int)` and `create3Node(IB23Node node,int,int)` overloads) or takes a fresh id from `IDProvider`.
- `isLeaf()` = `left==null && right==null`. `isInternal()` is its negation (lines 275-282).
- `equals` compares ids only (lines 301-312).
- Siblings (lines 86-132) are adjacent only:
  - `getRightSibling`: for a 2-node parent, left→right. For a 3-node parent, left→center and center→right. Otherwise null.
  - `getLeftSibling` is the mirror image.
- `setCenter` is ignored on 2-nodes (lines 215-220). `setLeft`, `setRight` and `setCenter` also set the child's parent. `replaceChild(cur,new)` sets `new.parent=this` and `cur.parent=null` (lines 253-273). The `cur.parent=null` part causes an NPE bug, see §6.

### 1.2 Node ids (needed for stable visual identity)
- `application/IDProvider` is a global singleton. `getNextID()` returns `id++` starting at **0** (lines 7-12). `reset()` sets it to 1, but it is never called.
- The first node ever created is therefore id 0. That matches the Animator's invisible placeholder root, which is also id 0 (`Animator.java:100-110`).
- Id rules during insert (exact; ids that get allocated and thrown away are marked "wasted"):
  - Inserting into a 2-node leaf: the resulting 3-node keeps the leaf's id (`B23tree.java:106`).
  - Child split absorbed by a 2-node inner parent: the parent becomes a 3-node and keeps the parent's id. The temporary promoted node's id disappears (`:122,:144`).
  - `splitNode(tri, v)` on a **non-root** node: the promoted temp node gets a new id, the left half (min) **keeps tri's id**, the right half (max) gets a new id (`:596-600`).
  - `splitNode` on the **root**: the **new root keeps the old root's id**. The left half gets a new id. One id is wasted, then the right half gets another new id (`:592-594` then `:600` overwrites `right`). A root split therefore consumes 3 ids.
  - When a 3-node **inner** node splits because a child split bubbled up, the left half's id is then **overwritten with the id of the incoming temp promoted node** (`retval.getLeft().setId(inserting.getID())`, `:189,:221,:254`). The inner node's own id vanishes (non-root case). In the root case, the root id stays on the new top node.
- Id rules during remove (as coded):
  - A 3-leaf that loses a key keeps its id (`:456`).
  - A borrowing sibling keeps its id (`:910`). The hole node keeps its id (`:908`).
  - A merged sibling keeps the sibling's id (`:995/997`, `:1111/1113`).
  - A 3-node parent that becomes a 2-node keeps its id (`:1014/1020`).
  - Root shrink at depth ≥2 makes the merged node (with the sibling's id) the new root (`:1150-1153`).
  - The height-1 special case keeps the root's id (`:351`).

### 1.3 Search (`B23tree.search`, `:462-564`)
```
search(v):
  if root == null: post SearchFinished(null, v, false); return false
  post SearchStarted(root.id, v); post CreateKey(v)        // note: no MoveKeyToNode for the root
  n = root
  loop:
    if n is 2-node:
       if v < n.k1:  if n.left  { n = n.left;  post MoveKeyToNode(n.id, v, 0) } else break
       elif v > n.k1: if n.right { n = n.right; post MoveKeyToNode(n.id, v, 0) } else break
       else found = true; break
    else (3-node):
       if v == n.k1 or v == n.k2: found = true; break
       if v < n.k1:            go left   (same pattern)
       elif n.k1 < v < n.k2:   go center
       else:                   go right
  post SearchFinished(n.id, v, found)   // n = node where it was found, or the last leaf visited
  actual = found ? n : root
```
The **insert** descent posts `MoveKeyToNode` for **every node, including the root** (`:100`). Search starts at the root without posting one. In both cases the move event index is always 0.

### 1.4 Insert (exact; produces textbook bottom-up 2-3 shapes)
The fuzzer confirmed that the resulting tree is always a valid 2-3 tree with sorted keys. Source: `insert` `:64-96`, `recursiveInserting` `:98-286`, `splitNode` `:566-621`.
```
insert(v):
  fireSC = false
  post CreateKey(v)
  if root == null:
     root = new2Node(v)                       // id 0 on a fresh app
     post InsertToLeaf(root.id, v, parent=null, index=0)
  else:
     try: r = rec(v, root); if r: root = r
          if fireSC: post StructuralChange(snapshot(root))
     catch: return false                       // duplicates AND the NPE bug of §6.1 end here
  size++; return true

rec(v, n):                                     // returns the promoted temp 2-node, or null
  post MoveKeyToNode(n.id, v, 0)
  if n is 2-node:
     if leaf:
        if v == n.k1: throw "Tento prvek je již ve stromu obsažen"
        t = new3Node(id=n.id, {v, n.k1}); put t where n was (parent.replaceChild or root=t)
        post InsertToLeaf(t.id, v, parentId, index = (t.k2 == v) ? 1 : 0)
        return null
     else:
        if v < n.k1:  p = rec(v, n.left)
                      if p: t = new3Node(id=n.id, {p.k1, n.k1}); t.left=p.left; t.center=p.right; t.right=n.right
                            replace n by t; post InsertToInnerNode(t.id, v, 0)    // NPE bug when n is not root, §6.1
        elif v > n.k1: p = rec(v, n.right)
                      if p: t = new3Node(id=n.id, {p.k1, n.k1}); t.left=n.left; t.center=p.left; t.right=p.right
                            replace n by t; post InsertToInnerNode(t.id, v, 1)
        else throw duplicate
        return null
  else (3-node):
     if v == n.k1 or v == n.k2: throw duplicate
     if leaf: r = split(n, v); post splitCache; return r
     if v < n.k1:        p = rec(v, n.left)    ; child slot = LEFT
     elif v < n.k2:      p = rec(v, n.center)  ; child slot = CENTER
     else:               p = rec(v, n.right)   ; child slot = RIGHT
     if p == null: return null
     r = split(n, p.k1)
     r.left.id = p.id; splitCache.splitId = r.left.id; post splitCache
     children (A,B = p.left,p.right; L,C,R = n.left,n.center,n.right):
        slot LEFT:   r.left = [A,B]  r.right = [C,R]
        slot CENTER: r.left = [L,A]  r.right = [B,R]
        slot RIGHT:  r.left = [L,C]  r.right = [A,B]
     return r

split(tri, v):        // tri is a 3-node; v is the new or promoted key
  if tri.parent == null: post SplitRoot(tri.id)
  (min, mid, max) = sort(tri.k1, tri.k2, v)
  if tri is root: P = new2Node(id=tri.id, mid); P.left = new2Node(min) /*new id*/; (one id wasted); P.right = new2Node(max) /*new id*/
  else:           P = new2Node(mid) /*new id*/;  P.left = new2Node(id=tri.id, min); P.right = new2Node(max) /*new id*/
  splitCache = SplitEvent(parentId=P.id, newId=P.right.id, splitId=P.left.id,
                          keyToParent=mid, keyToNew=max, splitHasChildren=!tri.isLeaf(), splitIndexInParent=0)
  splitCache.keyToSplitted = min
  fireSC = true
  return P
```
Notes:
- **Which key goes up:** the middle of the three keys. min stays in the left half (the original node), max goes to a new right node.
- **Root split:** the old root's id becomes the new root (one level up). Height grows by one.
- Child distribution follows the textbook exactly (lines 193-200, 226-233, 259-266).
- The StructuralChange snapshot is posted **only when at least one split happened** (`fireStructureChangeEvent`). A plain leaf insert only posts `InsertToLeaf`.
- Event order for a cascade is bottom-up. Each `split` posts `SplitRoot` (if root) **before** its `SplitEvent`. `InsertToInnerNode` is posted only when a 2-node parent absorbs the promoted key, and it carries the **inserted value `v`**, not the promoted key.

### 1.5 Remove
#### 1.5.1 Original control flow (exact, `:288-339`)
```
remove(v):
  if !search(v): throw Exception("Not found in tree")     // search events were already posted
  n = actual
  if n == root and root.isLeaf and root.is2node: root = null        // then falls through, see below
  elif n.isLeaf and n.parent == root and n.is2node:
       removeLeafThatIsChildOfRoot(n)                     // :341-356
       post StructuralChange(snapshot(root)); return true
  if n.isLeaf: if n.isInternal: n = swapWithSuccessor(n, v)   // DEAD: the condition is never true (§6.2)
  if n.is2node:
     s3 = getThreeNodeSibling(n)        // right adjacent sibling if it is a 3-node, else left adjacent if a 3-node, else null
     if s3: removeWithThreeNodeSiblingOption(n, s3, pos(s3), NONE)   // borrow / rotate
     else:  removeWithTwoNodeSiblingOption(n)                         // merge
  else: removeThreeLeaf(n, v)            // posts RemoveFromLeaf; also used (wrongly) for inner 3-nodes
  post StructuralChange(snapshot(root)); return true
```
Helper semantics:
- `removeLeafThatIsChildOfRoot` (`:341-356`): `sib = right adjacent ?? left adjacent`. `root = new3Node(id=root.id, {root.k1, sib.k1})` with no children. The result is only correct when the root is a 2-node and the sibling is a 2-node.
- `removeThreeLeaf` (`:445-460`):
  - index = 0 if v==k1, else 1. Posts `RemoveFromLeaf(n.id, v, index)`.
  - Replaces n with `new2Node(id=n.id, otherKey)`. Children are not copied, and `n.parent.replaceChild` throws an NPE if n is the root.
- `getSeparationKeyPosition` (`:836-865`) decides which parent key separates the node from the sibling:
  - parent is a 2-node: LEFT (k1)
  - n is parent.left: LEFT
  - n is parent.center: same side as the sibling
  - n is parent.right: RIGHT (k2)
- `removeWithThreeNodeSiblingOption(n, s, sPos, mergedPos)` (**borrow / rotation**, `:874-963`):
  ```
  sep = parent key at separation position
  sibKey = (sPos==LEFT) ? s.k2 : s.k1;  keep = the other key of s
  n.k1 = sep;  s' = new2Node(id=s.id, keep) replaces s
  if separation == LEFT:  parent.k1 = sibKey; s'.left = s.left; s'.right = s.center
                          if mergedPos==LEFT: n.right = n.left
                          n.left = s.right
  else:                   parent.k2 = sibKey; s'.left = s.center; s'.right = s.right
                          if mergedPos==RIGHT: n.left = n.right
                          n.right = s.left
  ```
  The key movement is correct in every case. The child rewiring is only correct when (separation LEFT and sibling LEFT) or (separation RIGHT and sibling RIGHT). That only matters for inner nodes, i.e. during propagation (§6.3).
- `removeWithTwoNodeSiblingOption(n)` (**merge**, `:969-1043`):
  ```
  sib = right adjacent ?? left adjacent;  sep = separating parent key
  m = new3Node(id=sib.id, {sep, sib.k1}) replaces sib   // sib's children are NOT copied (leaf level, so fine)
  if parent is 2-node: treeRepairmentAfterDeletion(parent, parent.left == m ? LEFT : RIGHT)
  else: parent' = new2Node(id=parent.id, the parent key that is not sep)
        if sep == parent.k1: parent'.left = m; parent'.right = parent.right
        else:                parent'.left = parent.left; parent'.right = m
        replace parent by parent' (or root = parent')
  ```
  n itself is never unlinked. It is simply not given a slot in `parent'`.
- `treeRepairmentAfterDeletion(node, mergedPos)` (**propagation**, `:1045-1168`). `node` is an underflowed 2-node whose key is stale and whose child at `mergedPos` is the merged node:
  ```
  s3 = getThreeNodeSibling(node)
  if s3: removeWithThreeNodeSiblingOption(node, s3, pos, mergedPos); return
  sib = right ?? left; sep = separating key of grandparent g
  m = new3Node(id=sib.id, {sep, sib.k1}) replaces sib
  merged = mergedPos==LEFT ? node.left : node.right
  if sib is LEFT:  m.left=sib.left; m.center=sib.right; m.right=merged
  else:            m.left=merged;   m.center=sib.left;  m.right=sib.right
  if g.parent == null: root = m (m.parent=null); return    // wrong if g is a 3-node root (§6.3)
  else treeRepairmentAfterDeletion(g, g.left == m ? LEFT : RIGHT)   // wrong if g is a 3-node: it should just shrink
  ```
- `swapWithSuccessor(n, v)` (`:425-443`, currently unreachable):
  - successor = `getSuccessor(n,v)` (`:651-683`). For a 3-node with v==k1 this is the leftmost leaf of `center`, otherwise the leftmost leaf of `right`. It is always the **in-order successor**, never the predecessor. `getPredecessor` exists (`:628-649`) but is unused.
  - The key `n.key[idx] = succ.k1` is exchanged with `succ.k1 = v`.
  - Posts `SwapEvent(v, n.id, idx, succKey, succ.id)`. Removal then continues in the successor leaf.

#### 1.5.2 Result matrix of the original (fuzzer, 3000 random trees; "ok" means the result is a valid 2-3 tree with the right key set)
| case | original HEAD | if the one-line regression (§6.2) is reverted |
|---|---|---|
| leaf 3-node, not root | always OK | always OK |
| root is a leaf (1 or 2 keys) | **NPE always** (a 2-key root: model unchanged. A 1-key root: model becomes `null`) | same |
| 2-node leaf, child of root (height 1) | OK only if the root is a 2-node and the sibling is a 2-node. Otherwise **keys are lost** (e.g. `[20,40]{[10],[30],[50]}` remove 10 gives `[20,30]`; `[80]{[50,75],[100]}` remove 100 gives `[50,80]`) | same |
| 2-node leaf, deeper | about 80% OK. Wrong when propagation hits the bad rotate or merge branches (§6.3) | same |
| any **inner** key | **always broken** (NPE or corrupted tree) | about 85-95% OK |

#### 1.5.3 Recommended remove for the port (textbook; same preferences as the original)
This is what the original intends: borrow from a 3-node sibling, **right sibling preferred over left**, else merge with the **right sibling preferred over left**, recurse, and shrink the root. For inner keys it swaps with the **in-order successor**. Where the original works, this algorithm gives exactly the same shapes (all leaf-3, borrow-at-leaf, merge-with-3-node-parent, and the correct propagation cases). Verified with the traces in §2.5.
```
remove(v):
  emit search steps (same as search); if not found: message "Klíč v NEBYL NALEZEN." and stop
  n = node with v
  if n internal:
     c = (n is 3-node and v == n.k1) ? n.center : n.right; while c.left: c = c.left
     swap n's key v with c.k1         (SwapEvent; animation §2.3)
     n = c
  if n has 2 keys: delete v from n (n keeps its id; RemoveFromLeaf); done
  if n is root: root = null; done
  fixHole(n, orphan = null)

fixHole(h, orphan):                  // h has lost its only key; orphan = its single remaining child (null at leaf level)
  p = h.parent
  if p == null: root = orphan; orphan.parent = null; return        // root shrink
  S = rightAdjacent(h) if it is a 3-node, else leftAdjacent(h) if it is a 3-node, else null
  if S:                                                           // rotate (borrow)
     sep = parent key between h and S
     if S right of h: h.keys=[sep]; p.sep := S.k1; h.children=[orphan, S.left]; S := [S.k2]{S.center, S.right}
     else:            h.keys=[sep]; p.sep := S.k2; h.children=[S.right, orphan]; S := [S.k1]{S.left, S.center}
     return
  S = rightAdjacent(h) ?? leftAdjacent(h); sep = parent key between h and S
  if S right of h: M = [sep, S.k1]{orphan, S.left, S.right}     // M keeps S's id
  else:            M = [S.k1, sep]{S.left, S.right, orphan}
  remove h and sep from p
  if p had 2 keys: p becomes a 2-node (keeps its id) with its 2 remaining children, in order
  else: fixHole(p, orphan = M)
```
Root shrink: the original gives the new root the merged node's (sibling's) id. The height-1 special case gives it the old root's id, because `removeLeafThatIsChildOfRoot` reuses `root.id`. Either is acceptable. To stay faithful, use the sibling's id generally and the root id at height 1.

### 1.6 Duplicates, validation, presets, reset
- **Duplicates:**
  - `rec` throws `Exception("Tento prvek je již ve stromu obsažen")` (`:104,:161,:168`). `insert` catches it and returns `false` (`:88-90`). The model is unchanged.
  - The controller ignores the return value (`TwoThreeTreeController.java:78-84`). It never throws `DuplicateException`, so the shared dialog `"Prvek nelze vložit" / "Tento prvek již ve struktuře <b> existuje </b>."` is **never shown** in this app.
  - What the user sees: the key badge appears, travels down the path to the node that holds the duplicate, and **stays visible there**, because no disappear step is added. No message.
  - Port: show the shared duplicate message instead (marked as a fix).
- **Value range:** none. `CommonControls.getInputValue()` is `Integer.parseInt` (MT-guiprovider `CommonControls.java:99-104`), so any 32-bit int is accepted, including negatives. Non-integers produce:
  - insert: `"Prvek nelze vložit"` / `"Špatný formát vkládaného prvku <b> (není celým číslem) </b>."`
  - remove: `"Prvek nelze odstranit"` / `"Špatný formát odstraňovaného prvku <b> (není celým číslem) </b>."`
  - search: `"Prvek nelze nalézt"` / `"Špatný formát hledaného prvku <b> (není celým číslem) </b>."`
  - All three are HTML dialogs, 400×150, ERROR icon (`CommonControls.java:283-354`).
  - The 0-100 range message exists only for 2D apps.
  - Visual note: a key cell is 22 px wide, so values wider than about 3 digits overflow.
- **Remove of an absent key:** search animation transitions are built, then the exception is thrown. The controller catches it and prints the stack trace, but `ac.playForward()` is skipped (`TwoThreeTreeController.java:108-121`). Result: nothing animates, but the description already reads `Klíč X NEBYL NALEZEN.` and the user can still press `>>` to step through the search.
- **Presets ("Vzory")**: `TwoThreePresets.java:15-19`. The dialog title is `"Vytvorit strukturu"` (no diacritics, `TwoThreeTreeController.java:148-149`). Items:
  | name | values (inserted in this order) | final tree (verified) |
  |---|---|---|
  | `Sada 1` | 50, 100, 20, 80, 10, 40, 120 | `[50]{[20]{[10],[40]}, [100]{[80],[120]}}` |
  | `Sada 2` | 50, 100, 80, 75, 120 | `[80]{[50,75],[100,120]}` |
  | `Sada 3` | 10, 20, 30, 40, 50 | `[20,40]{[10],[30],[50]}` |
  | `Sada 4` | 50, 100, 20, 90, 5, 120 | `[50,100]{[5,20],[90],[120]}` |
- **Building from a preset** (`TwoThreeTreeController.build`, `:50-75`):
  1. `reset()`, which resets **only the Animator** (§6).
  2. `MarkAsBatchGeneration = true`.
  3. One `InitAnimationEvent`.
  4. Each value is inserted in turn. All transitions accumulate into one list.
  5. Appends a moving-key disappear step and `cleanKeys()` (a 1 ms hide of every `TwoThreeKey` on the canvas).
  6. Rate is set to **10×** and the list plays. A finished-listener restores rate 1 and `MarkAsBatchGeneration=false`. This listener is added again on every build and never removed.

  So the preset is an animated replay at 10× speed. In batch mode, old lines are removed immediately on each structural change (`Animator.java:543-559`).

  Port: Reset, then insert all values while recording steps, then either play at 10× or jump to the last step.
- **Reset** (`TwoThreeTreeController.reset` calls `Animator.reset`, `Animator.java:720-727`): it clears the canvas, the element map, the layout, and the lines. **It does not reset the `B23tree` model, `keyInfos`, or the placeholder root.** Consequences (bugs):
  - After Reset the old model is still there.
  - The next operations hit missing elements, and the handlers throw NPEs (Guava logs and swallows them) until a structural change recreates every element.
  - A preset applied to a non-empty tree merges into the old model.

  Port: Reset must clear the model (and ids) **and** the view, giving an empty tree.

---

## 2. Events and animation

### 2.1 Event catalog
| Event (package `events.…`) | Fields | Posted by (B23tree) | Animator handler |
|---|---|---|---|
| `InitAnimationEvent` | – | controller, before every operation (`TwoThreeTreeController.java:53,79,106,127`) | `handleInitAnimationEvent` `:122-146`: `ac.clear()`; promotes `linesCache` into `lines`; removes the nodes from the last operation's `nodesToRemove` from the canvas; removes `movingKey`; `oldStructureInfo = newStructureInfo`; **clears the description TextArea** |
| `insert.CreateKeyEvent` | `key:String` | `insert` `:67` (always, even on an empty tree); `search` `:470` (only if root ≠ null) | `:148-160`: creates the `TwoThreeKey` badge at `keyLocation = (root.connectX − 11, TOP_MARGIN − 22) = (root.translateX, 3)`. Step: **badge fade-in 200 ms** |
| `insert.MoveKeyToNodeEvent` (extends `SimpleEvent{nodeId,key,index}`) | nodeId, key, index (always 0) | `rec` for every visited node, including the root (`:100`); `search` for each child descended into (`:481,490,514,525,535`) | `:232-242`: target = `layout slot(nodeId) + (22, −11)`. Step: **badge move 1000 ms** from the previous `keyLocation`, then `keyLocation` = target |
| `insert.InsertToLeafEvent` | nodeId, key, index (0/1), parentID (unused) | `:71` (empty tree), `:117` (into a 2-node leaf) | `:162-196`, in order: (a) if the node is the invisible placeholder root, step: **node fade-in**; (b) step: **badge move** to `keyLocation + (index·22, +22)`; (c) step: **badge fade-out**; (d) if `docked[index]` is occupied (inserting at index 0 into a node that has a key), step: **shift**, i.e. parallel fade-out of key1 and fade-in of key2. key2's text is set to the old key1, and onFinished sets key1=new, key2=old (`animateKeyMove`, `:737-762`); (e) text set and step: **key text fade-in** at index; `docked`/`keyInfos` updated |
| `insert.SplitRootEvent` | nodeId | `split` when tri is root (`:572`) | only printed (`:453-457`) |
| `insert.SplitEvent` | parentId, newId, splitId, keyToParent(mid), keyToNew(max), splitHasChildren, splitIndexInParent(always 0), keyToSplitted(min) | after each split (`:173,191,223,256`) | `:821-830`: appends the description (§2.2); step: **badge fade-out**. `handleSplitEventWithStructuralChange` is an empty stub. `handleSplitEventOld` is dead |
| `insert.InsertToInnerNodeEvent` | nodeId (the absorbing parent), key (= inserted v), index 0/1 (went left/right) | `:137,:157` | only printed (`:509-513`) |
| `insert.StructuralChangeEvent` | `ITreeStructure` snapshot: BFS tree of `{id, idParent, position LEFT/MIDDLE/RIGHT, NodeKeys(k1,k2,is2)}` (`TreeStructureBuilder`) | after an insert that split (`:84`); after every successful remove (`:305,:337`) | `:515-565`. **This is the only place where nodes are created, moved or deleted** (see §2.3) |
| `remove.RemoveFromLeafEvent` (not an `Event` subclass) | nodeID, key:int, index | `removeThreeLeaf` `:455` | `:410-443`: clears `docked[index]` and appends the description `Odstraňuji klíč X z listu.` A fade transition is built but **never added** to `ac`, so there is no step |
| `remove.SwapEvent` (not an `Event`) | keyToRemove, nodeToRemoveID, toRemoveIndex, keyFromSuccessor, successorID | `swapWithSuccessor` `:441` (unreachable at HEAD) | `:359-408`: step 1, parallel fade-out of the original key text and the successor's key1; onFinished swaps the texts (back undoes it). Step 2, parallel fade-in of both. No description |
| `search.SearchStartedEvent` | nodeId, key | `:469` | only printed |
| `search.SearchFinishedEvent` | nodeId (Integer, null on an empty tree), key, result | `:465`, `:545` | `:465-497`: step: **badge fade-out**. If found: step: a **sequential StrokeTransition on the matching key's `Text`**, BLACK→RED 200 ms then RED→BLACK 200 ms, plus description `Klíč X byl NALEZEN.` Otherwise description `Klíč X NEBYL NALEZEN.` |
| `cz.commons.twothreetree.layoutmanager.MoveElementEvent` | elementId, oldPoint, newPoint | layout bus (`TreeLayoutManager.transformTree` `:298`, `DepthRow.movePoint` `:101-106`) | `:711-718`: one step per event, **element translate 1000 ms** |
| `AnimationFinishedEvent` | – | controller after insert/remove (`:81,:112`) | no subscriber (Guava DeadEvent) |
| `remove.CreateEmptyRootEvent`, `remove.MergeEvent`, `remove.MoveKeyFromLeft/RightSiblingEvent`, `insert.PositionSetEvent`, `search.MoveToNodeEvent` | – | **never posted** | – (`handleMoveToNodeEvent` only prints) |

Guava detail: the Animator is registered on two buses, the model bus and the layout manager's private bus. `MoveElementEvent`s are dispatched synchronously while `StructuralChangeEvent` is being handled, because they are on a different bus. Their steps therefore sit between "lines fade-out" and "key changes".

Each `ac.getTransitions()` entry is one **step**. Steps play sequentially. Stepping mode ("Krokovat") pauses after each one. `<<` plays a step in reverse, and the `StepEventHandler` back-handlers restore texts. The descriptions are written to the TextArea **immediately when events are processed**, so all of an operation's lines appear at once at the start, not in sync with the steps.

### 2.2 User-facing texts (verbatim; each is appended with `"\n"` via `updateDescription`, `Animator.java:445-451`)
- Split (`Animator.java:823-824`):
  `Došlo k rozdělení prvku, klíč {keyToParent} je přesunut do rodiče, zatímco klíč {keyToNew} je přesunut do nově vzniklého prvku`
  There is no trailing period. keyToParent = middle key, keyToNew = max key.
- Remove from a 3-key leaf (`:441`): `Odstraňuji klíč {key} z listu.`
- Search hit (`:491`): `Klíč {key} byl NALEZEN.`
- Search miss (`:494`): `Klíč {key} NEBYL NALEZEN.`
- There is **no text** for a plain insert, a leaf insert, a borrow, a merge, a swap, or a duplicate.
- Window title: `2-3 strom` (`Main.java:48`).
- Help (`TwoThreeTreeController.provideHelp`, `:165-173`; HTML dialog "Nápověda", 600×300), verbatim:
  `<b> 2-3 strom </b> <br> <br>Je dokonale vyvážený strom (tzn. všechny jeho listy leží ve stejné hloubce). <br>· Každý uzel má buď jednu nebo dvě klíčové položky. <br> V případě jediného klíče má dva potomky, v případě dvou klíčů právě tři potomky (samozřejmě tehdy, pokud se jedná o vnitřní uzel).`

### 2.3 StructuralChangeEvent handling (`Animator.java:515-565`): the diff-and-tween core
Steps are appended in this order:
1. If there is a previous snapshot (`oldStructureInfo != null`): one step, **fade-out of all current lines** (200 ms). Its back-handler re-creates the old lines.
2. `analyzeNodeChanges` (`:658-679`): every displayed element is first marked for removal. For each id in the new snapshot: if the element exists it is un-marked; otherwise a new `TwoThreeElement(id)` is created with empty keys, `keyInfos[id] = (null,null)`, and it is added to `newNodes`.
3. `layMan.transformTree(snapshot, elements)` (`TreeLayoutManager.java:276-307`): rebuilds the slot grid in BFS order. For each surviving id it posts `MoveElementEvent(oldSlotPoint → newSlotPoint)`, which is **one sequential 1000 ms step per surviving node**, even when the displacement is zero. New ids are added to the canvas. Rows created during the rebuild re-post `MoveElementEvent`s for elements already in them when a deeper row is added (move events are only "disabled" before the rows exist). This yields extra move steps, also for new, still-invisible nodes.
4. Lines for the new snapshot are created, kept invisible, for each parent→child (§3.3).
5. `analyzeKeyChanges` (`:681-709`): for every node in the snapshot, each key slot whose displayed value differs from the new value (compared with Integer `!=`, so by value only inside the Integer cache −128..127; values outside that range always count as changed) triggers `replaceKeyInNode` (`:764-819`). That adds **3 steps per changed key slot**: fade-in (the text is already set to the new value at build time), fade-out (onFinished sets the new text; back sets the old), fade-in.
6. One step: **parallel fade-in of all new nodes**. Before that, `setPositionHACK` places them at their final slot. The same step **fades out all removed nodes**. They are physically removed from the canvas at the next `InitAnimationEvent`.
7. One step: **parallel fade-in of all new lines**.

Port mapping: a StructuralChange equals "snapshot N+1". Nodes with the same id tween from the old to the new position. New ids fade in, missing ids fade out. Changed key slots cross-fade. Lines fade out, then back in. Recommended steps are in §2.4.

### 2.4 Recommended step decomposition for the port
Items marked [NEW] are texts the original does not have. Either leave them blank or use these.
- **Insert v:**
  1. Badge appears above the root.
  2. One step per visited node (insert visits the root too): the badge moves to the node, and the node is highlighted. The original has no node highlight; it is optional.
  3. Leaf without overflow: the badge moves into slot `index`, then the key appears. If index=0 in a 1-key node, the existing key shifts right first.
  4. Overflow: for each split, bottom-up, one step that sets the text `Došlo k rozdělení prvku, klíč M je přesunut do rodiče, zatímco klíč X je přesunut do nově vzniklého prvku` and hides the badge. Then one final structural step (snapshot after the whole insert; tween, fade, cross-fade).
  5. Optionally, for the port, intermediate snapshots per split level for better teaching. The original shows only one final snapshot.
- **Search v:**
  1. Badge appears above the root. There is no move to the root; the original moves the badge directly to the first child. A port may add a root highlight step.
  2. Move steps per descended child.
  3. Badge fades out. If found, the found key gets a red highlight with the text `Klíč v byl NALEZEN.`; otherwise `Klíč v NEBYL NALEZEN.`
- **Remove v:**
  1. The full search sequence.
  2. If the key is in an inner node: a swap step that cross-fades key v and the successor key.
  3. If it is in a 3-key leaf: text `Odstraňuji klíč v z listu.` and the key fades out.
  4. A final structural step. The original posts exactly one StructuralChange per remove.

### 2.5 Concrete traces (real output; `EV` lines are events in posting order)
**Insert 10, 20, 30 into an empty tree**
```
insert 10: CreateKey{10}; InsertToLeaf{node 0, key 10, idx 0}                                       -> #0[10]
insert 20: CreateKey{20}; MoveKeyToNode{0}; InsertToLeaf{0, 20, idx 1}                              -> #0[10,20]
insert 30: CreateKey{30}; MoveKeyToNode{0}; SplitRoot{0};
           Split{parent 0, new 3, split 1, toParent 20, toNew 30, toSplitted 10, hasChildren false};
           StructuralChange #0[20]{L:#1[10] R:#3[30]}                                                -> #0[20]{#1[10], #3[30]}
           description: "Došlo k rozdělení prvku, klíč 20 je přesunut do rodiče, zatímco klíč 30 je přesunut do nově vzniklého prvku"
```
Raw step lists in the original, on a fresh app (canvas center cx=2100; the placeholder root's translate is (2100,25), its layout slot is (2085,15)):
- insert 10, 5 steps:
  1. badge "10" fade-in at (2100,3)
  2. node #0 fade-in
  3. badge move (2100,3)→(2100,25)
  4. badge fade-out
  5. key1 "10" fade-in
- insert 20, 5 steps:
  1. badge fade-in at (2100,3)
  2. move→(2107,4)
  3. move→(2129,26)
  4. badge fade-out
  5. key2 "20" fade-in
- insert 30, 18 steps:
  1. badge fade-in
  2. move→(2107,4)
  3. badge fade-out (from Split)
  4. move #0 (2085,15)→(2085,15). This is a 1 s step that visually snaps #0 from (2100,25).
  5. Steps 5-16, four key-slot changes of 3 steps each: #0 key1 10→20, #0 key2 20→∅, #1 key1 ∅→10, #3 key1 ∅→30.
  6. Step 17: #1 and #3 fade in at (2018.89,70) and (2132.22,70).
  7. Step 18: lines #0→#1 and #0→#3 fade in.

**Then insert 40, 50, 60, 70 (cascading split)**
```
insert 40: CreateKey; MoveKeyToNode{0}; MoveKeyToNode{3}; InsertToLeaf{3, 40, idx 1}                -> #0[20]{#1[10], #3[30,40]}
insert 50: CreateKey; MoveKeyToNode{0}; MoveKeyToNode{3};
           Split{parent 4, new 5, split 3, toParent 40, toNew 50, toSplitted 30, hasChildren false};
           InsertToInnerNode{node 0, key 50, idx 1};
           StructuralChange #0[20,40]{L:#1[10] M:#3[30] R:#5[50]}
           (visual: #3 moves from slot 2 to slot 1, #5 appears in slot 2, #0 gains key2=40, #3 loses key2)
insert 60: CreateKey; MoveKeyToNode{0}; MoveKeyToNode{5}; InsertToLeaf{5, 60, idx 1}                -> #0[20,40]{#1[10], #3[30], #5[50,60]}
insert 70: CreateKey; MoveKeyToNode{0}; MoveKeyToNode{5};
           Split{parent 6, new 7, split 5, toParent 60, toNew 70, toSplitted 50, hasChildren false};
           SplitRoot{0};
           Split{parent 0, new 10, split 6, toParent 40, toNew 60, toSplitted 20, hasChildren true};
           StructuralChange #0[40]{L:#6[20]{L:#1[10] R:#3[30]} R:#10[60]{L:#5[50] R:#7[70]}}
           descriptions (2 lines):
             "Došlo k rozdělení prvku, klíč 60 je přesunut do rodiče, zatímco klíč 70 je přesunut do nově vzniklého prvku"
             "Došlo k rozdělení prvku, klíč 40 je přesunut do rodiče, zatímco klíč 60 je přesunut do nově vzniklého prvku"
```
In the insert-70 step: #0 stays at the top and changes keys [20,40]→[40]. #6, #10 and #7 are new. #1, #3 and #5 survive and move down to row 3 (height 2→3). Note that #6 is the temp id of the first split's promoted node, reused as the left half (§1.2).

**Search 55 and 60 in that tree**
```
search 55: SearchStarted; CreateKey{55}; MoveKeyToNode{10}; MoveKeyToNode{5}; SearchFinished{node 5, NOT FOUND}
           steps: badge fade-in, move→#10, move→#5, badge fade-out;  text "Klíč 55 NEBYL NALEZEN."
search 60: SearchStarted; CreateKey{60}; MoveKeyToNode{10}; SearchFinished{node 10, FOUND}
           steps: badge fade-in, move→#10, badge fade-out, key1 of #10 stroke black→red→black (2×200 ms); "Klíč 60 byl NALEZEN."
```
A duplicate `insert 60` gives: CreateKey; MoveKeyToNode{0}; MoveKeyToNode{10}; then the duplicate exception, with no more events. The model is unchanged and the badge is left visible.

**Remove: leaf key with borrow (rotation)**. Start from Sada 1 plus 30: `#0[50]{#6[20]{#1[10], #5[30,40]}, #10[100]{#3[80], #7[120]}}`
```
remove 10: SearchStarted; CreateKey{10}; MoveKeyToNode{6}; MoveKeyToNode{1}; SearchFinished{1, FOUND};
           StructuralChange #0[50]{L:#6[30]{L:#1[20] R:#5[40]} R:#10[100]{...}}
```
The right sibling #5 was a 3-node: 20 went down from the parent into #1, and 30 went up from #5. Visually: #1 10→20, #6 20→30, #5 [30,40]→[40] (all key cross-fades, no node moves).

**Remove: leaf key with merge, propagating up to a root shrink**. Start from Sada 1: `#0[50]{#6[20]{#1[10], #5[40]}, #10[100]{#3[80], #7[120]}}`
```
remove 10: …search…; StructuralChange #10[50,100]{L:#5[20,40] M:#3[80] R:#7[120]}
```
Step by step:
1. #1 is emptied and its sibling #5 is a 2-node, so they merge into [20,40], which keeps id #5.
2. Parent #6 underflows. Its sibling #10 is a 2-node, so #10 merges into [50,100] (keeps id #10) with children #5, #3, #7.
3. The grandparent was the root, so the root becomes #10.
4. Nodes #0, #6 and #1 fade out, #10 moves up to row 1, and height goes 2→1.

Merge with a 3-node parent (correct in the original): `#0[20]{#1[10], #3[30,40]}`… The cases at height 1 use the special path (§1.5.1). At depth ≥2 with a 3-node parent, the parent just becomes a 2-node with the remaining key.

Deeper propagation that the original gets **wrong**. Tree: inserts 10..90 give `#0[40]{#6[20]{#1[10],#3[30]}, #10[60,80]{#5[50],#7[70],#12[90]}}`. `remove 10` → original result `#0[60]{#6[40]{#12[90], #3[20,30]}, #10[80]{#5[50],#7[70]}}`, which is an invalid BST. Correct (§1.5.3): `#0[60]{#6[40]{#3[20,30], #5[50]}, #10[80]{#7[70], #12[90]}}`. The mirrored case (inserts 90..10, `remove 90`) is correct in the original: `#0[40]{#6[20]{#1[10],#12[30]}, #10[60]{#7[50], #5[70,80]}}`.

**Remove: 3-key leaf**. Sada 2 `#0[80]{#1[50,75], #3[100,120]}`: `remove 75` gives …search…; `RemoveFromLeaf{node 1, key 75, idx 1}`; StructuralChange `#0[80]{#1[50],#3[100]}`. Text: `Klíč 75 byl NALEZEN.` then `Odstraňuji klíč 75 z listu.`

**Remove: inner-node key**. Sada 1, `remove 20`:
- Original HEAD: search reaches #6 (found), then an **NPE**. The model is left corrupted (`#10[50,100]` with no children). No StructuralChange is posted and no animation plays (only the description `Klíč 20 byl NALEZEN.`).
- Intended (regression reverted, which equals §1.5.3):
  ```
  …search (MoveKeyToNode{6}, SearchFinished{6, FOUND})…; Swap{keyToRemove 20, node 6, idx 0, keyFromSucc 40, succ 5};
  StructuralChange #10[50,100]{L:#1[10,40] M:#3[80] R:#7[120]}
  ```
  Successor 40 replaces 20 in #6, then leaf #5 empties, merges with #1, and propagates to a root shrink.
- Inner key with a 3-node parent, intended. Tree `[25]{[22]{[20],[24]}, [40]{[30],[60]}}`: `remove 22` swaps with 24, giving `#10[25,40]{#1[20,24], #5[30], #3[60]}`. `remove 40` gives `#6[22,25]{#1[20], #7[24], #5[30,60]}`.

---

## 3. Visual style

### 3.1 Node element (`cz/commons/twothreetree/example/layoutManager/TwoThreeElement.java`)
- Constants (`:24-27`): `KEY_WIDTH = 22`, `HEIGHT = 22`, `VSPACE = 50` (unused), and the width is `2·KEY_WIDTH = 44`. **Every node is drawn 44×22, including 2-nodes**; their right half stays empty.
- Background: `Rectangle(44,22)`, fill `Color.YELLOW` (#FFFF00), stroke `Color.BLACK`, `StrokeType.INSIDE`, width 1 (`:83-86`).
- Content: an `HBox(key1 Text, divider Line(22,2 → 22,22), key2 Text)`, centered (`Pos.CENTER`) in a StackPane (`:69-79`).
  - Texts use the JavaFX default font (System about 12-13 px) in black. They start with `visible=false`, text "".
  - The divider is always present, including on 2-nodes. Because the HBox centers its children by their actual widths, the divider is not pinned at x=22: in a 2-node it sits just right of the single key, and the group "key1 | " is centered.
  - Port: draw two fixed 22-px cells with the divider at x=22, keys centered in their cells, and the right cell empty for 2-nodes. Optionally render 2-nodes as a single 22-px cell, but then adjust the line anchors.
- Placeholder root (id 0): created at translate (canvasPrefWidth/2 = 2100, `TOP_MARGIN`=25), hidden until the first insert (`Animator.java:55,100-110`).
- Per-key highlight: there is only one, the found key's `Text` stroke animating BLACK→RED→BLACK (`Animator.java:481-489`). Afterwards the text keeps a black stroke. No node or path highlight exists. Port: highlight the found key cell in red (or the shared "found" color); a path highlight is optional.

### 3.2 Moving key badge (`TwoThreeKey.java`)
- A 20×20 StackPane containing a `Circle(r=10)` filled `Color.YELLOW` with a `BLACK` stroke, plus a centered `Label(key)` (max width 20). It has a tooltip with the key (`:13-48`).
- The badge's translate is its top-left corner. Positions:
  - created at `(root.x, 3)`
  - `MoveKeyToNode` target is `(slot.x + 22, slot.y − 11)`, so the circle center is at `(node.x+32, node.y−1)`, on the node's top edge over the right cell
  - the final drop is `(previous + index·22, previous.y + 22)`. This is only accurate for the first insert into the root.
  - Port: move above the node, then drop into the center of cell `index` (`node.x + 11 + 22·index`, `node.y + 11`).
- Timings (`animation/utils/AnimationTools.java:20-21`): move `DURATION=1000 ms`, fade `SHORT_DURATION=200 ms`, `immediateHide` 1 ms. The speed slider is the rate multiplier, 0.3-2.5, default 1. A preset build runs at rate 10.

### 3.3 Lines (`TwoThreeElement.connectChild`, `:213-223`; shared `BranchNodeElement` `MT-common/.../BranchNodeElement.java:67-86`; `LineElement`)
- Child connector i (0=left, 1=middle, 2=right) is at **(node.x + 22·i, node.y + 22)**: bottom-left corner, bottom at the divider, and bottom-right corner.
- The Animator connects the left child via 0, the middle via 1, and the right via 2 (`Animator.java:626-652`). A 2-node's two children therefore use the **outer corners 0 and 2**; a 3-node also uses the middle (x+22).
- Line end (the child's parent-connector, `TwoThreeElement.doParentBindings` `:125-131`) is at **(child.x + rectWidth/4 = child.x + 11, child.y + 1)**: the top-center of the child's **left** key cell.
- Default JavaFX `Line`: black, 1 px. Lines are drawn as separate canvas children and fade (200 ms).

### 3.4 Layout (`cz/commons/twothreetree/layoutmanager/*`; settings `Main.java:33`)
`TreeLayoutSettings(40, 40, 30, 15)` gives `paddingTop=15`, `horizontalSpace=40`, `verticalSpace=40`, `widthNode=30`, `heightNode=15` (`TreeLayoutSettings.java:14-16`). The names are swapped in use: `verticalSpace` is used as the horizontal gap and `horizontalSpace` as the vertical gap. The layout assumes 30×15 nodes while the drawn node is 44×22.

The layout is a **fixed complete ternary slot grid**:
- Depth row k (1-based) has `3^(k−1)` slots.
- The children of the node in slot p go to slots `3p` (LEFT), `3p+1` (MIDDLE) and `3p+2` (RIGHT) (`TwoThreeTreeHelper.java:50-60`). A 2-node's children occupy slots 3p and 3p+2, leaving the middle slot empty, so a 2-node's children straddle its position symmetrically.
- The position snapshot children come from `TreeStructureBuilder` (BFS, positions LEFT/MIDDLE/RIGHT; a 2-node's right child is RIGHT).

Formulas (all positions are the element's top-left translate):
- `y_k = paddingTop + (k−1)·(heightNode + horizontalSpace) = 15 + 55·(k−1)` (`TwoThreeTreeHelper.getDepthYPosition` `:36-41`).
- Let D be the number of rows (height + 1) and cx = canvas width / 2 (`CanvasRangeInfo`, `TreeLayoutManager.java:37`). With the 4200-wide canvas, cx = 2100. This assumes the canvas was laid out before the controller was built; the controller is created after `stage.show()`.
- Root row: `x = cx − widthNode/2 = cx − 15`. It is set by `DepthRow.initPoints` when the row is created and **never recalculated** (`DepthManager.addDepth` recalculates rows from index 1 up, `:24-32`).
- Rows k ≥ 2, after the last row is added (`DepthRow.recalculateNodesPositions(D+1)`, `:36-54`):
  ```
  W   = 3^(D−1)·30 + (3^(D−1) − 1)·40          // width of the deepest row
  minX = cx − W/2
  m   = W / 3^D
  mult = 3^(D−k+1)
  x_i = minX − 15 + floor(mult/2)·m + i·mult·m   // i = slot index in row k
  ```
  (`offsetMultiple/2` is integer division, so it equals 1 for the deepest row.) Coordinates are doubles; the source comment notes rounding drift.
- Numbers for cx=2100:
  - D=1: root (2085, 15).
  - D=2: root (2085, 15). Row 2 at y=70: slots x = 2018.89, 2075.56, 2132.22.
  - D=3: row 2 at y=70: 1877.41, 2074.07, 2270.74. Row 3 at y=125: 1811.85, 1877.41, 1942.96, 2008.52, 2074.07, 2139.63, 2205.19, 2270.74, 2336.30.
  - D=4: row 2: 1456.91, 2073.58, 2690.25. Row 4 spacing about 68.5. The total width is 1850 px.
- Because the root row is never recalculated, the root's left edge stays at cx−15. The middle child slot sits at cx−26 (D=3), so the root is about 9-11 px right of the middle column.
- Port: either reproduce the formula exactly, or use the intended "ternary grid centered under the parent" with node width 44: slot spacing at the deepest row is node width + gap, and parent x = the mean of its 3 child slots, which gives perfect centering. Keep the important property: **slots are fixed per (depth, index), so 2-node children leave the middle gap and the width grows as 3^height.**

### 3.5 Canvas / window
- Window 1000×500 (`Main.java:24-25,44`). The canvas `Pane` has pref size 4200×500 (`:46`) and sits inside a pannable `ScrollPane` (wrapped in a `Group`), horizontally centered with `hvalue=0.5` (`CommonControls.centerifyScrollPane`).
- A description `TextArea` sits at the bottom, height 50, non-editable (`CommonControls.java:226-235`, `arrangeScene(as,true)`).
- Background: transparent ScrollPane (default white). There is no `application.css` content (the file is empty).

---

## 4. UI specifics
- Window title `2-3 strom`. Toolbar is the shared `CommonControls(debug=true, twoD=false)`: `Prvek:` [text], `Vložit`, `Odstranit`, `Najít`, `Krokovat`, `<<`, `>>`, `Rychlost:` slider, `Play/Pause`, `Vzory`, `Reset`, `?`. The debug button `!!!` is created but not added to the toolbar.
- Presets dialog title `Vytvorit strukturu`, with items `Sada 1`…`Sada 4` (§1.6).
- Help text: §2.2.
- Error dialogs: §1.6. In this app none come from the 2-3 code itself; all come from input parsing.
- Description texts: §2.2. The description area is cleared at the start of each operation.

---

## 5. Tests (`twothreetree/test/`)
- `TreeTest` is a JavaFX `Application` with no assertions. Its Javadoc reads "Srovnávací test stromů koncepce Šára a mého prototypu" (a comparison test of Šára's trees and the author's prototype).
- It builds a `B23tree` with an `EventLogger` (which prints every insert/search event), runs `insert(20), insert(60), insert(40), remove(20)`, and prints the structure after each operation. Real result: `[40]{[20],[60]}`, then after the remove `[40,60]`, via the height-1 special path.
- Commented out: inserts 30, 25, 22, 24 and `remove(22)`, `remove(30)`, `remove(40)`, marked "TESTED, OK". At HEAD, `remove(22)` and `remove(40)` (both inner keys) throw an NPE. They only work when the §6.2 regression is reverted, which suggests they were tested before commit `974a813`. `remove(30)` works.
- There is no automated test. Port tests should assert: the four preset shapes (§1.6), all the §2.5 traces (shapes and id survival), and invariants under random sequences (sorted, equal leaf depth, 1-2 keys, children = keys+1).

---

## 6. Known bugs, TODOs, intent, and deviations from the textbook

### 6.1 Insert
1. **NPE after a left-child split under a non-root 2-node.**
   - Location: `B23tree.java:127-129` (`replaceChild` nulls `node.parent`, then `node.getParent().getID()` is called).
   - When: the value descends **left** from a non-root inner 2-node and the child split.
   - Effect: the model ends up correct, but the exception is swallowed. `insert` returns `false`, `size` is not incremented, and `InsertToInnerNode` and **`StructuralChange` are never posted**, so the view keeps the stale tree. The next insert into a new node id then NPEs inside the Animator handlers.
   - Example: inserts 10..70, then 5, then 7. Found in 66% of random sequences of up to 40 inserts.
   - The right-hand branch (`:141-159`) does not read the parent id, so it is unaffected.
   - Port: always emit the snapshot.
2. Duplicate inserts give no feedback (§1.6).
3. `InsertToLeafEvent.parentID`, `SplitEvent.splitIndexInParent` (always 0) and `splitHasChildren` are unused by the Animator. The `splitNode` comment (`:606-608`, Czech) says that unlike the colleague's version, both split halves are created anew here and fixed up in the tree afterwards.
4. Id reuse quirks (§1.2): ids are wasted, and an inner split's left half takes the temp node's id.

### 6.2 Remove: one-line regression (root cause of "inner keys never work")
- In commit `974a813` ("Fixed bug while deleting the direct child of root who is also a leaf"), `if (toRemove.isInternal()) toRemove = swapWithSuccessor(...)` was accidentally wrapped in `if (toRemove.isLeaf()) {…}` (`B23tree.java:310-315`). `isLeaf` and `isInternal` are mutually exclusive, so the swap never runs.
- Intent, clear from `swapWithSuccessor`'s Javadoc (`:416-424`), `SwapEvent`, and the "Implemented swap animation" / "fixed swap animation" commits: **replace the inner key with its in-order successor**, then delete from the leaf.

### 6.3 Remove: other bugs
- **Root is a leaf:**
  - 2-key root: `removeThreeLeaf` calls `parent.replaceChild` on null, an NPE (`:458`). The model is unchanged.
  - 1-key root: `root=null`, then the code falls through to an NPE in `removeWithTwoNodeSiblingOption` (`:982`). The model is now empty, but no snapshot is posted, so the view still shows the node. The next insert creates a new id that the Animator does not know.
  - Commit `c0e0e2f`'s message says "If root is leaf and 2node, just set it to null. No hard feelings."; the missing `return` is the bug.
- **Height-1 special case** `removeLeafThatIsChildOfRoot` (`:341-356`): it always merges the root key with the sibling's `keyOne` into a new childless root. It is wrong when the root is a 3-node or the sibling is a 3-node (loses keys), and it skips the borrow check.
- **Rotation child rewiring** (`:914-958`) is only correct when the sibling is on the same side as the separating key. It is wrong in three propagation cases: parent is the left child of a 2-node grandparent; parent is the left child of a 3-node grandparent (sibling = center); parent is the right child of a 3-node grandparent (sibling = center). Keys end up out of BST order and one subtree is lost (§2.5 example).
- **Merge propagation** (`:1150-1161`):
  - When the grandparent is the root, `root = merged` even if the grandparent is a 3-node, so keys are lost.
  - When the grandparent is not the root, it always recurses as if the grandparent underflowed, even when the grandparent is a 3-node (it should just drop to a 2-node).
  - When the merged node ends up in the grandparent's center, the code passes `RIGHT` as the merged position.
- An inner 3-node removal would go to `removeThreeLeaf`. That loses the children and is guarded only by the comment stub `removeThreeInternal` (`:1202-1218`, which prints "Algorithm error - called 3Node is missing left or right child !").
- `size` is never decremented. `mergeNodes` throws `NotImplementedException`. `examine`, `reorganization`, and the commented `recursiveRemoving` (`:358-398`) are dead.
- The controller skips `playForward()` whenever remove throws (§1.6).
- `RemoveFromLeafEvent`'s fade is never added to the step list (`Animator.java:425-439`).
- Debug messages (System.err, not shown to the user): "Algorithm error - should have sibling but its position is unknown", "Algorithm error - Position of key in parent is unknown", "Algorithm error - unable to get sibling key".
- Intent comments (Czech, `:1061-1084`):
  - For a 3-node sibling, do the "classic rotation": the separating key goes down, the sibling's adjacent key goes up, the adjacent child moves over, and the previously merged node shifts.
  - Otherwise merge the sibling with the parent key into a 3-node and attach the merged child at the edge.
  - Both match §1.5.3.
  - `//NOT TESTED: pustit algoritmus rekurzivne na parenta` ("run the algorithm recursively on the parent", `:1038`).

### 6.4 Animator / controller
- **Reset** clears only the view, not the model (§1.6). Presets reset only the view, so they merge into the old model, and the first inserts NPE in the handlers until the first split recreates the elements.
- Descriptions are not synchronized with the steps (§2.1).
- One 1-second move step is added per surviving node, sequentially, on each structural change (plus duplicate moves when rows get added). Three fade steps per changed key slot. Integer `!=` compares by identity, so for |value| > 127 every key is re-animated on every structural change (`Animator.java:686,697,701`).
- `keyInfos.remove(insertingLeaf.getId())` uses the JavaFX string id (a no-op) (`:199-201`). `dockingUpdate` and `recursiveIndex` are unused.
- The placeholder root is at (2100,25) while its slot is (2085,15), so the root jumps on the first structural change.
- Old lines are never removed from the canvas in interactive mode, only faded out. `lines` keeps growing.
- `handleSearchFinishedEvent` on an empty tree fades the stale `movingKey`.
- `DepthRow` comment (`:32-35`, Czech): "V tomto je problém - při přepočtu dochází k nechtěnému posunu po X vlivem chyby zaokrouhlení" ("the problem is here: recalculation causes an unwanted X shift due to rounding error").
- `DepthManager.addDepth` passes `size()+1` as maxDepth, marked "// TESTING:".

### 6.5 Deviations from the textbook 2-3 tree
- Insert follows the textbook (bottom-up, middle key promoted).
- Remove deviates only through the bugs above. The intended design is textbook: successor swap, borrow before merge, right sibling before left.
- Search is the textbook search.
- There are no other variants (no top-down splitting, no duplicate handling).

---

## Appendix A: `log_insert.txt` (historical, NOT authoritative)
- Committed in `d813135` (2015-06-14). It was produced by the deprecated Šára-based `deprecated/twothreetree/TwoThreeTree.java`, not by `B23tree`.
- Ids there start at 1, and splits happen before the key descends.
- Sequence inserted: 60, 80, 20, 40, 50. For example, 20 into [60,80] logs `SplitRootEvent{2}`, then `SplitEvent{Parent 2, New 3, Split 1, KeyToParent=80}`, then `MoveKeyToNode{1}`, then `InsertToLeaf{1, 20, idx 0}`. `KeyToParent=80` is wrong there.
- The first two lines of the log, `0.0` and `4200.0|500.0`, are debug prints of the canvas width before layout and of the pref size.
- **Use §2.5, not this file.**
