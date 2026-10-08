# UI/UX layout review: editor panels (Flowchart first)

Date: 2026-10-27. Requested by the owner: "audit the design, consider the layout for user experience; the
flowchart module has a problem of viewing, check the right and left tools".

**How this was checked:** I read the code (`Editor.tsx`, `Palette.tsx`, `Inspector.tsx`, `ui.tsx`,
`styles.css`, `ErdEditor.tsx`, `backend/templates/flowchart.json`). Claude in Chrome wasn't connected,
so I **didn't see the running app**. The widths below are calculated from the classes, not measured on screen.
No code has been changed.

## The layout today

```
┌ header (wraps to 2 rows when narrow) ───────────────────────────────────┐
├─ Toolbox 212px ─┬──────── canvas (whatever is left) ───────┬─ Inspector 300px ─┤
│ Shapes (17)     │                                         │ nothing selected:  │
│ Arrows (9       │                                         │  "Flowchart" +     │
│  defaults)      │                                         │  help text only    │
│ Icons (long)    │ Controls (bottom-left)   Present (top-r) │                    │
└─────────────────┴─────────────────────────────────────────┴────────────────────┘
```

Both side panels are fixed in width and always open. They hide only in Present mode.

| Screen width (CSS px) | Canvas width | Canvas share |
|---|---|---|
| 1920 | 1408 | 73% |
| 1536 (1920 at Windows 125%) | 1024 | 67% |
| 1366 (common laptop) | 854 | 63% |
| 1280 | 768 | 60% |

## Findings (most serious first)

### F1 · High: both panels are always open and can't be collapsed
`Palette.tsx:172` (`w-[212px] shrink-0`), `Inspector.tsx:62` (`w-[300px] shrink-0`).
The panels take 512px whether you need them or not. A Flowchart is a free canvas with no lanes, so it
needs that room most. **This is the most likely cause of the "viewing" problem.**

### F2 · High: in a Flowchart, the right panel is 300px of help text until you select something
`Inspector.tsx:186-205`. With nothing selected, it shows the template name, the description and a help
paragraph. Flowchart has no zones, so the size and lane editors never appear. Most of the time you
spend drawing, a third of the side space shows static text.

### F3 · High: the left Toolbox is one long scroll, and Icons are at the bottom
`Palette.tsx:174-461`. The order is: Shapes (17 tiles, 6 rows) → Arrows (Draw arrow, hint, line style,
"where arrows cross", arrowheads, 2 crow's-foot selects, animation, speed, colour, dashed) → Icons
(search + every group). You have to scroll past about 900px of arrow settings to reach the icons.
- The Arrows section sets **defaults for new arrows**, and the Inspector repeats almost every one of
  those controls for the selected arrow. **Speed** is in both panels.
- The two sets look the same, but one changes *future* arrows and the other changes *this* arrow. That
  difference isn't labelled clearly ("New arrow animation" is the only hint).

### F4 · High: below 768px the panels stack and the page scrolls past the screen
`max-md:` classes: Toolbox `max-h-[34vh]` + canvas `min-h-[50vh]` + Inspector `max-h-[40vh]` + header
> 124vh. The page scrolls, but the canvas takes the mouse wheel and touch drags. The Inspector ends up
below the canvas, far from the shape you selected. The ERD editor works the same way
(`ErdEditor.tsx:515`, 420px left panel).

### F5 · Medium: no overview of large free diagrams
There is no `<MiniMap>` (only `<Controls>`). On a big Flowchart you can't see where you are, and fit
happens only when the diagram opens (`fitView={fitOnOpen}`) or through the small Controls button.

### F6 · Medium: text below 12px in the panels
- Shape tile labels: 11px (`Palette.tsx:194`)
- Persona labels: 11px (`Palette.tsx:409`)
- Category headings: 11.5px

All three are under the 12px minimum, and they are grey `ink-2` text on white.

### F7 · Low: the header wraps to two rows when the window is narrow
`Editor.tsx:1678` (`flex-wrap`, title `min-w-40 flex-1`). On small laptops a second header row takes
canvas height. This is the header, which the owner said not to change (Present mode decision,
2026-10-15), so I only report it.

### F8 · High (bug, reported by the owner): the page grows taller than the window and scrolls
**Seen:** in the diagram editor, the Toolbox, canvas and right panel reach only partway down the window,
with grey page background below. The toolbar has scrolled out of view.

**Cause:** the Toolbox's Arrows section has 4 screen-reader labels (`<span class="sr-only">`, which is
`position: absolute`) in its line-style, crossing and arrowhead buttons (`Palette.tsx:251-290`). No
ancestor is positioned, so the browser places them against the page itself, not the Toolbox. Their
place is where they'd fall in the Toolbox content, below the bottom of the window. The Toolbox's
`overflow-y: auto` doesn't clip them, because they aren't laid out inside it. So whenever the window is
shorter than the Toolbox content (small window, or zoomed in), the page gets taller than the window and
scrolls.

