# Shared GUI / styling libraries – re-implementation spec

Scope: the two shared libraries used by all four 2015 JavaFX thesis apps (BVS, AVL, Quad tree, 2-3 tree), and how the apps use them for look & feel. Algorithms of individual apps are out of scope (other specs).

Paths used below:
- `GP` = `/Users/viktor.krejcir/Dev/viktor/thesis2/MT-guiprovider/src` (package `components.*`, `exceptions.*`), git HEAD `abda9aa` 2015-09-04 "Fixed error dialog on range."
- `MC` = `/Users/viktor.krejcir/Dev/viktor/thesis2/MT-common/src/cz/commons` (package `cz.commons.*`), git HEAD `c3aea16` 2015-06-26.
- `APPS` = `/Users/viktor.krejcir/Dev/viktor/thesis2/bitbucket/{bvs,avltree_version-2,quad-tree,2-3-tree}/src`

JavaFX color names are given with hex (JavaFX named colors = CSS/X11 names).

---

## 0. TL;DR for the implementer

| Item | Value |
|---|---|
| Window (scene) size | 1000 x 500 px, all four apps (`APPS/*/application/Main.java`: `width = 1000; height = 500`) |
| Window titles | BVS `"Binary Search tree"`, AVL `"AVL tree"`, Quad `"Quad Tree"`, 2-3 `"2-3 strom"` |
| Layout | BorderPane: top = ToolBar, center = ScrollPane (pannable) holding a 4200 x 500 px canvas, bottom = (2-3 tree only) 50 px read-only TextArea |
| Canvas background | transparent ScrollPane, so you see the Modena root background `#F4F4F4` (checked by sampling the screenshot pixels) |
| Initial scroll | horizontally centred (`hvalue = 0.5`), so canvas x = 2100 sits in the middle of the viewport |
| BVS/AVL node | 30 x 15 px rectangle, fill `YELLOW #FFFF00`, stroke `BLACK #000000` 1 px drawn *inside*, key text centred, JavaFX default font (System 12 px; Segoe UI on the Windows screenshots) |
| Search success / fail | node fill `LIGHTGREEN #90EE90` / `LIGHTPINK #FFB6C1` |
| Edges | plain JavaFX `Line`: black, 1 px, no arrowheads. Start = **bottom-left corner** of the parent (left child) or **bottom-right corner** (right child); end = child's **top-centre + 1 px** |
| Level gap | 35 px between row tops (node height 15 + gap 20); first row top y = 15 |
| Column pitch | 50 px (30 node + 20 gap), nodes are placed by **in-order index** (one column per node). Extra 20 px gap just left of the root (see §4.3) |
| Animation step base durations (apps' `AnimationTools`) | move 1000 ms, fade/scale 200 ms, "immediate" 1 ms |
| Speed slider | min 0.3, max 2.5, default 1.0. The value is a *rate* multiplier: effective duration = base / rate |
| Easing | JavaFX default `Interpolator.EASE_BOTH` on every leaf transition (formula in §5.6) |
| Preset build ("Vzory") | plays the whole build at rate 10, then resets the rate to 1 |
| Error dialogs | 400 x 150, error icon, single "OK" button, HTML message |
| Help dialog | title `"Nápověda"`, 600 x 300, info icon, HTML from `Controller.provideHelp()` |

---

## 1. Toolbar / CommonControls (`GP/components/CommonControls.java`)

### 1.1 Construction
`new CommonControls(boolean debug, boolean twoD)` (`CommonControls.java:62-90`). Every app passes `debug = true`. Quad tree passes `twoD = true`, the others pass `false` (`APPS/*/application/Main.java`).

Widgets and their verbatim labels:

| Field | Type | Label (verbatim) | Notes |
|---|---|---|---|
| `elementLabel` | Label | `Prvek:` | :41 |
| `elementText` | TextField | (empty) | default JavaFX width (~149 px on screenshot; prefColumnCount 12). In 2D: prefWidth **50** (:84) |
| `elementText2` | TextField | (empty) | 2D only, prefWidth **50** (:85) |
| `insertButton` | Button | `Vložit` | :65 |
| `removeButton` | Button | `Odstranit` | :66 |
| `searchButton` | Button | `Najít` | :64 |
| `viewSwitchButton` | `cz.commons.utils.ViewSwitchButton` | icon only (16x16) | 2D only |
| `stepCheckBox` | CheckBox | `Krokovat` | :40, unchecked by default |
| `prevStepButton` | Button | `<<` | :68 |
| `nextStepButton` | Button | `>>` | :67 |
| `speedLabel` | Label | `Rychlost:` | :44 |
| `speedSlider` | Slider | – | min **0.3**, max **2.5**, value **1** (:87-89). No ticks, default width (~132-140 px) |
| `playPauseButton` | Button | `Play/Pause` | :69 |
| `createButton` | Button | `Vzory` | :63 (opens presets) |
| `resetButton` | Button | `Reset` | :70 |
| `helpButton` | Button | `?` | :71 |
| `debugButton` | Button | `!!!` | :80-82, created only when `debug == true`, **never added to any toolbar** and `setDebugHandler` is never called, so it is **not visible**. The screenshots agree. Leave it out. |
| `descriptions` | TextArea | – | used only when `arrangeScene(as, true)` (2-3 tree) |

### 1.2 Toolbar order (`getStandardToolbarLayout`, :118-135)

1D (BVS, AVL, 2-3):
```
[Prvek:] [text] | [Vložit] [Odstranit] [Najít] | [☐ Krokovat] [<<] [>>] | [Rychlost:] [slider] [Play/Pause] [Vzory] [Reset] [?]
```
2D (Quad):
```
[Prvek:] [text x 50px] [text y 50px] | [Vložit] [Odstranit] [Najít] | [view-switch icon button] | [☐ Krokovat] [<<] [>>] | [Rychlost:] [slider] [Play/Pause] [Vzory] [Reset] [?]
```
`|` = vertical `Separator`. A ToolBar uses ~4 px spacing between items in Modena.

Measured from `avltree_version-2/Bug_screens/innerNodePred.PNG` (window 1016x539 incl. Win8 chrome; scene origin = screenshot (8,30)), in screenshot px:
- Toolbar band y 30–65 (**36 px** high). Top edge line `#DADADA`, body a light vertical gradient `#FAFAFA`→`#F9F9F9`, then `#E8E8E8` for the bottom 4 px, bottom border `#B5B5B5`.
- `Prvek:` label at x≈14; text field 50–198; separator ≈204; `Vložit` 213–258; `Odstranit` 263–328; `Najít` 333–374; separator ≈379; checkbox 388–403 + `Krokovat` 409–455; `<<` 461–494; `>>` 498–531; separator ≈536; `Rychlost:` 545–592; slider track 601–733 (thumb at ~637–650 = value 1.0); `Play/Pause` 741–815; `Vzory` 819–865; `Reset` 869–914; `?` 918–940.
- Buttons: Modena style, about 25 px tall, 1 px border `#B5B5B5`, light grey gradient body (~`#E4E4E4`–`#EFEFEF`), 12 px text, about 8 px horizontal padding.
- In the screenshots the `<<`/`>>` labels look like `< <`/`> >`; that is only font kerning. The strings are `"<<"` and `">>"`.

### 1.3 Scene arrangement (`arrangeScene`, :198-241)
- `BorderPane bp`; `bp.top = toolbar`.
- **1D**: `ScrollPane sp` whose content is `new Group(as.pane)`. The apps set `as.pane` to a `Pane canvas` with `canvas.setPrefSize(4200, 500)` (`Main.java`). `sp.setPannable(true)` means you can drag the canvas with the mouse to pan. Style is `-fx-background-color: transparent; -fx-control-inner-background: transparent;` (:223), which shows the root `#F4F4F4`. `bp.center = sp`.
  - With `addDescriptionArea == true` (2-3 tree only): `descriptions` TextArea at `bp.bottom`, `maxHeight = prefHeight = 50`, not editable (:227-235). The 2-3 Animator writes step descriptions into it.
  - Debug side effect: prints `as.pane.getWidth()` to stdout (:216).
- **2D**: `as.drawPane` is a `DoubleLayerPane` (StackPane with `bottomLayer` Pane and `topLayer` Pane; topLayer style `-fx-background-color: rgba(0,100,100,0.0)`, i.e. transparent; `GP/components/DoubleLayerPane.java:18-25`). Quad uses **bottomLayer = tree view** (Animator) and **topLayer = grid view** (GridView) (`quad-tree/src/application/QTreeController.java:49-50`). Each layer has prefSize 4200 x 500 (`quad-tree/.../Main.java:44-45`).
  - `addPaneToScene` is called for bottom, top, bottom. Each call builds a *new* pannable ScrollPane around `Group(layer)` and puts it in the centre, so the **tree view (bottomLayer) shows first**. These ScrollPanes have no transparent style (line :253 is commented out), so the viewport uses the default Modena inner background (white `#FFFFFF`; inferred, no screenshot).
  - The view switch handler (:258-270) runs after the button's own icon toggle. If the button now shows the tree icon it displays the grid (topLayer), otherwise the tree (bottomLayer). Every switch creates a new ScrollPane, so the **horizontal scroll resets to 0** (left edge) after a switch. Only the last-created ScrollPane was centred.
- `centerifyScrollPane()` → `sp.setHvalue(0.5)` (:272-274), called by every app after `stage.show()`.
- **Horizontal centring arithmetic** (checked against the screenshot): viewport ≈ 983 px wide (1000 − 2 px border − 15 px vertical scrollbar), so scroll offset = (4200 − 983) × 0.5 ≈ 1608 and canvas x 2100 is at the viewport centre. Both scrollbars are visible: canvas height 500 > viewport height ≈ 450.
- Mouse wheel: the default ScrollPane behaviour (vertical scroll). The shared `ZoomHandler` and `HorizontalScrollMouseWheelHandler` (§7) are **not attached by any app**.

### 1.4 Wiring (`setHandlers`, :276-415; called from `setController`)

| Control | Action |
|---|---|
| Vložit | 1D `controller.insert(Integer.parseInt(text))`; 2D `controller.insert(getInputValue2D())` |
| Odstranit | `controller.remove(...)` |
| Najít | `controller.search(...)` |
| Vzory | `controller.showPresets()` |
| Krokovat (checkbox) | on change: `controller.setStepping(newValue)`, which calls `AnimationControl.markAsStepping(b)` |
| `>>` | `controller.nextStep()`, which calls `ac.goForth()` |
| `<<` | `controller.prevStep()`, which calls `ac.goBack()` |
| Play/Pause | `controller.playPause()`, which calls `ac.togglePlaying()` |
| Slider | on every value change (also *while dragging*): `controller.setRate(value)`, which calls `ac.setRate(value)`. This also applies to the running transition |
| Reset | `controller.reset()` |
| ? | `HTMLDialog.show("Nápověda", controller.provideHelp(), Icon.INFORMATION, Buttons.OK, 600, 300)` (:410) |

Speed mapping: rate r ∈ [0.3, 2.5]. Duration = base / r. Example for the 1000 ms move: 3333 ms at 0.3, 1000 ms at 1.0, 400 ms at 2.5. The slider is linear in rate.

### 1.5 Input parsing & error messages (verbatim)
1D: `Integer.parseInt(elementText.getText())` (:99-104). It accepts optional sign and digits only. Empty input, spaces, decimals or letters raise NumberFormatException.

2D (`getInputValue2D`, :106-116): `Double.parseDouble` on both fields. If either value is < 0 or > 100 it throws `OutOfRangeException("Jedna či více ze zadaných hodnot leží mimo rozsah (0-100)")`. The range is inclusive 0..100.

All errors are shown with `HTMLDialog.show(title, html, Dialog.Icon.ERROR, Dialog.Buttons.OK, 400, 150)`:

| Trigger | Title | HTML body (verbatim) |
|---|---|---|
| insert: DuplicateException | `Prvek nelze vložit` | `Tento prvek již ve struktuře <b> existuje </b>.` |
| insert: bad number | `Prvek nelze vložit` | `Špatný formát vkládaného prvku <b> (není celým číslem) </b>.` |
| insert: out of range (2D) | `Prvek nelze vložit` | `Jedna či více ze zadaných hodnot leží mimo rozsah (0-100)</b>.` (stray `</b>`; it renders as plain text plus ".") |
| remove: bad number | `Prvek nelze odstranit` | `Špatný formát odstraňovaného prvku <b> (není celým číslem) </b>.` |
| remove: out of range | `Prvek nelze odstranit` | `…mimo rozsah (0-100)</b>.` |
| search: bad number | `Prvek nelze nalézt` | `Špatný formát hledaného prvku <b> (není celým číslem) </b>.` |
| search: out of range | `Prvek nelze nalézt` | `…mimo rozsah (0-100)</b>.` |

Notes:
- In 2D the "bad number" text still says "(není celým číslem)" ("is not a whole number"), although decimals are accepted.
- The quad tree is the only app that throws `DuplicateException`, with message `"Prvek [x,y] je již ve struktuře obsažen"`. CommonControls shows its own fixed duplicate text, not this message. BVS/AVL/2-3 catch duplicates internally, so a duplicate insert shows **no dialog** and does nothing (the AVL app prints the message to stderr).
- The shared Validation key handlers (`NumberValidationHandler`, `LetterValidationHandler`) are commented out (:72-77), so the text fields accept any typing.

### 1.6 Controller interface (`GP/components/Controller.java`)
```
showPresets(); build(ArrayList<T>); insert(T) throws DuplicateException; nextStep(); playPause();
prevStep(); remove(T); search(T); reset(); setStepping(Boolean); setRate(double); String provideHelp();
```
`T` is Integer for BVS/AVL/2-3 and Point2D for Quad.

---

## 2. Dialogs (`MC/utils/dialogs/*`)

### 2.1 Base dialog (`Dialog.java`)
- Default size `WIDTH = 400`, `HEIGHT = 150` (:37-41). This is the **window** size including the title bar.
- Background `Color.WHITESMOKE #F5F5F5` (:45).
- `StageStyle.UTILITY` (small title bar, close button only), `APPLICATION_MODAL`, not resizable (:204-224). If the dialog is closed without a result, the result is `CANCEL`.
- Layout (`doLayout`, :234-256): BorderPane.
  - **Left**: StackPane with the 48 x 48 icon, centred, width fixed **88 px** (48 + 40).
  - **Centre**: `VBox(5)` aligned CENTER_LEFT holding a wrapping Label(message). Margin top 5, right 20, bottom 10, left 0.
  - **Bottom**: buttons `HBox(10)` aligned **CENTER_RIGHT**, padding top 10, right 20, bottom 10, left 10 (:314-319).
- Button labels (verbatim): `OK`, `Storno` (cancel), `Ano` (yes), `Ne` (no). The `Buttons` sets are OK / OK_CANCEL / YES_NO / YES_NO_CANCEL.
- Icons (enum `Icon`, :66-82): INFORMATION `info48.png`, WARNING `warning48.png`, ERROR `error48.png`, QUESTION `confirm48.png`.
- Keyboard (:258-274): **Enter** = OK and close (subject to validator); **Escape** = cancel and close.
- Other variants exist but are unused by the apps: input dialog (TextField under the message), custom-buttons dialog, custom-content dialog. `Dialog.showQuestion` uses OK_CANCEL despite its doc comment.

### 2.2 HTMLDialog (`HTMLDialog.java`), used for errors and help
1. Creates a CustomContentDialog (base dialog with `centerVBox` content replaced) of the given width/height, initially showing an indeterminate `ProgressIndicator`. It is shown **without waiting** (`showDialogNoWait`) but is still application-modal.
2. Builds a `WebView`, sets `disable(true)` (no interaction, no scrolling, no text selection), blend mode `DARKEN` (the white page becomes the `#F5F5F5` dialog background), LCD font smoothing, prefSize = (width, height). It loads the HTML string and swaps it into the centre.

For web, render: a fixed-size modal box (400x150 for errors, 600x300 for help) with background `#F5F5F5`. Left: a 88 px column with a centred 48 px icon. Centre: the HTML fragment (`<b>`, `<br>` only) in the WebView default font (WebKit default serif, about 16 px; unconfirmed, no screenshot of a dialog). Bottom-right: a single `OK` button. The content does not scroll; overflow is clipped. Enter/Esc close the dialog.

### 2.3 Help texts (`provideHelp()`, per app; verbatim HTML)
There is no shared help text. Each app supplies its own:
- BVS (`bvs/src/application/BSTController.java:177-182`):
  `<b>Binární vyhledávací strom (BVS) </b> <br> <br>Je binární strom, pro jehož každý vrchol "x", charakterizovaný klíčem K platí, že hodnota klíče vrcholu levého podstromu (tzn. levého potomka vrcholu "x") je menší než K a současně hodnota klíče vrcholu pravého podstromu (tzn. pravého potomka vrcholu "x") je větší než hodnota klíče K. <br>Toto uspořádání umožňuje efektivní procházení stromu postupným porovnáváním hledané hodnoty s  hodnoty klíči vrcholu a postupným traverzováním do levého či pravého podstromu až ke hledanému klíči nebo listům stromu. <br>`
- AVL (`AVLController.java:209-214`):
  `<b>AVL (Adelson-Velskij, Landis) strom </b> <br><br>je binární vyhledávací strom rozšířený o samovyvažovací mechanismus, který zabraňuje degeneraci struktury.<br>Vyvážení stromu je dosaženo pomocí tzv. rotací, kdy jsou jednotlivé podstromy přesouvány tak, aby bylo dosaženo stavu, <br> kdy se délka nejdelší větve levého a pravého podstromu každého uzlu se liší nejvýše o 1 .`
- Quad (`QTreeController.java:207-212`):
  `<b>Quad Strom</b> <br> <br>Je stromová struktura, ve který každý vnitřní vrchol má právě 4 potomky. Motivací využití této struktury je dělení dvoudimenzionálních dat do čtyř kvadrantů.<br>V případě vizualizace můžeme Quad strom znázornit jak plošným zobrazením, na kterém jsou zřetelně vidět oddělené jednotlivé regiony, tak hierarchickým (stromovým), jenž přináší pohled na hierarchickou reprezentaci jednotlivých oblastí.<br><br><br>Tato implementace pracuje s rozsahem x a y souřadnic 0 - 100. `
- 2-3 (`TwoThreeTreeController.java:166-171`):
  `<b> 2-3 strom </b> <br> <br>Je dokonale vyvážený strom (tzn. všechny jeho listy leží ve stejné hloubce). <br>· Každý uzel má buď jednu nebo dvě klíčové položky. <br> V případě jediného klíče má dva potomky, v případě dvou klíčů právě tři potomky (samozřejmě tehdy, pokud se jedná o vnitřní uzel).`

### 2.4 PresetsDialog ("Vzory"; `PresetsDialog.java`)
- Size **500 x 300** (:32-36); background `Color.LIGHTYELLOW #FFFFE0` (:63). Note: this is yellow, unlike the WHITESMOKE of the other dialogs.
- UTILITY, modal, not resizable. Window title = first constructor argument: `"Vytvorit strukturu"` (no diacritics) in BVS, AVL and 2-3; `"Vytvořit strukturu"` in Quad.
- Left: 88 px column with `confirm48.png` (blue question-mark disc).
- Centre VBox (spacing 5, CENTER_LEFT, margin top 20, right 20, bottom 10, left 0), top to bottom:
  1. Label `Sady:`
  2. ComboBox of preset items, showing `toString()` (the preset name), width min = pref = **100 px**. The **first item is preselected** (:101).
  3. Label `Vkládané prvky:` (default third ctor arg; :85), with `padding-top: 10px`.
  4. Wrapping Label with the selected preset's items joined by `", "`, with `padding-bottom: 10px`. It updates when the combo selection changes. Quad items are JavaFX `Point2D.toString()`, which renders as `Point2D [x = 60.0, y = 40.0], Point2D [x = 10.0, y = 20.0], …`.
  5. CheckBox `animovat` ("animate"). It sets `animate`, but **no app reads `runAnimation()`**, so it has no effect. Builds are always animated at rate 10 (§5.5).
- Bottom: buttons `OK`, `Storno` (right-aligned, as in the base dialog). Enter = OK, Esc = cancel.
- Flow in the apps: `if (dlg.showDialog() == Result.OK) controller.build(Arrays.asList(dlg.getSelectedPresetItems()))`.
- Data contract: `Preset<V,P>.getAll(): ArrayList<P>` and `PresetItem<V>.getItems(): V[]` + `toString()` = name.
- Preset contents (for reference):
  - BVS & AVL: `Sada 1` = 50,100,20,80,10,40,120; `Sada 2` = 20,10,40,5,15,35,60,30,37,50,80; `Sada 3` = 60,40,50,70,80,35; `Degradovaný strom` = 10,20,30,40,50.
  - 2-3: `Sada 1` = 50,100,20,80,10,40,120; `Sada 2` = 50,100,80,75,120; `Sada 3` = 10,20,30,40,50; `Sada 4` = 50,100,20,90,5,120.
  - Quad: `Sada 1` = (60,40),(10,20),(30,70),(80,80); `Sada 2` = (40,40),(10,10),(30,70),(80,80); `Sada 3` = (60,60),(10,10),(30,70),(80,20); `Sada 4` = (60,40),(5,22),(10,80),(60,60).

### 2.5 ProgressDialog (`ProgressDialog.java`), unused by the apps
Title `Načítám...`, 200 x 30, WHITESMOKE background, a full-size `ProgressBar`. The user cannot close it (close request consumed). Progress = (total − remaining) / total.

---

## 3. Graphics elements (`MC/graphics/*`)

All are JavaFX `Parent`s positioned only through **translateX/translateY** (top-left corner of the element in canvas coordinates). Connection points are DoubleProperties bound to translate, so lines follow animated nodes automatically. For the web version, derive line endpoints from the node positions every frame.

### 3.1 `Element` (abstract; `Element.java`)
- `int id` (the apps use the key value as id for BVS/AVL).
- `Map<Integer, LineElement> connectors`: `addConnector(other, line)` registers the line symmetrically, `removeConnector`, `isConnectedWith`. Only the 2-3 example code uses these. The production apps keep lines inside the node (§3.4).

### 3.2 `NodeElement` (single connection point; `NodeElement.java`)
- Constructor `(x, y, width, height, id)` sets translate to (x, y). The connect point is the centre: `(x + width/2, y + height/2)`, with **integer division** of width/height (:74-77).
- Anchor variant: `(anchor, dx, dy, w, h, id)` binds the translate to the anchor's translate + rounded offset, so the node moves with the anchor. `removeAnchorNode()` unbinds.
- Not used by the production apps (only the examples).

### 3.3 `BranchNodeElement` (multi-child; `BranchNodeElement.java`)
- Constructor `(id, maxChildren, keyWidth (=fieldWidth), height)`.
- **Child connector i** (i = 0..maxChildren−1) = `(translateX + i * fieldWidth, translateY + height)` (:67-86). These are points on the **bottom edge**, at multiples of the field width starting at the left corner.
  - Binary (`BinaryNodeElement`, maxChildren 2, `:8-26`), fieldWidth 30: left = bottom-left corner (x+0), right = bottom-right corner (x+30). Getters: `getLeftChildConnector()` (i=0) and `getRightChildConnector()` (i=1).
  - 2-3 (`AbstractTwoThreeTreeElement`, app-side, maxChildren 3): x+0, x+kw, x+2kw, i.e. the left corner, the divider between the two key fields, and the right corner.
  - Quad (`AbstractQuadNodeElement`, app-side, maxChildren 4, order NW, NE, SW, SE): x + 0, 1, 2, 3 × kw.
- **Parent connector** (`connectX/YProperty` = `centerX/centerY`) is *not* bound by the base class. Subclasses bind it in `doParentBindings()`. BVS/AVL (and `ExampleBranchNode`) use `centerX = translateX + rect.width/2`, `centerY = translateY + 1` (`bvs/.../BSTNodeWithLine.java:84-90`), so incoming lines end at **top-centre, 1 px below the top edge**.

### 3.4 `BinaryNodeWithLine` (`BinaryNodeWithLine.java`)
- Extends BinaryNodeElement and owns two `LineElement`s: `lineToChild[0]` (LEFT) and `[1]` (RIGHT) (:8-16).
- Initially line[0] runs left connector → right connector and line[1] runs right → left, so each is a degenerate segment along the bottom edge. Both start **invisible** (`setVisible(false)`).
- The apps later call `getChildLine(NodePosition.LEFT|RIGHT).setEnd(childNode)`, so the line goes from the parent's bottom-left or bottom-right corner to the child's top-centre. Line visibility and opacity are animated by the apps (fade 0↔1, 200 ms).
- The lines are separate nodes that the apps add to the **canvas** (not as children of the node). They are added *before* the node, so they are drawn **below** nodes.
- `NodePosition` enum: `LEFT, RIGHT`.

### 3.5 `LineElement` (`LineElement.java`)
- Wraps one `javafx.scene.shape.Line`. Start binds to `start.connectX/Y`, end binds to `end.connectX/Y`. `setStart`/`setEnd` rebind live. They throw IllegalArgumentException if the argument is null or equals the other end.
- Default look = JavaFX Line defaults: **stroke BLACK `#000000`, strokeWidth 1.0, butt caps, no arrowheads**, antialiased.
- `setLineColor(Color)` sets the stroke. `LineBuilder` (`LineBuilder.java`) offers `getLine` (black), `getBlueLine` (`BLUE #0000FF`), `getRedLine` (`RED #FF0000`) and `getColoredLine`. Blue and red are used only in the apps' `testing/LayoutTest.java`.

### 3.6 Concrete BVS/AVL node (app-side, but it defines the shared look; `bvs/.../BSTNodeWithLine.java`, `avltree_version-2/.../AVLNodeWithLine.java`, identical)
- `KEYWIDTH = 30`, `HEIGHT = 15` (equal to the TreeLayoutSettings widthNode/heightNode).
- A StackPane containing a `Rectangle(30, 15)` and a `Text(String.valueOf(id))`. StackPane centres the text in both axes. Text uses the default font (System 12 px; black).
- Rectangle: `strokeType INSIDE`, stroke `BLACK`, strokeWidth 1 (default), fill `YELLOW #FFFF00`. Measured in the screenshot: exactly 30 x 15 px with a 1 px black border inside.
- `setSuccessColor()` sets fill `LIGHTGREEN #90EE90`; `setFailColor()` sets fill `LIGHTPINK #FFB6C1`. These are used on the moving search node at the end of a search.
- `setText(s)` replaces the label. The apps use it on the moving "animation node" for comparison text such as `"40<50"`. Longer text overflows the 30 px box, centred.
- Known bug: `setPosition(p)` calls `setTranslateX(p.x)` and then `setTranslateX(p.y)` (y written into x). It is only called with (0,0), so it has no effect in practice.

### 3.7 `RotationDirectionElement` (`RotationDirectionElement.java`), used by AVL rotations
- Constructor `(x, y, width, height, isLeft, color = BLACK)`; it translates to (x, y).
- Path 1: `MoveTo(0, h)`, `QuadCurveTo(ctrl = (w/2, 0), end = (w, h))`, an upward arc. No fill, stroke = color (default black), width 1.
- Path 2 (arrowhead, a 10 px L-shaped polyline, no fill):
  - left (`isLeft = true`): `(0, h−10) → (0, h) → (10, h)`, an arrow tip at the **left** end of the arc.
  - right: `(w−10, h) → (w, h) → (w, h−10)`, a tip at the **right** end.
- `setColor()` only stores the colour and does not restyle the existing paths (bug). Use the constructor colour.
- AVL use (`avltree_version-2/.../Animator.java:779-790`): `new RotationDirectionElement(30, 15, isLeftRotation)`, placed at **(parentOfRotatedSubtree.x, parent.y + 15)**, i.e. directly under the parent's box. It starts with opacity 0 and invisible. The step plays two parallel 2 s fades on it (0→1 and 1→0); the later one wins, so it effectively fades from 1 to 0 over 2 s. On finish it is hidden again.

### 3.8 `IGraphics`
`DEFAULT_FONT_SIZE = Font.getDefault().getSize()` (12 at 96 DPI), `PLATFORM_SCALE = DEFAULT_FONT_SIZE / 12.0`. Unused by the apps.

### 3.9 Highlight states (summary)

| State | Visual | Where |
|---|---|---|
| normal node | fill `#FFFF00`, black 1 px inside border | BVS/AVL |
| search found | fill `#90EE90` (LIGHTGREEN) | moving search node |
| search not found | fill `#FFB6C1` (LIGHTPINK) | moving search node |
| `AnimationSettings` defaults (not read by any app) | node 50x20, duration 200 ms, background YELLOW `#FFFF00`, foreground BLACK `#000000`, success GREEN `#008000`, fail RED `#FF0000`, highlight ROYALBLUE `#4169E1`, bounds 1000x400 | `GP/components/AnimationSettings.java:29-41` |

The apps never read the colour or size fields of `AnimationSettings`. They only use `as.pane` / `as.drawPane`. The real colours are the hard-coded ones in the node classes above.

---

## 4. Layout managers (`MC/layoutManager/*`)

### 4.1 Settings (`TreeLayoutSettings.java`). The names are misleading.
`new TreeLayoutSettings(horizontalSpace, verticalSpace, widthNode, heightNode)` with `paddingTop = 15` by default (:14-16). There is also a 5-argument variant with an explicit paddingTop.
- `horizontalSpace` is actually the **vertical gap between levels** (used in Y).
- `verticalSpace` is actually the **horizontal gap between sibling slots** (used in X).

| App | ctor args (h, v, w, hgt) | Meaning |
|---|---|---|
| BVS, AVL | (20, 20, 30, 15) | level gap 20, column gap 20, node 30x15, paddingTop 15 |
| 2-3 (own copy of the classes) | (40, 40, 30, 15) | |
| Quad (own copy) | (30, 20, 48, 50) | |

Only BVS and AVL use the shared `cz.commons.layoutManager` manager. Quad and 2-3 ship their own forked layout managers under `cz.commons.quadtree.*` and `cz.commons.twothreetree.*` (documented by the respective app specs). They reuse only `cz.commons.graphics.*`.

### 4.2 Data model
- `DepthManager` holds a list of `DepthRow`. Row k (0-based) has `2^k` slots (`DepthRowNode{elementId?, point}`), i.e. a complete-binary-tree slot grid (`DepthRow.java:16-21`, `BinaryTreeHelper.getCountElements(depth1based) = 2^(d−1)`).
- `ElementInfo{element, depth (0-based), indexAtRow, idParent}`. Left child index = 2·i, right = 2·i+1 (`BinaryTreeHelper.java:33-39`).
- `CanvasRangeInfo(centerX = (int) canvas.getWidth() / 2)` is captured **once, at manager construction** (`BinaryTreeLayoutManager.java:31`). The apps construct the manager after `stage.show()` with a 4200 px canvas, so **centerX = 2100**. The screenshot confirms this.
- Y of a 1-based depth d: `getDepthYPosition(d) = paddingTop + (d−1)·heightNode + (d−1)·horizontalSpace` (`BinaryTreeHelper.java:28-31`). For BVS/AVL: **y = 15 + 35·k** for 0-based depth k, giving 15, 50, 85, 120, …
- `addElement(el, idParent, isLeft, insertToCanvas=true)` (:61-94): depth = parent.depth+1 (or 0 for the root). A new row is added if depth > maxDepth−1 **or depth == 0**. The element id goes into the slot, `layoutChange.addElement()` is called, and the element is added to the canvas.
- `removeElement(id, removeFromCanvas)` (:102-124) refuses (returns false) if the slot still has a child. Otherwise it clears the slot and calls `layoutChange.removeElement()`.
- `swapElement(a, b)` swaps two elements' slots and fixes parent pointers of their children (used for the in-order-successor swap on delete).
- `getNodePosition(id)` returns the slot's point (top-left of the node).
- Every position change of an *occupied* slot posts a `MoveElementEvent(id, oldPoint, newPoint)` on the DepthManager's Guava EventBus. The apps subscribe to it, collect the events, and turn them into one ParallelTransition of TranslateTransitions (default 400 ms JavaFX duration in `moveElementsWhileLayoutChanges`, because no duration is set; see §5.6).

Two position strategies are available (`PositionsChange` enum). BVS and AVL use **`CALC_ONLY_INSERTED_NODES`** for the live tree (`bvs/.../Animator.java:60`, `avltree_version-2/.../Animator.java:72`). The default `CALC_ALL_POINTS` is only used in the unused `Animator.clear()` method.

### 4.3 `LayoutNodesPositionInsertedNodes` (the one actually used; in-order columns)
Recalculated on every add, remove and refresh (`LayoutNodesPositionInsertedNodes.java:51-80`):
1. `TreeToList` walks the slot grid from the root and builds the **in-order list** of occupied nodes. It also returns `r` = the in-order index of the root (`TreeToList.java:25-55`).
2. `colSize = verticalSpace + widthNode` (50 for BVS/AVL); `space = verticalSpace / 2` (**integer division**, 10). With cx = 2100 and in-order index i:
   - i == r: `x = cx − colSize/2 + space` = cx − 15 (the root box is exactly centred on cx)
   - i < r: `x = cx − colSize/2 − (r−i)·colSize − space` = cx − 35 − 50·(r−i)
   - i > r: `x = cx + colSize/2 + (i−r−1)·colSize + space` = cx + 35 + 50·(i−r−1)
   - `y = getDepthYPosition(depth+1)` = 15 + 35·depth.
   - So the pitch is 50 px everywhere **except between the root's left neighbour and the root, where it is 70 px**. The root has a 40 px gap on its left and a 20 px gap on its right. The screenshot confirms this: 15 at x 417, 20 at 487, 25 at 537.
3. A MoveElementEvent is posted only if the **x** changed and the old x was non-zero (so freshly placed nodes at (0,0) don't emit events). Pure y changes don't emit events. Events are suppressed while the RepairmanLayoutManager runs (§4.5).
4. Empty slots are reset to (0,0).

**Worked example** (BVS/AVL settings, cx = 2100). Tree: root 20, children 10/30, grandchildren 5,15,25,35. In-order: 5,10,15,20,25,30,35 (r = 3).

| key | depth | in-order i | x (top-left) | y (top) | box spans x | centre x |
|---|---|---|---|---|---|---|
| 5 | 2 | 0 | 2100−35−150 = **1915** | **85** | 1915–1945 | 1930 |
| 10 | 1 | 1 | 2100−35−100 = **1965** | **50** | 1965–1995 | 1980 |
| 15 | 2 | 2 | 2100−35−50 = **2015** | **85** | 2015–2045 | 2030 |
| 20 | 0 | 3 | **2085** | **15** | 2085–2115 | 2100 |
| 25 | 2 | 4 | 2100+35 = **2135** | **85** | 2135–2165 | 2150 |
| 30 | 1 | 5 | **2185** | **50** | 2185–2215 | 2200 |
| 35 | 2 | 6 | **2235** | **85** | 2235–2265 | 2250 |

Lines in this example:
- 20→10: from (2085, 30) (bottom-left of 20) to (1980, 51) (top-centre of 10 + 1).
- 20→30: from (2115, 30) to (2200, 51).
- 10→5: (1965, 65) → (1930, 86).
- 10→15: (1995, 65) → (2030, 86).
- 30→25: (2185, 65) → (2150, 86).
- 30→35: (2215, 65) → (2250, 86).

Converting canvas to screenshot px: screen_x ≈ canvas_x − 1607 + 9, screen_y ≈ canvas_y + 68. For example, root 20 at canvas x 2085 shows at screenshot x 487, y 83.

### 4.4 `LayoutNodesPositionDefault` (`CALC_ALL_POINTS`; complete-tree slots), documented for completeness
Each slot has a fixed position derived from a complete binary tree of the current height H (rows 1..H, 1-based):
- `setMaxWith(H)`: rowWidth(H) = 2^(H−1)·W + (2^(H−1)−1)·vSpace; half = rowWidth/2 (integer); minX = cx − half; maxX = cx + half.
- **addRow** (new depth H): the last row's slots are spaced evenly from minX: `x_i = minX + i·(W + vSpace)`, y = depthY(H). Then rows 1..H−2 (0-based index; **row 0 = root is never recalculated**, it stays at cx − W/2) are recalculated:
  - `maxDepthSize = 2^(H−1)`; `minimalOffset = (maxX − minX) / maxDepthSize` (double); `offsetMultiple = maxDepthSize / rowSize` (int).
  - x starts at `minX − W/2` (int). For slot 0 add `(offsetMultiple/2 integer)·minimalOffset`; for each following slot add `offsetMultiple·minimalOffset`.
- **removeElement**: if the last row became empty, it is dropped. The new last row is respaced evenly (as in addRow), then rows 1..last−1 are recalculated as above.
- `addElement` does nothing here; `refresh()` throws UnsupportedOperationException.
- Worked example (same settings, insertion order 20,10,30,5,15,25,35):
  - after root: row width 30, root x = 2085, y 15
  - after depth 2: row width 80 (minX 2060): 10 → 2060, 30 → 2110 (y 50)
  - after depth 3: row width 180, minX 2010, maxX 2190: grandchildren 5 → 2010, 15 → 2060, 25 → 2110, 35 → 2160 (y 85). Row 1 is recalculated with minimalOffset = 45, start 1995: 10 → 2040, 30 → 2130 (MoveElementEvents emitted).
  - Root stays at 2085.

### 4.5 `RepairmanLayoutManager` (rebuild after rotations / complex changes; `RepairmanLayoutManager.java`)
Input: a subtree description `ITreeStructure` (`TreeStructure{id, idParent, isLeftChild, left, right}`). It is iterated **breadth-first** (`TreeStructureIterator`).
1. Record the old points of all ids in the structure and clear their slots.
2. For each node (BFS order): parent slot = the parent's ElementInfo (or depth 0/index 0 for the root). depth = 0 if root, else parentDepth+1; indexAtRow = 2·pIdx (left) or 2·pIdx+1. Rows are added on demand. The id is written into the slot.
3. Run `layoutChange.refresh()` with event generation disabled. For BVS/AVL this is the in-order recalculation of §4.3.
4. Return a `MoveElementEvent(id, old, new)` for every structure id not in `ignoresMovingIds`. Then drop the last row if it is empty.

The AVL app converts these events into a ParallelTransition of 1000 ms moves (`AnimationTools.moveTransition`).

`RemoverFromLayoutManager` ("USE AT YOUR OWN RISK") removes an id from the map and slot without any checks.

### 4.6 Helpers
- `WorkBinaryNodeInfoBuilder.getWorkInfo(id, manager)` returns a snapshot `{current, parent, leftChild, rightChild}` (copied ElementInfos). Used for swap and delete bookkeeping.
- `ListTreeInfo`, `ILayoutChange` (`addRow`, `addElement`, `removeElement`, `refresh`, `enable/disableGenerateEvent`), `ITreeLayoutManager`.

---

## 5. Animation infrastructure (`MC/animation/*`, `MC/utils/FadesTransitionBuilder.java`, `MC/utils/transitions/*`)

### 5.1 Model
`AnimationControl` (`AnimationControl.java`) holds `ArrayList<Transition> transitions` (the **steps**) and an index `nextTransition` (the next step to play forward). Each operation (insert, remove, search, build) works like this:
1. The controller posts `InitAnimationEvent`, and the Animator calls `ac.clear()`: index 0, list emptied, current transition forgotten. **The step history of the previous operation is discarded.** A still-running previous transition is *not* stopped (quirk; a re-implementation should finish or cancel it first).
2. The algorithm emits domain events. The Animator appends **one `Transition` per step** to `ac.getTransitions()`. A step is usually a `ParallelTransition` of leaf transitions; AVL rotations use a `SequentialTransition` as a single step.
3. The controller calls `ac.playForward()`.

One list element = one step for `<<`/`>>`. The granularity is chosen by the apps.

### 5.2 Playback rules

| Call | Precondition | Behaviour |
|---|---|---|
| `playForward()` | index < size | Play `transitions[index]` with rate `+rate`. On finish, index++. **Stepping off**: if more steps remain, play the next one automatically; else fire `TransitionFinishedEvent(END)`. **Stepping on**: stop and fire `(NONE)` if more steps remain, else `(END)`. |
| `goForth()` (`>>`) | list non-empty, nothing running, index ≠ size | `playForward()`: plays one step when stepping, or resumes the automatic chain when not stepping |
| `goBack()` (`<<`) | a transition has been played at least once since clear, nothing running | Play `transitions[index−1]` **in reverse** (rate `−rate`). On finish, index−−. **Stepping on**: stop and fire `(NONE)` or `(START)` at the beginning. **Stepping off**: keep reversing automatically to index 0, then fire `(START)`. So `<<` without Krokovat rewinds the whole operation. |
| `togglePlaying()` (Play/Pause) | – | If the current transition is running, pause it; else, if one exists, `play()` it (resume). Quirk: after the last step has finished, this replays the last step from its start and pushes the index past the end. |
| `setRate(r)` | – | Store r. If a transition is running, immediately set its rate to ±r (keeping the direction). |
| `markAsStepping(b)` | – | Toggle step mode (the Krokovat checkbox). It takes effect at the next step boundary. |
| `isNextTransition()` / `isPreviousTransition()` | – | Computed from index, adjusted ±1 if a transition is running. "previous" also requires `size > 1`. |

`TransitionEndPositionType`: START / END / NONE. `MovingType`: BACK (−1) / FORWARD (+1).

Reverse playback in JavaFX: setting a negative rate on a finished (or paused) animation plays it backwards from its current time to 0. Every leaf transition with explicit from/to values reverts visually: positions move back and fades invert. Discrete side effects done in `onFinished` handlers are **not** undone, unless the handler is a `StepEventHandler` (§5.4).

### 5.3 Pre-play visibility fix (`AnimationsHelper.setNodesToVisible`, `AnimationsHelper.java:32-63`)
Immediately before **every** play (forward or back), the helper walks the step's children recursively through Parallel/Sequential transitions:
- `ScaleTransition`: set the node's scaleX/Y to 0 and make it visible.
- `TranslateTransition`, `FadeTransition`, `StrokeTransition`: make the target visible.

It looks only at **children** of a Parallel/Sequential step. A bare FadeTransition used as a step gets no visibility fix. That is why the apps wrap single fades in `new ParallelTransition(fade)`. Nodes created hidden (`setVisible(false)`) appear exactly when the step animating them starts.

### 5.4 Direction-aware finish handlers
- `StepEventHandler` (abstract, `StepEventHandler.java`) implements `EventHandler<ActionEvent>` + `StepDirection` and dispatches to `handleForward(e)` or `handleBack(e)`.
- Before each play, `AnimationsHelper.controlAndSetEndHandlerDirections(step, movingType)` sets the direction on the step's own `onFinished` handler and on every nested child's handler (recursively) that implements `StepDirection`. That includes the original handler wrapped by `TransitionControl.AnimationEndHandler`.
- `TransitionControl.initHandlers` (`TransitionControl.java:30-42`) wraps the step's existing `onFinished` handler. On finish it first runs the original app handler, then the AnimationControl continuation (index++/−− and chaining).
- JavaFX fires `onFinished` at the end of playback in **both** directions. A plain handler (for example `setSuccessColor()`) also runs again when stepping back. The apps use StepEventHandler subclasses where an undo is needed (for example AVL `SwitchElementEndEventHandler`, `FadesTransitionHandler`).

### 5.5 How the apps use rate for presets
`build()` in BVS, AVL and 2-3: `ac.setRate(10)`, then `ac.addTransitionFinishedListener(type -> ac.setRate(1))`, then `ac.playForward()` (for example `BSTController.java:68-78`). All inserts of the preset are queued as steps of **one** operation and played at 10× speed (move 100 ms, fade 20 ms). When playback finishes the rate snaps to 1.0 **regardless of the slider position**. The listener is never removed, so after the first preset build every later finished animation also resets the rate to 1 (quirk). Quad registers the reset listener but does not set rate 10 (that line is commented out).

### 5.6 Transition builders and easing
- `FadesTransitionBuilder.getTransition(node, duration, from:int, to:int, cycleCount=1)` returns a FadeTransition on opacity (`FadesTransitionBuilder.java:13-25`).
- `RelativeTranslateTransition.build(node, dx, dy, d)` → `toX = currentX + dx` (captured at build time). `build(node, Point2D from, Point2D to, d)` → explicit from/to (`RelativeTranslateTransition.java:23-39`). The AVL/BVS `BuilderAnimMoveNode` uses the from/to variant with 1000 ms.
- `RatedParallelTransition.build(rate)` returns a ParallelTransition with a preset rate (only the 2-3 example uses it).
- Durations actually used (app `utils/AnimationTools.java`): `DURATION = 1000 ms` (moves), `SHORT_DURATION = 200 ms` (fade-in/out of nodes and lines, scale appear/disappear 0↔1), `Duration.ONE = 1 ms` ("immediateHide" of the moving search/insert node). Layout-shift moves built with `TranslateTransitionBuilder` without a duration use the JavaFX default **400 ms**. AVL rotation-arrow fade lasts 2 s.
- Fades go between 0 and 1 (opacity). Scales go between 0 and 1 (scaleX/Y about the node centre). Translates set the translateX/Y of the node's top-left.
- **Easing**: none of the libraries sets an interpolator, so every leaf transition uses `Interpolator.EASE_BOTH`. JavaFX implementation: `t<0.2 ? 3.125·t² : t>0.8 ? −3.125·t² + 6.25·t − 2.125 : 1.25·t − 0.125`. This is constant acceleration over the first 20 % of the time, linear in the middle, and constant deceleration over the last 20 %. Parallel and Sequential containers just schedule children; the effective time scale is the step rate.

### 5.7 Timeline guard
`AnimationsHelper.getTransitionChildren` returns an empty list for anything other than Parallel/Sequential. A `Timeline` step is not scanned (the history mentions "protection before cast Timeline to Transition").

---

## 6. Fonts and icons (`MC/resources/*`)

| File | Size | Look | Used by |
|---|---|---|---|
| `icons/info48.png` | 48x48 | blue disc with white "i" | Dialog Icon.INFORMATION (help dialog) |
| `icons/error48.png` | 48x48 | red octagon with white "!" | Dialog Icon.ERROR (all input errors) |
| `icons/warning48.png` | 48x48 | (warning triangle) | Icon.WARNING (unused by apps) |
| `icons/confirm48.png` | 48x48 | light-blue disc with white "?" | Icon.QUESTION, PresetsDialog |
| `icons/gridview.png` | 16x16 | famfamfam-style yellow grid/table glyph | ViewSwitchButton graphic while the **tree** is shown (the click target is the grid) |
| `icons/treeview.png` | 16x16 | yellow/green org-chart (hierarchy) glyph | ViewSwitchButton graphic while the **grid** is shown |
| `icons/control_play.png`, `control_pause.png`, `help.png`, `information.png` | 16x16 | famfamfam Silk | **not referenced anywhere** |
| `fonts/texgyrecursor-regular.otf`, `texgyrecursor-bold.otf` | – | TeX Gyre Cursor (Courier-like monospace), GUST Font Licence | **not loaded anywhere**. Only `FontManager` hard-codes their metrics (Regular 12: char width 7.2, line height 14.7; Bold 14: 8.4 / 18.886). The apps render with the JavaFX default font. |

Sources (`icons/zdroje.txt`): the 48 px dialog icons come from marcojakob/javafx-ui-sandbox (OpenJFX dialog resources); the rest are famfamfam Silk.

`ViewSwitchButton` (`MC/utils/ViewSwitchButton.java`) is a Button whose graphic starts as **gridView**; each click toggles the graphic between gridView and treeView. `isGridView()` returns true when the graphic is not the treeView icon. Button size ≈ 26x25 px (16 px icon + Modena padding).

---

## 7. Other visual and infrastructure details
- **Backgrounds**: app canvas `#F4F4F4` (Modena `-fx-background`, seen through the transparent ScrollPane); toolbar per §1.2; dialogs `#F5F5F5`; presets dialog `#FFFFE0`; 2D (quad) scroll panes probably white.
- **Scroll pane**: pannable by mouse drag. Both scrollbars are visible in the 1D apps (4200x500 canvas inside a viewport of about 983x450).
- **`ZoomHandler`** (`MC/utils/handlers/ZoomHandler.java`): with Ctrl + wheel, scale the canvas ×1.1 (wheel up) or ×0.9 (wheel down), clamped to 0.1–10, keeping the h/v scroll values. **Not used by any app.**
- **`HorizontalScrollMouseWheelHandler`**: the wheel changes hvalue by ± coefficient (0–1); wheel down scrolls right. **Not used by any app.**
- **`NumberValidationHandler(maxLen)`**: allows only `[0-9.]`, at most one dot, no leading dot, length cap. **`LetterValidationHandler(maxLen, LOWER|UPPER|ALL)`**. Both are unused (commented out in CommonControls).
- **`ControlUtils`**: vertical label and button (one uppercase character per line, 30 px wide, 18 px per character); a labelled BorderPane with `-fx-focus-color: transparent`. Unused.
- **`Generator`**: random int in a range, random a–z string, random "Czech word" by letter frequency. **`GeneratorElementsNumbers.getNextId()`** is a global incrementing id. **`MathUtils`**: distance and line centre. **`StringUtils.getVerticalText`**. All unused by the apps' GUIs.
- **Logging** (`MC/utils/logging/Log.java`): `Logger.getGlobal()` with the level, file handler (`log.txt`) and console handler all set to **OFF**. Format `"%LEVEL%: %message% [%sourceClass% %sourceMethod%]\n"` (`SimpleOneLineFormatter`). The apps log with `System.out/err.println` instead (for example the AVL insert error message and the CommonControls pane-width print). No user-visible log exists. The 2-3 app's description TextArea is the only on-screen text log.
- **`AbstractExample`**: a demo Application with a 600x400 Pane scene. The examples use `TreeLayoutSettings(10,10,25,20)`. Only for demos.
- **Stage**: default decorated window, resizable. Resizing only changes the viewport; the canvas stays 4200x500.

---

## 8. Revision mismatches: app calls vs. the shared copy in thesis2

The bitbucket apps were compiled against a **different (local, unpublished) guiprovider revision**. The AVL `.classpath` references the project `/guiprovider`, not `MT-guiprovider`, plus `/MT-common` and `/MT-common/lib/guava-18.0.jar`.

| # | App call / declaration | Shared copy | Impact |
|---|---|---|---|
| 1 | `BSTController.remove(Integer) **throws Exception**` (`bvs/src/application/BSTController.java:115`), `AVLController.remove(Integer) throws Exception` (`avltree_version-2/src/application/AVLController.java:149`) | `Controller.remove(T value)` declares no checked exception (`GP/components/Controller.java:31`). No commit in the guiprovider history has `throws Exception`. | This **does not compile** against the shared copy. The compiled-against CommonControls must have caught `Exception` in the Odstranit handler. The structures throw `"Prvek není ve stromu obsažen"` (element not in tree) and `"Strom je prázdný"` (tree is empty) (`BinarySearchTree.java:248,254`; `AVLTree.java:248,254`). **Recommendation**: show `HTMLDialog("Prvek nelze odstranit", e.getMessage(), ERROR, OK, 400, 150)` for these. This is inferred; no source exists for that dialog. |
| 2 | (none missing) | All other referenced shared APIs exist with matching signatures. That includes CommonControls ctor, `arrangeScene(as[,bool])`, `setController`, `centerifyScrollPane`, `getDescriptions`, AnimationSettings `pane`/`drawPane`, DoubleLayerPane layers, AnimationControl methods, StepEventHandler, TransitionFinishedEvent/EndPositionType, FadesTransitionBuilder 4-arg, RelativeTranslateTransition Point2D variant, BinaryTreeLayoutManager + PositionsChange, RepairmanLayoutManager, WorkBinaryNodeInfo(Builder), TreeStructure(Integer, boolean), MoveElementEvent, BranchNodeElement/BinaryNodeWithLine, LineElement.setEnd, LineBuilder, RotationDirectionElement(30,15,bool), PresetsDialog(String, Preset), Dialog.Result, Preset/PresetItem and AbstractExample. | – |
| 3 | `debug=true` passed by every app | debug button created, never placed | Nothing to render |
| 4 | Screenshot toolbar | Matches the shared `getStandardToolbarLayout` 1D order exactly, including Reset and `?` (added in commit `93d675a`, 2015-08-01) | The shared toolbar is the authoritative layout |

---

## 9. Screenshot reconciliation (`avltree_version-2/Bug_screens/*.PNG`)
- `innerNodePred.PNG` / `innerNodePo.PNG` / `innerNoderemove35.PNG`: AVL window titled "AVL tree", toolbar exactly as §1.2 (1D, no debug button). The slider thumb sits at about 32 % (value 1.0 of 0.3–2.5).
- Nodes are 30x15 yellow boxes with black borders and centred black 12 px labels. Rows are at 35 px pitch starting at canvas y 15. Columns follow in-order 50 px pitch with the extra 20 px left of the root: in `innerNodePred` the box left x positions are 5:317, 10:367, 15:417, **20:487**, 25:537, 30:587, 35:637, 40:687, 50:737, 60:787, 65:837. This confirms §4.3 with cx = 2100 and the centred scroll.
- Edges start at the parent's bottom-left or bottom-right corner and end at the child's top-centre. They are thin black antialiased lines.
- `innerNoderemove35.PNG` and `innerNode.PNG` show bugs: dangling or missing edges after an inner-node delete. Edges are separate canvas nodes whose visibility and endpoints are managed by the app, so bugs leave stray segments. Do not replicate these.
