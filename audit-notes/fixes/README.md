# Fixes

## Encrypted diagram and ERD addresses (applied 2026-11-10)

**Applied 2026-11-10** by Claude at the owner's request ("can you apply the fixes now?"): 15 files copied into the
source; the `FLOWMIRA_ID_KEY` lines added to `docker-compose.prod.yml` and `.env.example` by hand (the rest of those
staged files left out); a generated key added to the local `.env` (not shown anywhere); local-Traefik backend, erd and
frontend rebuilt. Checked on the running stack: both services have the same key and no temporary-key warning,
`/api/diagrams/by-ref/…` exists (401 without sign-in), the served bundle uses it; not yet checked signed in.
**Production needs its own `FLOWMIRA_ID_KEY` in its `.env` before the next deploy** (compose stops without it). Owner: "can you make the last parameter encrypted?
http://127.0.0.1/flowmira/diagram/4". Owner chose server-side encryption (not browser-only scrambling).

`/flowmira/diagram/4` becomes `/flowmira/diagram/rUeXHnlg3RVeL652n-h1fEwlKeqto-xB` (32 characters); ERDs the same
(`/flowmira/erd/…`). The backend encrypts the id with AES-SIV and a key in `.env`:

- Can't be read, guessed or edited: a changed character, a made-up value or a plain number is "not found".
- Always the same for one diagram, so bookmarks and shared links keep working (until the key changes).
- A diagram's address can't open an ERD (the kind is part of the encryption).
- Access is unchanged: the address only finds the diagram; regular users still reach only their own, system owners
  everything, ERDs are system owners only. A link to someone else's diagram says "wasn't found".