**Ruled out:**
- The narrow-screen (`max-md:`) layout isn't kicking in by mistake: the panels are side by side.
- Nothing is added to `<body>` outside the layout: no portals or `appendChild`. Exports clone off-screen.
- The `html/body/#root` 100% height chain is intact.

**Measured** with headless Chrome on a minimal copy of the layout (header, 212px Toolbox with the label
about 700px down, canvas). `scrollHeight / innerHeight`:

| Window height | Today | Toolbox `relative` | Editor root guard | Both (staged) |
|---|---|---|---|---|
| 404 | **761** / 404 | 404 / 404 | 404 / 404 | 404 / 404 |
| 604 | **761** / 604 | 604 / 604 | 604 / 604 | 604 / 604 |
| 804 | 804 / 804 | 804 / 804 | 804 / 804 | 804 / 804 |
| 1204 | 1204 / 1204 | 1204 / 1204 | 1204 / 1204 | 1204 / 1204 |

This explains why the bug depends on window size and zoom: it only happens when the window is shorter
than the Toolbox content.

**ERD editor:** not affected. Its `sr-only` labels are inside the canvas, which is `relative`, and the
DBML panel has no absolutely positioned children. It gets the same guard anyway.

**Fix:**
- `relative` on the Toolbox and Inspector scroll containers (the cause).
- `relative md:overflow-hidden` on both editors' root (a guard, so no future child can make the page
  scroll on desktop). Narrow screens keep normal page scrolling.

## Proposed changes

**Status (2026-10-27):** approved. Items 1–5 and F8 are written in `fixes/` (see
[`fixes/README.md`](fixes/README.md), "Editor layout"). Item 6 was dropped: the owner wants stacking kept
on narrow screens. The mini-map is off by default. Previewed in headless Chrome with a fake API, and the
page height equals the window height at every desktop size and zoom tested. Applied to `src/` and the frontend rebuilt
the same day, at the owner's request.

1. **Collapsible panels (F1, F2).** A collapse button on each panel's inner edge folds it to a 44px rail
   with icons. Clicking an icon reopens it. Each panel remembers its open/closed state in the browser.
   Keyboard: `[` toggles the left panel, `]` the right.
2. **Right panel opens when you select something (F2).** In free-layout templates (Flowchart,
   Architecture), the Inspector starts collapsed and opens when you select a shape or arrow. Templates
   with lanes or columns keep it open, because their size and lane tools live there.
3. **Toolbox in tabs (F3):** `Shapes · Icons · Arrows`. The Arrows tab is renamed **"New arrow style"**,
   and Speed is removed from it (it stays in the Inspector). Draw arrow stays at the top of the Toolbox
   where it is always visible.
4. **MiniMap (F5).** Bottom-right, can be turned on or off, hidden in Present mode and in exports.
5. **Text sizes (F6):** labels and headings at 12px minimum.
6. **Narrow screens (F4).** Below 768px the panels open as slide-over drawers on top of the canvas,
   instead of stacking under it. The canvas keeps the full height.

These changes are in the frontend only: no API or database changes. The ERD editor can get items 1, 4
and 6 the same way.

## Questions for the owner

1. **What exactly is the viewing problem in Flowchart?** For example: the canvas is too small, shapes
   are cut off, you can't scroll, or a panel covers something. A screenshot would confirm it.
2. Should I do all of 1–6, or start with 1–3 (panels and Toolbox) only?
3. Item 2: should the right panel open by itself on select (recommended), or only when you click the
   rail?
4. Should the ERD editor get the same collapsible panels?
