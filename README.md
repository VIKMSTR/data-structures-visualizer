# Data Structure Visualizer

Step-by-step animations of **binary search tree**, **AVL tree** and **quadtree** operations —
a rewrite of a 2014 Java/JavaFX master-thesis project (originally deployed as an applet).

Runs in the browser, and as a desktop/mobile app through [Tauri 2](https://tauri.app).

## Stack

| Layer | Tech |
| --- | --- |
| Algorithms | Plain TypeScript, no UI dependencies (`src/lib/core`) |
| UI | Svelte 5 + SVG |
| Build | Vite 8, Lightning CSS |
| Native shell | Tauri 2 (WKWebView / WebView2 / WebKitGTK / Android WebView) |
| Tests | Vitest (core), Playwright on Chromium + WebKit, desktop + mobile (e2e) |

## How it works

Every operation (`insert`, `search`, `remove`, …) runs immediately on the model and records a list of
**steps**. A step is an immutable snapshot of the whole structure plus highlights and a
translatable message. The player only moves an index through that list; the views tween node
positions between consecutive snapshots (nodes keep stable ids, so an AVL rotation animates by itself).

That replaces the original `EventQueue` + hand-built JavaFX transitions, and makes
stepping backwards trivial.

```
src/lib/core/      bst.ts, avl.ts, quadtree.ts, layout.ts, types.ts (Step/Recorder) + *.test.ts
src/lib/i18n/      en.ts, cs.ts
src/lib/player.svelte.ts   playback state (play/pause/step/seek/speed)
src/lib/tween.svelte.ts    rAF-based tweening of keyed sprites
src/lib/ui/        Viewport (pan/zoom/pinch), TreeCanvas, QuadPlane, QuadDiagram, panels
src-tauri/         native shell (no custom Rust code needed)
```

## Commands

```sh
npm ci                 # install (see note on npm below)
npm run dev            # web dev server on http://localhost:5173
npm run build          # static site in dist/ (deploy anywhere, works from a sub-path)
npm run check          # svelte-check + TypeScript
npm test               # unit tests
npm run test:e2e       # Playwright (first time: npx playwright install chromium webkit)

npm run tauri dev      # desktop app with hot reload
npm run tauri build    # release bundles (.app/.dmg on macOS, .msi/.exe on Windows, .deb/.AppImage on Linux)
```

Mobile (needs the platform SDKs, not set up on this machine yet):

```sh
npm run tauri android init && npm run tauri android dev   # Android Studio + SDK/NDK
npm run tauri ios init && npm run tauri ios dev           # full Xcode (not just Command Line Tools)
```

## Webview compatibility

Tauri uses the OS webview, so the oldest engine decides what we may use. Targets:
Safari/WKWebView 15 (macOS 12+, iOS 15+), WebKitGTK ≈ Safari 15 (Linux), Chromium 105+ (WebView2, Android).

Guards in place:

- `tsconfig.json` limits `lib` to **ES2021** — newer built-ins (`Array.prototype.at`, `Object.hasOwn`, …) fail type-checking.
- Vite `build.target` lowers JS syntax for `safari15` / `chrome105`.
- Lightning CSS adds prefixes and lowers newer CSS syntax for the same browserslist targets.
- Animations are done in JS with `requestAnimationFrame` + SVG attributes — no CSS transitions on SVG geometry,
  which behave inconsistently across WebKit ports.
- Pan/zoom uses Pointer Events plus WebKit's non-standard `gesture*` events for trackpad pinch,
  with non-passive listeners so the webview itself never zooms or scrolls.
- No `100vh` (broken on mobile WebKit) — the app shell is `position: fixed; inset: 0` with safe-area padding.
- `localStorage` access is wrapped in try/catch (it can throw in some embedded/private contexts).
- E2E tests run on WebKit and Chromium, desktop and mobile emulation.

## Notes

- **npm 10.9.x** hits an arborist bug (`Cannot read properties of null (reading 'edgesOut')`) when *adding*
  some packages; `npm ci` from the lockfile works. Add new deps with `--legacy-peer-deps` or use npm 11.
- The Tauri `identifier` (`cz.vkrejcir.dsvisualizer`) is a placeholder — change it before publishing.
- Differences from the original Java code: AVL removal is rewritten (the original mishandled the root),
  and the quadtree merges empty quadrants after removal.