- Old number addresses (`/flowmira/diagram/4`) open the home page. Nothing in the database changes; the API keeps
  numeric ids, so `.flowmira` backups and imports are unaffected (backups don't contain the encrypted address).

| File | Change |
|---|---|
| `backend/app/ids.py`, `erd/app/ids.py` (new, identical) | Encrypt / decrypt ids with `FLOWMIRA_ID_KEY` |
| `backend/app/schemas.py`, `erd/app/schemas.py` | `ref` (the encrypted id) on every diagram / ERD the API returns |
| `backend/app/routers/diagrams.py`, `erd/app/routers/erd.py` | `GET /api/diagrams/by-ref/{ref}`, `GET /api/erd/documents/by-ref/{ref}`, same access checks as by id |
| `frontend/src/App.tsx` | Address holds the ref; a refreshed or pasted address is looked up ("Opening…"), or says "wasn't found" |
| `frontend/src/types.ts`, `api.ts`, `erd/types.ts`, `erd/api.ts` | `ref`, the by-ref calls |
| `frontend/src/components/DiagramList.tsx`, `erd/ErdSection.tsx`, `erd/ErdEditor.tsx` | Open with id + ref |
| `docker-compose.prod.yml`, `docker-compose.yml`, `.env.example` | `FLOWMIRA_ID_KEY`, required (compose stops with a clear message if it's missing) |

**The key.** Add `FLOWMIRA_ID_KEY` to `.env` on every installation (local and production), made with
`python3 -c "import base64, os; print(base64.urlsafe_b64encode(os.urandom(64)).decode())"`. Keep it secret and keep it:
a new key changes every address (old bookmarks stop working; no data is affected). The backend and ERD service read the
same variable. Without Compose (dev, tests) a missing key falls back to a temporary one with a warning.

**Applying the compose and `.env.example` changes:** the staged `docker-compose.prod.yml` and `.env.example` also carry
older, unapplied production changes (`traefik-network`, blank `IPC_DB_PASSWORD`, the procedure note). To apply only
this, add the two `FLOWMIRA_ID_KEY` lines after each `DATABASE_URL` line (backend and erd) and the `.env.example` block,
rather than copying those two files. `docker-compose.yml` can be copied as is.

Rebuild backend, erd and frontend (`… up -d --build backend erd frontend`).

Checked on a throwaway copy: encryption checks (deterministic, kind-bound, altered/plain/junk refs rejected, ids up to
2^62); FastAPI test client against both services (11 checks: refs in create/list, by-ref, altered ref 404, plain number
404, another user's diagram 404, owner sees it, numeric API unchanged, ERD by-ref, diagram ref doesn't open an ERD);
`erd/tests/test_erd.py` 13 passed; strict frontend build; `tests/refresh.check.mjs` (16) and
`tests/fishbone-toolbox.check.mjs` (41) in headless Chrome, all passing.
`backend/tests/test_auth.py`: 18 failed, 8 passed, **the same 18 as on today's source without this change**: the tests
still stub `user_system_active_accesses_vw`, but sign-in now calls `sp_user_system_active_accesses`, so the stub sign-in
returns 503. The tests need updating (separate fix). Not checked: the real stack signed in.

## Fishbone template + every shape in Flowchart (applied 2026-11-10)

**Applied 2026-11-10** by Claude at the owner's request ("please apply now"): 10 files copied into the source and the
local-Traefik backend and frontend rebuilt. Checked on the running stack: database templates `flowchart` v5 (33 shapes)
and `fishbone` v1, served bundle has the changes; not yet checked signed in. Owner: "add the fish bone template, one last if i select flow chart all shapes
must be there, but users can hide the category if they dont want it and they can display it if needed". Fishbone
design chosen by the owner: auto-arranged bones (not a starter drawing).

### Fishbone (Ishikawa)

A new **Fishbone (Ishikawa)** type on the home page. The problem goes in the head on the right; causes go on the bones.

- Six bones to start: People, Method, Machine, Material, Measurement, Environment (hover a bone's name for a hint).
  Bones take turns above and below the spine: 1st, 3rd, 5th on top, 2nd, 4th, 6th below.
- **+** on a bone adds a cause. Causes line up along the slant of their bone by themselves, in the order they were
  added; drag one up or down to reorder it, or onto another bone to move it. Deleting one closes the gap.
- All bones share one height and grow when a bone gets more causes than fit (and shrink back when causes are deleted);
  the head stays centred on the spine.
- The head is an ordinary shape (rust fill, "Problem (effect)"): double-click to type, font, size, color and fill work as
  usual; it can't be moved or deleted.
- Bones can be renamed, recoloured, added, removed (when empty) and reordered in the Details panel ("Bones"), like
  swimlane lanes; saved per diagram. There's no size panel: the fishbone sizes itself.
- Causes start as Text (right-aligned so the text meets the bone); Process, Card and Note are in the toolbox too. Each
  cause has "Why? (deeper cause)" and "Evidence" in the Details panel.

| File | Change |
|---|---|
| `backend/templates/fishbone.json` (new) | The type: `"layout": {"type": "fishbone"}`, the six bones, toolbox, fields |
| `frontend/src/fishbone.ts` (new) | Places the causes along their bones, works out the bone height, keeps the head on the spine |
| `frontend/src/templateEngine.ts`, `types.ts` | `fishbone` layout type: bone positions, cause sizes |
| `frontend/src/nodes/ZoneNode.tsx`, `styles.css` | Draws a bone (diagonal line, name box, +) and the spine instead of a column |
| `frontend/src/components/Editor.tsx` | Re-arranges after add, move, resize, delete and bone changes; frames the whole fishbone on open; no size panel |
| `frontend/src/components/LaneEditor.tsx` | Bone-specific hint |

Found while testing: React Flow's fit-on-open framed only the head (it ran before the bones were measured), so the editor
waits until every node is measured and then fits. Only fishbones do this; other types open as before.

### Flowchart: every shape, foldable categories

The Flowchart toolbox now has all 33 shapes (was 20): Basic, Flowchart, Process (BPMN), Software, Data flow (DFD), in
that order. Click a category heading to hide its shapes ("13 hidden"), click again to show them. Folding works in every
type that has more than one category (Architecture, Swimlane…), and is remembered per diagram type in this browser
(like the theme), not per user or per diagram. Everything starts shown.

| File | Change |
|---|---|
| `backend/templates/flowchart.json` | All shapes, sorted by category; version 4 → 5 so the database copy updates at startup |
| `frontend/src/components/Palette.tsx`, `Editor.tsx` | Category headings are fold buttons; folded categories saved in `localStorage` |

Apply: copy the files into the source, then rebuild backend and frontend
(`docker compose -f docker-compose.prod.yml -f audit-notes/fixes/docker-compose.local-traefik.yml up -d --build backend frontend`).
No database or API changes; templates load from `backend/templates/*.json` at startup.

Checked on a throwaway copy: strict build (`tsc -b` + `vite build --base /flowmira/`); `tests/fishbone-toolbox.check.mjs`
(41 checks) and `tests/refresh.check.mjs` (14) in headless Chrome with a fake API, all passing; screenshots looked at.
Not checked: the real stack signed in, PNG/PDF/GIF export and Present mode of a fishbone, dark theme, browsers other
than Chrome.

## Refresh keeps the open diagram (applied 2026-11-10)

**Applied 2026-11-10** by Claude at the owner's request ("apply fixes"): `App.tsx`, `Editor.tsx`, `ErdEditor.tsx` copied
into the source and the local-Traefik frontend rebuilt. Checked on the running stack: `/flowmira/diagram/1` serves the
app and the served bundle has the change; not yet checked signed in. Owner: "avoid the application go back to the home page when user refresh the browser".

The open diagram or ERD is now in the address: `/flowmira/diagram/12`, `/flowmira/erd/3` (home stays `/flowmira/`).
Refreshing reopens it; a copied address opens it too (subject to the same server-side access checks as today).

| File | Change |
|---|---|
| `frontend/src/App.tsx` | Read the page from the address at start; keep the address in step when you open or leave a diagram; an ERD address opened by a regular user goes home |
| `frontend/src/components/Editor.tsx`, `frontend/src/erd/ErdEditor.tsx` | With unsaved changes, refreshing or closing the tab asks first (the browser's own "Leave site?") |

Decisions: the address is replaced, not added to history, so the browser's Back button behaves as before (it doesn't
step from a diagram back to the home page, which would skip the editor's "unsaved changes" question). Right after the
portal sign-in link Flowmira still opens on the home page. Unknown addresses show the home page; a diagram that no longer
exists (or isn't yours) shows the editor's existing error with **Back to diagrams**. If the session ends while a diagram
is open, the address goes back to `/flowmira/`. No nginx or Traefik change: nginx already answers
`/flowmira/diagram/12` with the app (checked on the running stack).

Checked on a throwaway copy: strict build (`tsc -b` + `vite build --base /flowmira/`); `tests/refresh.check.mjs`
(14 checks) in headless Chrome with a fake API under `/flowmira/`, all passing. Not checked: the real stack signed in,
refresh inside an ERD (the fake API has no ERDs; same code path as diagrams), browsers other than Chrome.

## Flowmira tab icon (applied 2026-11-10)

**Applied 2026-11-10** by Claude at the owner's request ("please apply the changes"): files copied into the source and
the local-Traefik frontend rebuilt. Checked on the running stack: `/flowmira/` links `/flowmira/favicon.svg` and it is
served; not looked at in a signed-in browser tab.

Flowmira had no icon of its own. The browser then asks for `/favicon.ico` at the site root, which Traefik sends to
another app (`http://127.0.0.1/favicon.ico` returns a 126 KB PNG that isn't Flowmira's), so the tab showed that app's
icon. The new icon is a small flowchart on Flowmira's dark ink color: a white start box, a yellow decision
diamond (the app's highlight yellow), and two white outcome boxes.

| File | Change |
|---|---|
| `frontend/public/favicon.svg` (new) | The icon (SVG, scales to any size) |
| `frontend/index.html` | `<link rel="icon">`, `apple-touch-icon`, `theme-color` |

Vite adds the base path at build time, so production gets `href="/flowmira/favicon.svg"`. nginx already serves it
through the SPA `location /` (`no-cache`, so a new icon shows on the next load). Frontend only; no backend, template or
database changes. The "Flowmira" wordmark in the page headers is unchanged.

Apply: copy both files into `frontend/`, then
`docker compose -f docker-compose.prod.yml -f audit-notes/fixes/docker-compose.local-traefik.yml up -d --build frontend`.
Browsers cache tab icons hard; if the old one stays, open the page in a new tab or clear the site's cache.

Checked on a throwaway copy: `vite build --base /flowmira/` produces the prefixed link and `dist/favicon.svg`; rendered
at 256, 32 and 16 px and looked at. Not checked: the real stack, or browsers other than Chrome (Safari's pinned-tab and
older iOS home-screen icons prefer PNG).

## Data Flow Diagram (applied 2026-11-10)

**Applied 2026-11-10** by Claude at the owner's request ("apply it and rebuild"): files copied into the source and
the local-Traefik backend and frontend rebuilt. Served bundle and seeded templates (`dfd` v1, `flowchart` v4) checked;
not yet checked signed in.

A new **Data Flow Diagram** type on the home page, and three DFD shapes
(Gane & Sarson notation) in their own toolbox group, **Data flow (DFD)**. The same three shapes are also offered in
the **Flowchart** toolbox, so either way works; the owner wants them kept in Flowchart too (2026-11-10), so don't remove them from there.

| Shape | Looks like | Details panel |
|---|---|---|
| Process (numbered) | Rounded box, teal outline, number in a tinted band at the top ("0"), name in bold, second line, description in grey (the picture you sent) | Number, Second line, Description |
| External entity | Box with a solid shadow edge | Description |
| Data store | Box open on the right, ID ("D1") in a box on the left | Store ID |

Data flows are the existing arrows with labels. New processes are numbered 1, 2, 3… (one more than the highest
top-level number already on the diagram, so "2.1" counts as 2); stores D1, D2…; you can type any number, e.g. 0 or
1.2. An empty number hides the band. The number, second line and description are saved in the item's `fields`
(`ref`, `subtitle`, `description`), the same keys on all three shapes, so changing shape keeps them. Outside a
column the DFD shapes default to a teal outline (#1F6B85); fill, font, text size, color and alignment work as on
other shapes (size and color apply to the name only).

| File | Change |
|---|---|
| `backend/templates/dfd.json` (new) | The Data Flow Diagram type: free canvas, DFD shapes + Note + Text, no Personas, a Notes field |
| `backend/templates/flowchart.json` | DFD shapes added to the toolbox; version 3 → 4 so the database copy updates at startup |
| `frontend/src/dfd.ts` (new) | Fields per DFD shape; starting number |
| `frontend/src/types.ts`, `shapes.tsx` | Shape keys `dfd-process`, `dfd-entity`, `dfd-store`; new category; `defaultStroke` |
| `frontend/src/nodes/ShapeNode.tsx`, `styles.css` | Draws them |
| `frontend/src/components/Inspector.tsx`, `Editor.tsx` | The fields; numbering new ones |

No backend code or database changes: templates are loaded from `backend/templates/*.json` at startup, so the
backend image needs a rebuild too (`docker compose ... up -d --build backend frontend`).

Checked on a throwaway copy: strict build (`tsc -b` + `vite build`); `tests/dfd-shapes.check.mjs` (35 checks) in
headless Chrome with a fake API, all passing; screenshot looked at. Not checked: the real stack signed in, PDF/PNG/GIF
export, or browsers other than Chrome.

## Text color and alignment (applied 2026-10-30)

**Applied 2026-10-30** by Claude at the owner's request ("apply the fixes please"): files copied into the source and
the local-Traefik frontend rebuilt. Served bundle checked; not yet checked signed in.

**Text color** in the Details panel for shapes and arrow labels, and **Text alignment** (left, center, right) for
shapes. Both change everything selected, so Ctrl+A then a color restyles the whole diagram. ERDs and column or lane
titles are unchanged. No template, backend or database changes.

| File | Change |
|---|---|
| `frontend/src/fonts.ts` | `textColor`, `textAlign`, checks for saved values |
| `frontend/src/types.ts`, `templateEngine.ts`, `edges.ts` | Save and load them (arrows save the color only) |
| `frontend/src/nodes/ShapeNode.tsx`, `styles.css` | Apply them, including in the box you type in |
| `frontend/src/components/Inspector.tsx`, `Editor.tsx` | The controls; moving to another lane keeps them |

Decisions: 11 colors (the arrow colors plus White) and any custom color. Like text size, the color and alignment
apply to the main label only, so persona card sections and the extra lines on cards keep their own color. A chosen
color wins over the automatic white on dark fills, stays in dark mode, and can be unreadable if the owner picks it
that way; Default brings the automatic color back. Arrow labels get no alignment buttons: they are a single line.
Alignment is horizontal only.

Checked on a throwaway copy: strict build; `tests/text-color-align.check.mjs` (31 checks) in headless Chrome with a
fake API, all passing, and `font-text` and `image-shape` still pass. Screenshots looked at. Not checked: the real stack
signed in, PDF and GIF export, or browsers other than Chrome. Building for these checks needs `VITE_API_URL=""`.

## Yellow handle works on every elbow arrow (applied 2026-10-30)

**Applied 2026-10-30** by Claude at the owner's request ("apply it and rebuild"): files copied into the source and
the local-Traefik stack rebuilt. Served bundle checked; not yet checked signed in.

The handle only worked on forward Z-shaped arrows. It did nothing useful on four other kinds:

| Arrow | Before | Now |
|---|---|---|
| Going backwards (e.g. Right to Left, target behind) | Handle moved, line didn't | Handle moves the horizontal middle part, up and down |
| Both ends on one side (Right to Right) | Neither moved | Moves the outer arm |
| Mixed sides (Right to Top) | No handle | Corner moves in any direction, adding two bends |
| Shapes lined up (straight line) | Moved along the line, no visible change | The middle steps out to the side |

Cause: the code assumed every arrow is a Z and passed React Flow a middle point, which React Flow ignores on other
routes. `elbow.ts` now takes the route React Flow draws and moves the part of it that can move.

| File | Change |
|---|---|
| `frontend/src/elbow.ts` (new) | Finds the movable part; draws the moved line |
| `frontend/src/edges/FlowEdge.tsx` | Uses it; handle sits on the moved part; the "xy" drag |
| `frontend/src/components/Inspector.tsx` | One hint for all arrows (the "One corner only" text goes) |
| `frontend/src/styles.css` | Move cursor on the corner handle |

Arrows with no bend draw exactly as before. A bend saved on a Z arrow stays where it was. A bend someone dragged
on a Right to Right arrow did nothing before, so it takes effect now; double-click the handle to clear it.

Checked on a throwaway copy: strict build; `tests/bend-handle.check.mjs` in headless Chrome with a fake API: 16 arrow
layouts, each dragged twice, saved, reopened and reset, 82 checks passing. `connection-points`, `font-text` and
`image-shape` checks still pass. Not checked: the real stack signed in, or browsers other than Chrome.

## More connection points on shapes (applied 2026-10-30)

**Applied 2026-10-30** by Claude at the owner's request: files copied into the source and the local-Traefik
stack rebuilt. Served bundle checked; not yet checked signed in.

Every shape now has **12 connection points instead of 4**: the middle of each side, plus one at 25% and 75% along
it. Drag from any dot, or pick one under **Leaves from** / **Enters at** in the arrow's Details panel.
ERDs are unchanged. No template, backend or database changes.

| File | Change |
|---|---|
| `frontend/src/anchors.ts` (new) | The list of points and where each one sits on a shape |
| `frontend/src/nodes/ShapeNode.tsx` | Draws the 12 dots; tells React Flow when they move |
| `frontend/src/components/Inspector.tsx` | Leaves from / Enters at list all 12 |
| `frontend/src/styles.css` | Smaller grab area on the extra dots, so neighbours don't overlap |

Decisions: the four middle dots keep their ids and places, so existing arrows don't move. New ids are `t25`, `t75`,
`r25`, and so on. The extra dots follow the outline (diamond, circle, pill, cloud, BPMN symbols), not the box.

Limits: on a diamond the side dots meet at the slanted edges, so it shows 8 dots, not 12 (all 12 still exist, so
changing a shape to a diamond doesn't lose an arrow). On the cloud and similar shapes the four middle dots still
float just off the outline, as they do today. A diagram saved with an extra point needs this build to open
correctly: an older build can't attach that arrow.

Checked on a throwaway copy: strict build; `tests/connection-points.check.mjs` in headless Chrome with a fake API,
all passing; `font-text` and `image-shape` checks still pass. Not checked: the real stack signed in, PNG/PDF/GIF
export of a diagram with an arrow on an extra point, or browsers other than Chrome.

## Font and text size (applied 2026-10-30)

**Applied 2026-10-30** by Claude at the owner's request: files copied into the source and the local-Traefik
stack rebuilt. Served bundle checked; not yet checked signed in.

**Font** and **Text size** in the Details panel, for shapes and arrow labels. They change everything selected,
so Ctrl+A then a font restyles the whole diagram. ERDs and column or lane titles are unchanged.
No template, backend or database changes.

| File | Change |
|---|---|
| `frontend/src/fonts.ts` (new) | Font list, sizes, checks for saved values |
| `frontend/src/types.ts`, `templateEngine.ts`, `edges.ts` | Save and load `fontFamily`, `fontSize` |
| `frontend/src/nodes/ShapeNode.tsx`, `styles.css` | Apply the style; every shape type's size is now overridable |
| `frontend/src/components/Inspector.tsx`, `Editor.tsx` | The controls; apply to the selection |

Decisions: 7 fonts that come with Windows and macOS, plus Default (Archivo). Sizes 10-72. The size applies to the
main label only; on persona cards the font changes all text but the size changes only the name.

Checked on a throwaway copy: strict build; `tests/font-text.check.mjs` and `tests/image-shape.check.mjs` in
headless Chrome with a fake API, all passing. Not checked: the real stack signed in, PDF and GIF export, or
the listed fonts themselves (the test machine substitutes look-alikes for some).

## Images on diagrams (applied 2026-10-30)

**Applied 2026-10-30** by Claude at the owner's request ("apply it and rebuild"): files copied into the
source and the local-Traefik stack rebuilt. Served bundle checked; not yet checked signed in.

An **Add image** button in the Toolbox's Shapes tab, in all six templates. Pictures can also be pasted or
dropped on the canvas. ERDs are unchanged. No template, database or nginx changes.

| File | Change |
|---|---|
| `frontend/src/images.ts` (new) | Shrink to 1600 px, picture rules, keep pictures out of undo history |
| `frontend/src/nodes/ShapeNode.tsx`, `shapes.tsx`, `types.ts`, `styles.css` | The `image` shape |
| `frontend/src/templateEngine.ts` | Starting size, saved `image` field, drops anything that isn't a data URL we made |
| `frontend/src/components/Palette.tsx`, `Inspector.tsx` | Add image, Replace image, Caption |
| `frontend/src/components/Editor.tsx` | Paste, drop, replace, 10 MB checks, undo |
| `backend/app/routers/diagrams.py` | The home list no longer reads every diagram's data |

Decisions: pictures are stored inside the diagram as data URLs. PNG, JPG, WebP and GIF (first frame only);
no SVG. Everyone who can edit a diagram can add pictures.

Also fixed: moving a shape to another column or lane used to reset its opacity and icon color.

Checked on a throwaway copy: strict build; `tests/image-shape.check.mjs` in headless Chrome with a fake
API, all passing; `backend/tests/test_auth.py`, 35 passed. Not checked: the real stack signed in, or Word,
Excel and Snipping Tool as paste sources (the test pastes a synthetic file).

## Local run at http://127.0.0.1/flowmira, no ports (2026-10-30)

```sh
docker compose -f docker-compose.prod.yml -f audit-notes/fixes/docker-compose.local-traefik.yml up -d --build
```

- `docker-compose.local-traefik.yml` adds the local Traefik rule, plain-http cookies and the UMS address
  on top of the production file. Source and `.env` are unchanged.
- `add-flowmira-system-row.sql` puts `SYS-222-FM` back in `ipc_centralized.systems`. It's a write to the
  shared local database, so run it only with the owner's say-so. Portal sign-in needs it.

## Editor layout: foldable panels, Toolbox tabs, mini-map (applied 2026-10-27)

Findings: [`../ui-layout-review.md`](../ui-layout-review.md). Date: 2026-10-27. Frontend only: no API or
database changes, nothing to migrate.

**Applied 2026-10-27** by Claude at the owner's request ("please apply it now"):
- `apply.sh` copied the 6 files into `src/` and ran `docker compose up -d --build frontend`.
- Checked: the served bundle contains the new code (`flowmira.layout`, `tool-tab-`, "Hide mini-map"),
  and `/api/health` answers 200.
- The 5 replaced files were backed up to the session scratchpad (`src-before-layout/`).
- Not yet checked in the real app while signed in: see the check list below.

| Fix file | Real path | Change |
|---|---|---|
| `frontend/src/components/SideDock.tsx` | same | **new file**: a side panel that folds to a 44px rail on desktop and remembers that in the browser. Below 768px it does nothing, so the panels stack as before |
| `frontend/src/components/Editor.tsx` | same | Toolbox and Inspector wrapped in `SideDock`. `[` and `]` toggle them. Mini-map (off by default, 168×112) with an on/off button in the zoom controls. Root guard against page scroll (F8) |
| `frontend/src/components/Palette.tsx` | same | Draw arrow pinned at the top. Tabs **Shapes · Icons · Arrows**. "Shapes"/"Icons" titles removed because the tab says it. Arrows tab renamed "New arrow style" with a hint. Speed removed (it stays in the Inspector). Width 212 → 248px. Labels 11/11.5px → 12px, hyphenated if too long. F8 fix |
| `frontend/src/components/Inspector.tsx` | same | Panel shell: the side border moved to `SideDock`. The top strip is transparent unless there's a lane/column colour (it was a grey bar). F8 fix |
| `frontend/src/erd/ErdEditor.tsx` | same | Mini-map (off by default) plus on/off button. The table count moves beside the mini-map. Root guard against page scroll (F8). Narrow screens unchanged |
| `frontend/src/styles.css` | same | Mini-map hidden in Present mode |

### How to apply

The script backs up the 5 current files to the session scratchpad, copies the 6 staged files into
`src/`, then rebuilds only the frontend. In the WSL terminal:

```bash
bash /mnt/c/Users/jeremias-bartolome/AppData/Local/Temp/claude/--wsl-localhost-Ubuntu-20-04-home-jeremias-bartolome-projects-flowmira/8be8506c-a0e2-4e43-9614-c173a5e9bc38/scratchpad/apply.sh
```

To apply by hand instead: copy the 6 files to their real paths, then `docker compose up -d --build frontend`.

### How the panels behave

- **Toolbox (left):** stays open or closed as you last left it. When folded, the rail still has Draw
  arrow, plus Shapes and Icons buttons that open the Toolbox on that tab.
- **Details / Inspector (right):**
  - Templates with columns or lanes (SIPOC, DMAIC, Swimlane, Personas): stays open or closed as you
    last left it, because the size and lane tools live there.
  - Free canvases (Flowchart, Architecture): folded until you select a shape or arrow, then it opens.
    If you close it, it stays closed for that selection and opens again for the next one.
- **Narrow screens (< 768px):** unchanged. The Toolbox stacks above the canvas and the Inspector below
  it, and the page scrolls (owner: "stacking is intended"). The earlier slide-over drawer idea was
  dropped.
- **Present mode:** unchanged. Both panels and the mini-map are hidden.
- **Remembered:** stored in `localStorage` key `flowmira.layout`, so it's per browser. If storage is
  blocked, the defaults are used.

### What was tested

| Check | Result |
|---|---|
| Throwaway build: copy of `frontend/` with these 6 files, `docker build --target build` (`tsc -b && vite build`) | ✅ type check and build pass. Image and copy removed afterwards; the running stack wasn't touched |
| Preview in headless Chrome: the built staged frontend served with a fake API (one Flowchart, one Swimlane; no real data, no sign-in) and driven over the DevTools protocol | ✅ Screenshots looked right: Flowchart nothing selected / shape selected / Icons and Arrows tabs / Toolbox folded, 1920 wide, 1366×600, Swimlane, 390 narrow |
| `scrollHeight === innerHeight` in the editor | ✅ 1366×768, 1366×600, 1920×1080 at 67%, 80%, 100% and 125% zoom, Swimlane. At 390 wide the page scrolls (stacking, as intended) |
| The real app, signed in | ❌ not done (needs a portal sign-in). Please check the list below after applying |

The screenshots led to these design tweaks: labels broke mid-word ("Connecto r") → wider Toolbox +
hyphenation. The mini-map was big and covered shapes → smaller and off by default. Repeated "Shapes"/"Icons"
titles were removed. The grey bar at the top of Details is now transparent.

**Please check after applying** (Flowchart first):
1. Fold and unfold both panels with the buttons and with `[` / `]`. Typing `[` in a text box must not
   fold anything.
2. In a Flowchart: select a shape and the right panel opens. Click the canvas and it folds. Close it
   while a shape is selected, then select another shape: it opens again.
3. In SIPOC or Swimlane: the right panel stays open, with the size and lane tools.
4. Toolbox tabs. On the folded rail, Shapes and Icons open the matching tab.
5. Mini-map: off at first. The map button in the zoom controls shows it; drag inside it to pan. It
   doesn't show in Present mode or in PNG/PDF exports.
6. Narrow the window below 768px: the panels stack above and below the canvas, as before.
7. ERD: the mini-map and the table count beside it.

### Bug fix F8: the page scrolls and the editor doesn't fill the window (2026-10-27)

Cause and measurements: [`../ui-layout-review.md`](../ui-layout-review.md), F8. Included in the staged
files above, each marked `// ── FIX ──` with "F8". The staged frontend was rebuilt and passes. The same
fix also works on **today's `src/` by itself**, without the layout changes: 4 class edits.

| Real file (today) | Element | Add |
|---|---|---|
| `frontend/src/components/Palette.tsx:172` | Toolbox `<aside>` | `relative` |
| `frontend/src/components/Inspector.tsx:62` | Inspector `<aside>` | `relative` |
| `frontend/src/components/Editor.tsx:1677` | root `<div className="flex h-full flex-col">` | `relative md:overflow-hidden` |
| `frontend/src/erd/ErdEditor.tsx:452` | root `<div className="flex h-full flex-col">` | `relative md:overflow-hidden` |

**Please check after applying.** In the editor's DevTools console, this must be `true` at 67%, 80%,
100% and 125% zoom:

```js
document.documentElement.scrollHeight === window.innerHeight
```

Also check that the Toolbox and the right panel scroll on their own while the page doesn't.

### Open questions
- Swimlane/SIPOC diagrams look small when they open: fit-on-open fits the whole lane length (1800px
  by default) into the view. This was already the case before; it's not part of this change.
- The Flowchart "viewing problem" was never described exactly. If it's something other than the
  cramped canvas (for example shapes cut off), please say what and I'll look again.
- The header still wraps to two rows on small windows (F7). It's untouched because of the 2026-10-15
  "do not modify header" decision.

Apply by copying the 6 files to their real paths, then `docker compose up -d --build`.

## Stored-procedure access check (staged; not applied)

Latest proposed replacement for the view-based access lookup: see
[`../stored-procedure-access-review.md`](../stored-procedure-access-review.md).
Includes auth.py, models.py, main.py, test_auth.py, and .env.example.


## Sign-in and roles (UMS, `SYS-222-FM`)

### Update 2: access read from `user_system_active_accesses_vw`

**Applied 2026-10-20** by Claude at the owner's request: *"just use the view i sent … setup default user
and password i will change it later"*. **The view is now the only source of access.** The fallback to
UMS's access list and the UMS `verify_api_token` re-check were removed. `IPC_DB_HOST` is required.
`.env` got `IPC_DB_HOST=host.docker.internal`, `IPC_DB_PORT`, `IPC_DB_NAME`, `IPC_DB_USER=root` and a
**placeholder** `IPC_DB_PASSWORD` for the owner to change. After rebuild: MySQL reachable but
`1045 Access denied` (placeholder password), so sign-in answers 503 until the password is set.
Tests after the change: `test_auth.py` 26/26; MySQL stack 42/42; Flowmira's engine as `root` →
`UPDATE` refused (`1792 READ ONLY transaction`).

Owner, 2026-10-20: *"use this for checking the access"* (`ipc_centralized.user_system_active_accesses_vw`).
The notes below were written before "just use the view" (the fallback mentioned there is gone).

- **Who** someone is still comes from UMS (`/authenticate/<credentials>`). **What access** they have is now
  read from the view: `WHERE user_id = <UMS users.id> AND system_reference_code = 'SYS-222-FM'`. UMS's
  own `userAccesses()` reads the same view, so the ids match. The view drops inactive accesses
  (`status_id` not in 1,2,3,24,25) and inactive systems (`active_flag <> 1`).
- **Re-checks** read the view too, every `ACCESS_RECHECK_MINUTES` (5; was `UMS_RECHECK_MINUTES` 15). No
  UMS call. This fixes the earlier gap where a revoked UMS token kept a session alive (UMS answers 500).
  The UMS token isn't kept at all in this mode (`auth_sessions.ums_token = ''`).
- View unreachable → sign-in 503; existing sessions keep working until they expire.
- `IPC_DB_HOST` empty → previous behaviour (UMS's access list, `verify_api_token`), so the running
  stack keeps working until the account below exists.
- MySQL sessions are set `READ ONLY`, on top of a SELECT-only account.

| Fix file | Change |
|---|---|
| `backend/app/auth.py` | `IPC_ENGINE` from `IPC_DB_*` (pymysql), `view_accesses()`, `role_for()`, `sign_in()`; exceptions renamed `AccessDenied` / `AccessUnavailable`; re-check via the view |
| `backend/app/routers/auth.py` | calls `auth.sign_in()` |
| `backend/requirements.txt` | + `pymysql`, `cryptography` (MySQL 8 auth) |
| `backend/tests/test_auth.py` | + 7 view tests (view decides the role over UMS; refusals; no UMS token kept; demote/remove at re-check without UMS calls; view down) |
| `docker-compose.yml`, `.env.example` | `IPC_DB_HOST/PORT/NAME/USER/PASSWORD`, `ACCESS_RECHECK_MINUTES` |
| `tests/ipc_view_fixture.sql`, `tests/stub_ums.py`, `tests/stack-check.sh` | not copied: test MySQL with the owner's `systems` / `user_system_accesses` DDL and the view unchanged (only `CREATE`, no `DEFINER`), + `inactive` / `promoted` test users |

**Account to create** (owner, on the local MySQL first, then prod):

```sql
CREATE USER 'flowmira_ro'@'%' IDENTIFIED BY '<choose one>';
GRANT SELECT ON ipc_centralized.user_system_active_accesses_vw TO 'flowmira_ro'@'%';
```

The view is `SQL SECURITY DEFINER`, so SELECT on the view alone is enough. Then in `.env`:
`IPC_DB_HOST=host.docker.internal` (local container `mysql` publishes 3306), `IPC_DB_USER=flowmira_ro`,
`IPC_DB_PASSWORD=…`.

**Tested** (throwaway stack `flowmira-authtest` on :8099, removed afterwards; real stack not touched):

| Check | Result |
|---|---|
| `backend/tests/test_auth.py` | ✅ 35/35 |
| MySQL 8.0 with the owner's view: as `flowmira_ro`, the view lists the 6 active rows and leaves out the inactive one; `UPDATE` and reading `systems` are refused | ✅ |
| `tests/stack-check.sh` with `VIEW_CHECKS=1` through nginx: everything from before + inactive-in-view refused although UMS says System Owner; view's System Owner beats UMS's Regular User | ✅ 42/42 |
| Live: signed-in owner, access set to `status_id = 4` in MySQL → next request after the re-check is due gets 401, session deleted | ✅ |
| Against the real local `ipc_centralized` | ❌ not done: needs the `flowmira_ro` account (I don't have MySQL credentials) |

### Applied version (update 1)

**Applied 2026-10-20** (copied into `src/` and rebuilt by Claude at the owner's request: "apply it and
rebuild"). `.env` got `UMS_AUTH_URL` and `APP_ORIGIN` (only added, nothing changed). A `pg_dump` from just
before is in that session's scratchpad (`flowmira-before-auth.sql`). Findings and decisions:
[`../production-access-review.md`](../production-access-review.md). Date: 2026-10-20.

People open Flowmira from the IPC portal. Flowmira's server asks UMS who they are and keeps only
their `SYS-222-FM` access:

| User type (id) | Gets |
|---|---|
| System Owner (3), Super User (2) | everything: all diagrams (including ones from before sign-in), ERDs, back up everything, import |
| Regular User (5), Administrator (13) | diagrams only: their own. Create, edit, delete, present, export (PNG/PDF/GIF/`.flowmira`) |
| anything else, or no `SYS-222-FM` access | refused at sign-in |

The server enforces this: FastAPI dependencies on the diagrams API, and nginx `auth_request` in
front of the whole ERD API. The UI only hides what wouldn't work.

These files are full copies of the current `src/` with the changes marked. Some paths
(`backend/app/schemas.py`, `backend/app/routers/diagrams.py`, `frontend/src/types.ts`,
`frontend/src/erd/api.ts`, `frontend/src/components/DiagramList.tsx`) held earlier, already-applied
fixes; they now hold this fix, which includes those changes. Diff first:

```bash
cd ~/projects/flowmira
for f in backend/app/{models,schemas,main}.py backend/app/routers/{diagrams,templates}.py \
         backend/requirements.txt frontend/nginx.conf frontend/src/{api,types,App}.ts* \
         frontend/src/erd/api.ts frontend/src/components/DiagramList.tsx \
         docker-compose.yml docker-compose.dev.yml .env.example; do
  diff -u "$f" "audit-notes/fixes/$f"; done
```

| Fix file | Real path | Change |
|---|---|---|
| `backend/app/auth.py` | same | **new file**: UMS client (`/authenticate/<credentials>`, `/verify_api_token`, like Athena's `UmsClient`), picks the `SYS-222-FM` access, exact type-id → role, sessions, `current_user` / `require_owner` |
| `backend/app/routers/auth.py` | same | **new file**: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, `GET /api/auth/check?role=owner` (for nginx) |
| `backend/app/models.py` | same | `Diagram.owner_id`, `owner_name`; new table `auth_sessions` |
| `backend/app/main.py` | same | `add_owner_columns()` adds the two columns to an existing `diagrams` table (only adds); auth router; CORS `allow_credentials` |
| `backend/app/schemas.py` | same | `DiagramSummary.owner_name`; `LoginRequest`, `Me` |
| `backend/app/routers/diagrams.py` | same | signed-in only; regular users see and change only their own (others' = 404); import dates → owners only (403) |
| `backend/app/routers/templates.py` | same | signed-in only |
| `backend/requirements.txt` | same | + `httpx` |
| `backend/tests/test_auth.py` | same | **new file**: 28 tests against a fake UMS |
| `frontend/nginx.conf` | same | `/api/erd/` → `auth_request /_auth/owner` first; JSON 401/403 messages |
| `frontend/src/App.tsx` | same | `/authenticate/<credentials>` → login, then removes the link from the address bar; sign-in screen; ERD view for owners only; any later 401 → sign-in screen |
| `frontend/src/components/SignInScreen.tsx` | same | **new file**: "Signing you in…" / "open Flowmira from the IPC portal" |
| `frontend/src/components/DiagramList.tsx` | same | "Signed in as … · Sign out"; ERD section and Backup and restore for owners only; owners see "All diagrams" with who made each |
| `frontend/src/api.ts` | same | `me`, `login`, `logout`; `credentials: "include"`; 401 → `flowmira:signed-out` event |
| `frontend/src/erd/api.ts` | same | 401 → same event |
| `frontend/src/types.ts` | same | `Me`, `Role`, `DiagramSummary.owner_name` |
| `docker-compose.yml` | same | backend gets the `UMS_*` / `FLOWMIRA_*` / `SESSION_HOURS` / `COOKIE_SECURE` keys and `host.docker.internal`; `POSTGRES_PASSWORD` and `UMS_AUTH_URL` must be set (no defaults; erd's `change-me` default is gone); `APP_ORIGIN` for CORS |
| `docker-compose.dev.yml` | same | `COOKIE_SECURE=0`; note that ERD isn't owner-checked in dev (no nginx) |
| `.env.example` | same | the new keys, with comments |
| `tests/stub_ums.py`, `tests/stack-check.sh` | not copied | fake UMS + 39 checks through nginx |

### How to apply and test locally (before production)

1. **UMS / `ipc_centralized`** (owner):
   - Add the `systems` row for `SYS-222-FM`: `system_code = 'FM'`, `accepted_user_type_id = '[2,3,5,13]'`,
     **`technology = 'laravel'`** (the portal only builds `/authenticate/{attribute}` links for "laravel"
     systems), `url = 'http://localhost:8080/authenticate/{attribute}'` (local), `active_flag = 1`.
   - Give test users `user_system_accesses` rows for it: at least one System Owner and one Regular User.
   - Until that row exists, UMS answers 500 for `SYS-222-FM` (`$system->accepted_user_type_id` on null).
     Flowmira shows "Can't reach the IPC sign-in service".
2. **`.env`** (keep your current values, add):
   ```
   UMS_AUTH_URL=http://host.docker.internal:8001/api/v1
   APP_ORIGIN=http://localhost:8080
   ```
   `POSTGRES_PASSWORD` must be in `.env` (it is today). Compose now stops with a clear message if it
   or `UMS_AUTH_URL` is missing.
3. Copy the files above (not `tests/stub_ums.py`, `tests/stack-check.sh`), then
   `docker compose up -d --build`. On start the backend adds `diagrams.owner_id` / `owner_name` and
   creates `auth_sessions`. Existing diagrams stay as they are, visible to owners only.
4. Open Flowmira from the local ipcc portal as each test user. Check: Regular User sees only their
   diagrams and no ERD / Backup sections; System Owner sees everything.
5. Then production: Q7 in the review (server, URL, HTTPS). Set `APP_ORIGIN` and the `systems.url`
   to the https address, `COOKIE_SECURE=1`, and a narrow `ERD_ALLOWED_HOSTS`.

### How it behaves

- **Signing in:** `/authenticate/<credentials>` → "Signing you in…" → home. The link is replaced by `/`
  in the address bar at once, so it isn't left in history or shared by copy-paste.
- **Session:** an HttpOnly, SameSite=Lax cookie (`Secure` unless `COOKIE_SECURE=0`) holding a random
  token. The server stores only its SHA-256. The UMS token stays on the server. A session lasts up to
  `SESSION_HOURS` (8).
- **Re-check:** every `UMS_RECHECK_MINUTES` (15) the server asks UMS again (`verify_api_token`).
  Access removed → signed out. Type changed → new role. UMS unreachable → keeps working until the
  session expires.
- **Sign out:** "Sign out" on the home page deletes the session. The editor header is unchanged.
- **Regular users:** someone else's diagram is "not found" (404), so they can't tell it exists.
- **ERD for non-owners:** 403 `Database diagrams (ERD) are for Flowmira system owners only.` from nginx.
  The request never reaches `flowmira-erd`.

### What was tested

| Check | Result |
|---|---|
| `backend/tests/test_auth.py` in `python:3.12-slim` on a throwaway copy (source + these fixes): all routes 401 without a session; forged cookie; each role; HttpOnly/SameSite/Secure flags; UMS token never sent to the browser; only the hash stored; Atlas-only owner, Read-only type, unknown user and UMS 401 refused; bad links never reach UMS; UMS down → 503; logout; expiry; no UMS call while fresh; access removed / demoted in UMS takes effect at re-check; UMS down at re-check keeps the session; ownership (404 for others, owners see all, old unowned diagrams owners only); import dates owners only; column upgrade on an old SQLite table, twice | ✅ 28/28 |
| Full stack from the throwaway copy as project `flowmira-authtest` on :8099 (own containers and volume) with `tests/stub_ums.py`: frontend image build = `tsc -b` (strict) + `vite build` | ✅ builds |
| `tests/stack-check.sh` through nginx: 401s signed out (incl. ERD, JSON body); 4 roles sign in, Atlas-only and unknown refused; owner/super reach ERD; regular/admin get 403 on ERD list/create/introspect; `/_auth/owner` not public; ownership; import 403; logout | ✅ 39/39 |
| Postgres upgrade: dropped the owner columns, added an "old" diagram, restarted the backend → columns + index added, row kept with `owner_id NULL`, owner sees it, regular doesn't | ✅ |
| `erd/tests/test_erd.py` (erd code unchanged) | ✅ 13/13 |
| Test stack removed afterwards (`down -v`); the real stack on :8080 wasn't touched | ✅ |
| **Real stack after applying (:8080)**: 1 diagram and 0 ERDs before and after; `owner_id` / `owner_name` added (the existing diagram has no owner → owners only); `auth_sessions` created; `/` and `/authenticate/…` 200; diagrams, templates and ERD all 401 without a session (ERD with the JSON message); new bundle served; backend reaches local UMS at `host.docker.internal:8001` | ✅ |
| **Real UMS** sign-in (local ums on :8001) | ❌ **not done**: needs the `SYS-222-FM` row, and I didn't create UMS tokens for real users |
| Clicking through it in a browser (sign-in screen, sign out, hidden sections, dark theme) | ❌ **not done**. Please try it after applying |

### Known limits / open questions

- **UMS sign-in links can be forged** (see the review's ⚠ section). This is a UMS/portal issue
  affecting every system. Flowmira passes the credentials through unchanged, so a UMS fix needs no
  Flowmira change. Q10: separate review of `ums/` + `ipcc/`?
- A UMS token revoked in UMS gives **500** (not 401) from `verify_api_token`. Flowmira can't tell that
  from an outage, so that session lasts until `SESSION_HOURS`. Removing the user's access in UMS
  (which UMS answers with 401) does sign them out at the next re-check.
- The UMS token is stored in `auth_sessions.ums_token` (plain, needed for re-checks). It's in
  Flowmira's own database, which isn't published.
- No screen yet to **assign** an old (pre-sign-in) diagram to a user. Owners see and edit them;
  regular users don't.
- Development overlay: the app calls the ERD service directly on :8001, so ERD isn't owner-checked in dev.

---

## Crow's-foot arrow ends (diagram editor)

**Applied 2026-10-16** (copied into `src/` and rebuilt by Claude at the owner's request). Findings: [`../line-crossings-review.md`](../line-crossings-review.md#cardinality-crows-foot-arrow-ends). Date: 2026-10-16.

Owner's choice for "arrow for cardinality": **crow's-foot arrowheads in the diagram editor**.
Each end of an arrow can have a cardinality mark: **One**, **Zero or one**, **Many**, **One or many**,
**Zero or many**. A mark replaces the arrowhead at its end. These files are full copies of the
current `src/`, with line hops already included. Diff first:

```bash
cd ~/projects/flowmira
for f in types.ts edges.ts edges/FlowEdge.tsx components/Inspector.tsx components/Palette.tsx \
         styles.css lineHops.tsx; do
  diff -u frontend/src/$f audit-notes/fixes/frontend/src/$f; done
```

| Fix file | Real path | Change |
|---|---|---|
| `frontend/src/crowsFoot.ts` | same | **new file**: mark types and labels, `endMark()` draws a mark at a point in a direction (same drawing as the ERD's relationship marks) |
| `frontend/src/types.ts` | same | `EdgeData` / `SavedEdge` get optional `startMark`, `endMark` |
| `frontend/src/edges.ts` | same | No arrowhead at an end that has a mark; marks are saved and loaded (unknown values dropped; arrows without marks save exactly as before) |
| `frontend/src/edges/FlowEdge.tsx` | same | Draws the marks. Straight lines: along the line. Elbow/curved: straight out of the side they're attached to |
| `frontend/src/components/Inspector.tsx` | same | Selected arrow: **Crow's foot: start / end** pickers under Arrowheads |
| `frontend/src/components/Palette.tsx` | same | Arrows → **Crow's foot: start / end** for new arrows |
| `frontend/src/styles.css` | same | `.flow-mark`: arrow colour, selection highlight, export colours; the "zero" circle is filled white |
| `frontend/src/lineHops.tsx` | same | **FIX** no hop within 26 px of an end (was 12), so hops never land on a mark |
| `tests/crows-foot.test.mjs` | not copied | Geometry, arrowhead swap and save/load test |

No backend change: arrows are stored as free-form JSON. Copy/paste, undo, `.flowmira` export
and backups carry the marks, because they all go through `edgeToSaved` / `edgeFromSaved`.
Rebuild after copying: `docker compose up -d --build`.

### What was tested

| Check | Result |
|---|---|
| Throwaway copy (source + these fixes) in `/tmp`; `docker build --target build` → `tsc -b` (strict) + `vite build` | ✅ passes |
| `tests/crows-foot.test.mjs`: mark shapes and orientation (right, up, left), arrowheads removed only at marked ends, save → load → save keeps marks, old arrows unchanged, unknown values dropped | ✅ 12/12 |
| `tests/line-hops.test.mjs` with the larger end gap | ✅ 10/10 |
| Real stack on :8080 | ✅ rebuilt 2026-10-16: frontend container recreated, HTTP 200, pickers and `.flow-mark` styles in the served bundle |
| Clicking through it in a browser (pickers, selection colour, dark theme, export) | ❌ **not done**. Please try it after applying |

### Open questions

- The ERD module keeps its own marks (one / many only). Should ERDs also get "zero" marks from
  nullable FK columns? Not built.

---

## Line hops and curved ERD lines

**Applied 2026-10-16** (copied into `src/` and rebuilt by Claude at the owner's request). Findings: [`../line-crossings-review.md`](../line-crossings-review.md). Date: 2026-10-16.

Where two lines cross without being connected, one jumps over the other with a small arc (the
electrical "not connected" hop). This works in both editors. ERD relationship lines can also be
switched to **Curved**. Cardinality is **not** included yet (see the review's open questions).

The files below are full copies of the current `src/`, including the already-applied
backup and Present mode changes. Copy them over, or diff first:

```bash
cd ~/projects/flowmira
for f in lineHops.tsx types.ts edges/FlowEdge.tsx components/Palette.tsx components/Editor.tsx \
         erd/types.ts erd/RelationEdge.tsx erd/ErdEditor.tsx; do
  diff -u frontend/src/$f audit-notes/fixes/frontend/src/$f; done
```

| Fix file | Real path | Change |
|---|---|---|
| `frontend/src/lineHops.tsx` | same | **new file**: path → polyline, crossing detection, hopped path, a store shared per canvas, `<LineHopsProvider>`, `useHoppedPath()` |
| `frontend/src/edges/FlowEdge.tsx` | same | Draws `useHoppedPath(id, path)` instead of `path` |
| `frontend/src/types.ts` | same | `DiagramSettings.lineHops?: boolean` |
| `frontend/src/components/Palette.tsx` | same | Arrows → **Where arrows cross**: Hop / Plain |
| `frontend/src/components/Editor.tsx` | same | `lineHops` state (loaded from / saved to `settings`, part of undo), passed to the Palette; canvas wrapped in `<LineHopsProvider>` |
| `frontend/src/erd/types.ts` | same | `ErdLayout.lines?: "elbow" \| "curved"`, `ErdLayout.hops?: boolean`, type `ErdLineStyle` |
| `frontend/src/erd/RelationEdge.tsx` | same | Curved = `getBezierPath`; draws the hopped path |
| `frontend/src/erd/ErdEditor.tsx` | same | Elbow / Curved / Hop buttons next to Auto-arrange (hidden while presenting); saved in `layout` (Save, `.flowmira` export, editable copy); canvas wrapped in `<LineHopsProvider>` |
| `tests/line-hops.test.mjs` | not copied | Geometry test (see below) |

No backend change and no migration. Rebuild after copying: `docker compose up -d --build`.

### How it behaves

- Hops are **on** by default, including for existing diagrams. A line with no crossings is drawn
  exactly as before.
- A horizontal segment hops over a vertical one. For diagonal or curved crossings, one of the
  two lines (always the same one) hops. Lines that meet at a shared connection point never hop.
- Hops show in PNG / PDF / GIF exports and in Present mode. Animated dashes and dots follow the arc.
- Diagram editor: Palette → Arrows → *Where arrows cross*, Hop / Plain, saved with the diagram, undoable.
- ERD: Elbow / Curved / Hop buttons at the top-left of the canvas, saved with the ERD (also for
  view-only database ERDs, like table positions).

### What was tested

| Check | Result |
|---|---|
| Throwaway copy (source + these fixes) in `/tmp`; `docker build --target build` → `tsc -b` (strict) + `vite build` | ✅ passes |
| `tests/line-hops.test.mjs` against real React Flow paths (straight, elbow/smoothstep, Bézier): horizontal hops over vertical, exactly one hop per crossing, arcs bulge up, no hop at shared ends, close hops merge, unknown paths ignored | ✅ 10/10. The first run found a real bug (a crossing exactly on a corner point was missed); fixed |
| Real stack on :8080 | ✅ rebuilt 2026-10-16: frontend container recreated, HTTP 200, new controls in the served bundle |
| Clicking through it in a browser (drag, undo, save/reload, export, dark theme, ERD curved) | ❌ **not done**. Please try it after applying |

To rerun the geometry test (from WSL, after a build of the throwaway copy tagged `flowmira-hops-test`):

```bash
docker run --rm -v /tmp/flowmira-hops:/t -w /app flowmira-hops-test sh -c \
  'cp /t/hops.test.mjs /app/ && npx esbuild /t/frontend/src/lineHops.tsx --format=esm --jsx=automatic --packages=external --outfile=/app/lineHops.mjs && node /app/hops.test.mjs'
```

### Open questions

See the [review](../line-crossings-review.md#open-questions-for-the-owner): what "arrow for
cardinality" should add, whether hops should default to on for existing diagrams, and the hop size.

---

## Present mode

**Version 2, applied 2026-10-16** (copied into `src/` and rebuilt by Claude at the owner's request). Findings: [`../presentation-mode-review.md`](../presentation-mode-review.md). Date: 2026-10-15.

Version 1 (canvas covering the whole window, Present button in the header) was copied into
`src/` and rebuilt. The owner then asked for this instead: **in Present mode, hide only the
left and right tool panels, and don't change the header.** These files are full copies, so
copying them over `src/` replaces version 1 completely. `styles.css` is unchanged from version 1.
To see what changes:

```bash
cd ~/projects/flowmira
for f in presentation.tsx components/Editor.tsx erd/ErdEditor.tsx; do
  diff -u frontend/src/$f audit-notes/fixes/frontend/src/$f; done
```

| Fix file | Real path | Change |
|---|---|---|
| `frontend/src/presentation.tsx` | same | **new file**: `usePresentation()` hook (enter/exit, Fullscreen API, F/Esc keys, fit on resize, restore the old zoom), `<PresentButton>` (top-right of the canvas) and `<PresentBar>` (Fit / Exit, fades when idle) |
| `frontend/src/styles.css` | same | `.presenting` block at the end hides handles, resize frame, `+`/grips and zoom controls, and lets pointer events pass through nodes/edges |
| `frontend/src/components/Editor.tsx` | same | **Header unchanged.** Present button on the canvas. While presenting, the Palette (left) and Inspector (right) are hidden, and the canvas is read-only (no select/drag/connect/delete/paste/undo keys/context menu). Selection and the arrow tool are cleared on enter |
| `frontend/src/erd/ErdEditor.tsx` | same | **Header unchanged.** Present button on the canvas. While presenting, the DBML panel (left) is hidden, and so are Show code / Auto-arrange and the table count. Read-only |

No backend changes. Rebuild after copying: `docker compose up -d --build`.

### How it behaves

- **Present** (top-right of the canvas) or the **F** key: the browser goes full screen, the header
  stays exactly as it is, the side panels go away and the diagram fits the space. F is ignored
  while typing in a field.
- **Esc**, **F** or **Exit** (top-right, fades after 2.5 s idle) → panels come back, at the same
  zoom and position as before.
- While presenting, drag to pan and scroll to zoom. The canvas can't be edited, and arrow animations keep running.
- The header's own buttons (Undo/Redo, Save, Export…) still work while presenting, because the
  header was left as it is.
- The panels are hidden, not removed, so things like the Palette's open section stay as they were.
- If the browser refuses full screen (e.g. inside an iframe), the side panels are still hidden.

### What was tested

| Check | Result |
|---|---|
| Throwaway copy (source + these fixes) in `/tmp`; `docker build --target build` → `tsc -b` (strict) + `vite build` | ✅ passes (v1 and v2) |
| `.presenting …` rules present in the built CSS bundle | ✅ |
| `<header>` in both editors identical to the original (pre-v1) header | ✅ |
| Real stack on :8080 | ✅ v2 rebuilt 2026-10-16: frontend container recreated, HTTP 200, `.presenting` code in the served bundle |
| Clicking through it in a browser (full screen, Esc, F, fit, zoom restored, dark theme, ERD) | ❌ **not done**. Please try it after applying |

### Open questions

See the [review](../presentation-mode-review.md#open-questions-for-the-owner): hide the cursor when
idle? Force document colours? Add a step-through-the-lanes mode?

---

## `.flowmira` export / import / backup (applied 2026-10-15)

Findings: [`../backup-export-review.md`](../backup-export-review.md). Date: 2026-10-15.

Every file here is a **full copy** of the real file with the changes marked
`// ── NEW ──` / `// ── FIX ──` (`#` in Python, `{/* */}` in JSX). Copy each one over its real
path, or diff it against the real file first:

```bash
cd ~/projects/flowmira
diff -u frontend/src/components/Editor.tsx audit-notes/fixes/frontend/src/components/Editor.tsx
```

## Files

| Fix file | Real path | Change |
|---|---|---|
| `backend/app/schemas.py` | `backend/app/schemas.py` | `DiagramCreate` accepts optional `created_at` / `updated_at` |
| `backend/app/routers/diagrams.py` | `backend/app/routers/diagrams.py` | `create_diagram` uses those dates when given |
| `erd/app/schemas.py` | `erd/app/schemas.py` | `DocumentCreate` accepts optional `created_at` / `updated_at` |
| `erd/app/routers/erd.py` | `erd/app/routers/erd.py` | `create_document` uses those dates when given |
| `frontend/src/backup.ts` | `frontend/src/backup.ts` | **new file**: the `.flowmira` format, back up everything, parse and import |
| `frontend/src/types.ts` | `frontend/src/types.ts` | `DiagramCreate` gets optional dates |
| `frontend/src/erd/api.ts` | `frontend/src/erd/api.ts` | `erdApi.create` gets optional dates |
| `frontend/src/components/ExportMenu.tsx` | same | New items "Flowmira file (.flowmira)" (always) and "DBML (.dbml)" (when `canDbml`), with a line above them |
| `frontend/src/components/Editor.tsx` | same | Export → .flowmira; the save data is pulled out into `currentData()` and shared with Save |
| `frontend/src/erd/ErdEditor.tsx` | same | Export → .flowmira and .dbml |
| `frontend/src/components/DiagramList.tsx` | same | New "Backup and restore" section: **Back up everything**, **Import .flowmira file** |

No database migration is needed, since the columns already exist. Rebuild everything after copying:
`docker compose up -d --build`.

## 1. Keep original dates on import (backend + erd)

`created_at` / `updated_at` are optional on create. When they're missing, behaviour is
unchanged (the model default sets "now"). Normal "New diagram" never sends them.
After an imported diagram is edited, `updated_at` moves to now as usual (`onupdate`), and
`created_at` stays original.

## 2. The `.flowmira` file (`frontend/src/backup.ts`)

Plain JSON: `{ format: "flowmira", version: 1, exported_at, app_version, diagrams: [...], erds: [...] }`.
A single diagram and a full backup use the same layout, so one importer reads both.

- **Export** writes what's on screen, unsaved changes included. For diagrams, Save and Export
  build the data with the same `currentData()`, so they can't drift apart.
- **Import** only *adds*. It never overwrites or deletes, so importing the same file twice gives duplicates.
- One bad entry doesn't stop the rest. Each problem is listed under the result message, e.g.
  `"Fish": Unknown template 'fishbone'` or `damaged entry, skipped`.
- Files from a newer format version are refused with "Update Flowmira, then import it again".
- Passwords: they were never stored, so they're never exported. On import, any `password` key in
  `source_info` is dropped in the browser, and the ERD API drops it again (existing code).
- Database-sourced ERDs come back view-only. "Refresh from database" asks for the password as before.
- If the ERD service is down, "Back up everything" still saves the diagrams and says the ERDs
  were left out.

## 3. Export menu / editors

`ExportKind` gains `"flowmira"` and `"dbml"`. These don't take a picture, so they skip the
"Add something to the canvas" check and the canvas capture.

## 4. Home page

The new section goes at the bottom, after the ERD section. After an import, the diagram list
reloads and the ERD section remounts (`key`) so it reloads too.

## What was tested

I tested on a throwaway copy (source + these fixes) running as a separate Docker stack
(`fmtest`, port 18080, its own volume). The real Flowmira on :8080 wasn't touched.

| Check | Result |
|---|---|
| `docker compose build`, including frontend `tsc -b` (strict) + `vite build` | ✅ passes |
| `POST /api/diagrams` with dates → stored and returned as sent | ✅ |
| `POST /api/diagrams` without dates → "now" (normal create unchanged) | ✅ |
| Unknown template → `400 Unknown template 'fishbone'` (shown as an import problem) | ✅ |
| `POST /api/erd/documents` with dates + `password` in source_info → dates kept, password dropped | ✅ |
| List order follows the original dates | ✅ |
| Editing an imported diagram → `updated_at` = now, `created_at` kept | ✅ |
| Invalid date string → 422 from the API (the importer drops invalid dates first) | ✅ |
| `erd/tests/test_erd.py` | ✅ 13 passed |

**Not tested:** clicking through the new buttons in a browser (Export → .flowmira,
Back up everything, Import). The TypeScript compiles, but the UI flow itself hasn't been exercised.
Suggested manual check after applying:
1. Open a diagram, move a shape **without saving**, Export → Flowmira file.
2. Home → Back up everything. Open the file in a text editor and check that every diagram and ERD is listed.
3. Delete one diagram, Import the backup, and check that everything is back with the original "edited" dates
   (duplicates of the rest are expected).
4. Import a random `.json` file and check for the "This isn't a Flowmira file" message.

## Open questions

1. Duplicates on re-import are by design (safe). Do you want a "skip ones that already exist"
   option later? That needs a rule for "same", e.g. title + created_at.
2. Should "Back up everything" also run automatically, e.g. a nightly `pg_dump` on the server?
   That's out of scope here; see the server-side backup section in the review note.
