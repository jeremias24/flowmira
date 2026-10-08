# Present mode (full-screen diagram only): review

Date: 2026-10-15. Status: **v2 applied 2026-10-16**. Fixes: [`fixes/README.md`](fixes/README.md#present-mode).

## Request

> "add fullscreen focus on diagram only so i can present it also when needed"

Follow-up, after version 1 was applied:

> "if we have on the Present mode tools must not be show right and left only do not modify header"

So in **version 2** (current), Present mode hides only the left panel (Palette / DBML) and the
right panel (Inspector). The header isn't changed at all: no Present button in it, and it stays
visible while presenting. The Present button moved to the top-right corner of the canvas.
Everything below still applies, except the "only the canvas / covers the window" part.

## What exists today

- Neither editor (`frontend/src/components/Editor.tsx` or `frontend/src/erd/ErdEditor.tsx`) has a
  full-screen or presentation mode. The repo has no Fullscreen API code.
- The canvas always sits between the header, the Palette and the Inspector (or the DBML panel in
  ERDs). Browser F11 hides only the browser's own chrome, not those.
- Editing aids are already tagged for exports: `.no-export` (zone "+" buttons, lane grips, resize
  frame), `.react-flow__handle` (connection dots) and `.react-flow__resize-control`. Present mode
  hides the same things.
- `.exporting` can't be reused because it forces document colours, so a dark theme would flash light.

## Design

- A new shared file `frontend/src/presentation.tsx` has a `usePresentation()` hook and a
  `<PresentBar>` (Fit / Exit), so both editors behave the same.
- **Enter:** a **Present** button in the header, or the **F** key (ignored while typing in a field).
- **On screen:** only the canvas. The wrapper becomes `fixed inset-0 z-50`, and the browser goes
  full screen through the Fullscreen API. If the browser refuses (e.g. inside an iframe), the canvas
  still fills the window. The diagram is fitted to the screen and re-fitted when the screen size changes.
- **Read-only:** nothing can be selected, dragged, connected, deleted, pasted, undone or
  right-clicked. Shapes ignore the pointer, so dragging anywhere pans, scrolling zooms, and
  double-clicking can't open the label editor.
- **Kept:** the theme (light or dark) and the arrow animations.
- **Leave:** Esc, F, or **Exit** in the corner bar. The editor's previous zoom and position come back.
- The corner bar fades out after 2.5 s without mouse movement and comes back when the mouse moves.

## Open questions for the owner

1. Should the mouse cursor hide too when idle? It doesn't now.
2. Should present mode always use light/document colours (like exports), whatever the theme? It
   follows the theme now.
3. Would you like a "step through" mode (zoom to each column/lane in turn with ← →)? Not built yet.
