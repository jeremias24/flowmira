# Flowmira v1

Template-driven diagram editor for process-improvement and software work, in two modules:

| Module                | Container                       | What it does                                                                                  |
| --------------------- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| **Flowmira Diagrams** | `flowmira-diagram` (`backend/`) | SIPOC, DMAIC, Swimlane, Flowchart, Architecture, Personas                                     |
| **Flowmira ERD**      | `flowmira-erd` (`erd/`)         | Database diagrams: read a live database's schema (view only), or write DBML like dbdiagram.io |

Shared: `flowmira-frontend` (React app + nginx, `frontend/`) and `flowmira-db` (PostgreSQL for Flowmira's own data).

- **Backend:** FastAPI + SQLAlchemy (SQLite by default, set `DATABASE_URL` for PostgreSQL)
- **Frontend:** React + TypeScript (strict) + Vite + Tailwind CSS v4 + React Flow (`@xyflow/react`)

## Run with Docker (recommended)

```bash
cp .env.example .env          # then change POSTGRES_PASSWORD
docker compose up -d --build
```

Open http://localhost:8080. Three containers run: `frontend` (nginx serving the React build
and proxying `/api` to the backend), `backend` (FastAPI), and `db` (PostgreSQL, data kept in
the `pgdata` volume).

Development with hot reload:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

Frontend at http://localhost:5173, API docs at http://localhost:8000/docs. Edits in
`backend/app`, `backend/templates`, and `frontend/src` reload automatically.

Useful commands:

```bash
docker compose logs -f backend      # diagrams API logs (container flowmira-diagram)
docker compose logs -f erd          # ERD API logs (container flowmira-erd)
docker compose restart backend      # reload after adding a template JSON
docker compose down                 # stop (data kept)
docker compose down -v              # stop and DELETE the database volume
```

## Troubleshooting

**"Can't reach the API (502)"** — nginx is up but the backend isn't answering.

```bash
docker compose ps                 # is backend "healthy"? restarting?
docker compose logs backend       # the real error is here
docker compose logs db
```

Common causes:

- **Password authentication failed:** the `pgdata` volume was created with a different
  password/user than your current `.env`. Postgres only reads those on first start.
  Either put the old values back in `.env`, or (loses data) `docker compose down -v`.
- **Old images:** `docker compose build --no-cache && docker compose up -d`.

## Run without Docker

```bash
# 1. Backend  (http://localhost:8000, docs at /docs)
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# 2. Frontend (http://localhost:5173)
cd frontend
npm install
npm run dev
```

## Toolbox (left panel)

- **Shapes:** card, process, decision, start/end, data, document, subprocess, database, note,
  connector, text. Drag one onto the canvas, or click it to add at the centre of the view.
- **Arrows, two ways:**
  1. Click **Draw arrow**, then click the start shape and the end shape. Repeat for more
     arrows; press Esc or **Done** to stop.
  2. Hover a shape, drag from a dot on its edge, and release anywhere on another shape.
     Pick the line style (straight, elbow, curved), arrowheads and dashed before drawing.
     If a template restricts arrows (`rules.edgesOnlyWithin`), a message says why an arrow is blocked.
- **Icons:** 60 icons (people, organizations, logistics, documents, technology, money,
  time, status, improvement) with search. Drag or click to add; they take the column's
  colour, get a caption, can be resized, recoloured with a background tile, and connected
  with arrows like any shape. Icons come from Lucide (MIT licence); add more in
  `frontend/src/icons.tsx`.
- Double-click a shape to edit its text; drag the yellow frame corners to resize.
- Select an arrow to add a label (e.g. Yes/No) or change its style in the right panel.
- Each template chooses which shapes appear in the toolbox (`palette` in its JSON).

## What v1 does

- Diagram list: create, open, delete
- SIPOC editor: 5 fixed columns, add items with **+**, drag items between columns (they snap in)
- Inspector panel: label, owner, requirement/CTQ, notes (fields come from the template)
- Arrows between steps, allowed only inside the Process column (a template rule)
- Save (button or Ctrl/Cmd+S), unsaved-changes warning, PNG export
- Delete/Backspace removes selected items or arrows

## Personas

- **Personas diagram type:** a board of persona cards (avatar, name, role, quote, goals,
  pain points) you can connect with arrows.
- **Personas section in the toolbox** (all diagram types): 12 ready-made people. Switch
  between **Avatar** (a person with a caption, great in SIPOC Suppliers/Customers) and
  **Card** (a full persona card).
- Select an avatar or card to customise skin tone, hair, hair colour, clothes, accessory
  (glasses, tie, headset, hard hat, cap) and background. Avatars are original SVG
  illustrations drawn in `frontend/src/avatars.tsx`; add presets there.

## Flowmira ERD (database diagrams)

On the home page, **Database diagrams (ERD)**:

- **Connect to a database** (PostgreSQL, MySQL / MariaDB, SQL Server): Flowmira reads the
  _structure_ (tables, columns, primary/foreign keys, unique constraints, indexes, comments)
  and draws the ERD. **View only**: to see changes, use **Refresh from database**; to edit,
  **Make an editable copy**.
- **New DBML diagram**: write [DBML](https://dbml.dbdiagram.io/docs) on the left, the ERD
  updates live on the right (errors point to the line). Same language as dbdiagram.io, so
  you can paste DBML from there and back.
- Crow's-foot notation, key / link icons for primary / foreign keys, `*` for NOT NULL,
  hover a column for details, click a table to highlight its relationships, drag tables,
  **Auto-arrange**, export PNG / transparent PNG / PDF, light & dark theme.

### How the database connection stays safe

- Only the database **catalog** is queried (SQLAlchemy inspector); your table **data** is
  never read. PostgreSQL and MySQL sessions are forced **read-only** with query timeouts.
  A database user with read-only rights is all Flowmira needs.
- The **password is used once and never stored** (not in the database, not in logs, not in
  error messages). Refreshing asks for it again.
- Cloud-metadata / link-local addresses are always blocked. In production, set
  `ERD_ALLOWED_HOSTS` in `.env` to the servers Flowmira may inspect, e.g.
  `ERD_ALLOWED_HOSTS=db.company.local,*.company.local,10.0.0.0/8`.
- Database on the same machine as Docker? Just enter **`localhost`**: in Docker, flowmira-erd
  maps it to `host.docker.internal` (your computer). The database must accept network
  connections and allow a user from Docker's network:
  - MySQL/MariaDB: `bind-address = 0.0.0.0` in `my.ini`, and
    `CREATE USER 'fluix_reader'@'172.%' IDENTIFIED BY '…'; GRANT SELECT, SHOW VIEW ON yourdb.* TO 'fluix_reader'@'172.%';`
  - PostgreSQL: `listen_addresses = '*'` and in `pg_hba.conf`
    `host all all 172.16.0.0/12 scram-sha-256`
  - Windows: allow the port (3306 / 5432 / 1433) in Windows Firewall.
- Limits: `ERD_MAX_TABLES` (default 400), `ERD_CONNECT_TIMEOUT` seconds (default 10).

### ERD API (`erd/`, FastAPI, port 8001, served under `/api/erd/`)

| Endpoint                                                                |                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `GET /api/erd/engines`                                                  | database types and whether their drivers are installed             |
| `POST /api/erd/introspect`                                              | connection details → `{dbml, tables, refs, warnings, source_info}` |
| `GET/POST /api/erd/documents`, `GET/PUT/DELETE /api/erd/documents/{id}` | saved ERDs (DBML + layout)                                         |
| `POST /api/erd/documents/{id}/refresh`                                  | re-read a database ERD (credentials required again)                |

Tests: `cd erd && pip install -r requirements.txt pytest httpx && ERD_ALLOW_SQLITE=1 pytest -q`.

Frontend code lives in `frontend/src/erd/` and loads only when an ERD is opened. DBML parsing
uses `@dbml/core` (the dbdiagram.io parser, Apache-2.0); only its DBML grammar is loaded
(~54 KB gzipped). Layout uses `@dagrejs/dagre` (MIT).

## Resizing columns and lanes

Works in every template with columns or lanes (SIPOC, DMAIC, Swimlane):

- **Drag an edge.** Hover a column/lane to see its grips.
  - Columns: **right edge** = that column's width; **bottom edge** = height of all columns.
  - Lanes: **bottom edge** = that lane's height; **right edge** = length of all lanes.
    Zones can't be made smaller than the shapes inside them.
- **Automatic:** adding, dropping, dragging or resizing a shape past the end grows the
  column/lane instead of squeezing the shape back in.
- **Size panel:** click empty canvas; type an exact height/length, **Fit to content**
  (snug fit, never below the template's size) or **Reset** (template sizes, never cutting
  off shapes).
- Sizes are saved per diagram (`data.layout`: `length` + per-zone `sizes`).

## Swimlane

- **Lanes** (one per role, team or system) run left to right; steps snap into lanes and
  arrows show hand-offs between them.
- **Edit lanes per diagram:** click an empty spot on the canvas, then use **Lanes** in the
  right panel: rename, recolour, reorder, add, remove (a lane with shapes can't be removed).
  Lanes are saved with the diagram (`data.zones`).
- **Quick building:** use a lane's **+**, or select a step and click a toolbox shape: it's
  added right after it in the same lane, lined up on the lane's centre line.
- Template options behind this: `"layout": {"type": "rows", "headerWidth": 140, …}`,
  `"editableZones": true`, `"zoneNoun": "lane"`.

## Shapes by category

The toolbox groups shapes into **Basic**, **Flowchart** and **Process (BPMN)**, ordered by
the template's palette (BPMN first in Swimlane). BPMN shapes: Task, Start / End / Timer /
Message events, Decision and Parallel gateways. Events and gateways show their label below
the symbol and connect at the symbol. Add categories/shapes in `frontend/src/shapes.tsx`.

## Shape styling and arrangement

- **Opacity** (every shape, icon, avatar, persona card): slider in the right panel, 10–100 %.
- **Icon color:** icons are coloured themselves (no background tile). Default follows the
  column/lane colour.
- **Arrange:** Bring to front / forward / backward / Send to back in the right panel and
  right-click menu. Shortcuts: Ctrl+Shift+] / Ctrl+] / Ctrl+[ / Ctrl+Shift+[. Order is saved.

## Adjustable arrows

- **Sides:** select an arrow → **Leaves from** / **Enters at** (Top, Right, Bottom, Left)
  decides whether it runs horizontally or vertically.
- **Bend:** a selected elbow arrow whose ends face the same way (e.g. Right → Left, or
  Bottom → Top) shows a yellow handle on its middle segment; drag it (left/right or
  up/down) to move the bend, double-click or **Reset** to undo. Saved per arrow.

## Software shapes and the Architecture template

**Software** category: Server, Cloud, Database, Queue, Component, Service / API, Package,
Web app, Mobile app, User (UML actor), Class (UML), Firewall, Load balancer. The
**Architecture** diagram type puts them first; Flowchart includes the common ones too.

## Editing: copy, paste, undo

| Action             | Shortcut                        | Notes                                                                                                                                                                                                                |
| ------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copy / Cut / Paste | Ctrl+C / Ctrl+X / Ctrl+V        | Arrows between copied shapes come along. Works across diagrams and browser tabs; pasting into other apps gives the labels as text. Pasted shapes snap into the column/lane they land on.                             |
| Duplicate          | Ctrl+D                          | Copy + paste in one go, offset slightly.                                                                                                                                                                             |
| Select all         | Ctrl+A                          | Shift-drag a box or Ctrl-click to select several.                                                                                                                                                                    |
| Delete             | Delete / Backspace              |                                                                                                                                                                                                                      |
| Undo / Redo        | Ctrl+Z / Ctrl+Shift+Z or Ctrl+Y | Also toolbar buttons. Last 100 steps. History starts at the diagram as opened, so undo never goes past your last save. A drag or a typed label is one step; every paste, delete, new shape or arrow is its own step. |

Right-click a shape, arrow or empty canvas for the same actions. In text boxes the
shortcuts keep their normal text meaning. (On a Mac use ⌘ instead of Ctrl.)

## Animated arrows and GIF export

- **Animation per arrow:** select an arrow → **Animation**: _None_, _Flowing dashes_ or
  _Moving dots_. For new arrows, pick **Still / Dashes / Dots** in the toolbox.
- **Speed** (toolbox, or the arrow panel): **Slow** (20 px/s, 4 s loop), **Normal**
  (35 px/s, 3 s, default) or **Fast** (60 px/s, 2 s). One setting per diagram, so all
  animated arrows stay in sync; saved with the diagram (`data.settings.animationSpeed`).
- **Export → GIF, animated:** one seamless loop at the chosen speed (80 ms frames, max
  1600 px wide). Enabled once at least one arrow is animated.
- How it works (`frontend/src/flowAnimation.ts`): animation is driven by a _phase_ set
  from JavaScript, not CSS. The screen updates it every frame; the GIF export sets each
  frame's phase, captures it, and encodes with `gifenc` (loaded only when exporting a GIF).
  Dots and dashes travel a whole number of steps per loop, so the GIF loops seamlessly.
- Respects the system's "reduce motion" setting (arrows shown still on screen).

## Arrow colours and alignment

- **Arrow colour:** pick a colour in the toolbox's Arrows section before drawing, or select
  an arrow and use **Color** in the right panel (10 colours, custom picker, hex, or Default).
  Arrowheads match the line. A selected arrow still shows the yellow highlight on screen;
  exports always use the arrow's own colour.
- **Straight elbow arrows:** when two shapes are nearly lined up (within 10 px), Elbow
  arrows draw a straight line instead of a tiny step (`frontend/src/edges/ElbowEdge.tsx`).
- **Snap to align:** while dragging a shape near another shape's centre line (within 8 px,
  same column or free canvas), it snaps into line and a dashed guide appears.

## Fill colours

Select a shape and use **Fill** in the right panel (**Background** for icons, **Card color**
for persona cards):

- **Soft** colours (11) and **Strong** colours (10).
- **No fill**: transparent, only the outline and text.
- **Custom**: the rainbow button opens your system colour picker, or type a hex code
  (`#0E9F6E`, or short `#0a6` + Enter) for exact brand colours.
- Text colour adjusts automatically: white on dark fills, dark on light fills (whichever
  has more contrast). Palettes live in `frontend/src/colors.ts`.

## Themes

- **Light / System / Dark** switch on the home page and in the editor toolbar. The choice
  is remembered per browser; **System** follows the operating system and switches live.
- The app interface and canvas go dark, but **diagrams keep their document colours**
  (like paper on a dark desk), so exports are identical in every theme.
- Dark values are the same tokens redefined under `:root[data-theme="dark"]` in
  `styles.css`; fixed diagram colours use `--dg-*` variables. Use `dark:` in Tailwind
  classes for anything theme-specific.

## Export

**Export** menu in the editor toolbar:

- **PNG**: white background, 2× resolution.
- **PNG, transparent**: no background, for slides and documents.
- **PDF**: A4, orientation picked from the diagram's shape, centred with 10 mm margins,
  3× resolution for print. jsPDF loads only when you export a PDF.

Exports never include editing aids (selection, resize frame, connection dots, + buttons).

## Styling

- **Tailwind CSS v4** for the app layout: toolbar, toolbox, right panel, home page, forms.
  Shared pieces (Button, Field, Swatches, Segmented) live in `frontend/src/components/ui.tsx`.
- **Design tokens** are defined once in `frontend/src/styles.css` under `@theme`
  (`ink`, `ink-2`, `canvas`, `paper`, `line`, `mark`, `danger`). They become Tailwind
  utilities (`bg-ink`, `border-line`, `bg-mark` …) and CSS variables (`--color-ink` …).
- **Canvas styles stay plain CSS** (bottom of `styles.css`): shapes, columns, arrows and
  React Flow's own elements, which utility classes can't reach cleanly.
- Each template sets its colour with `"accent"` in its JSON (home tile and editor badge).

## TypeScript notes

- `frontend/src/types.ts` mirrors `backend/app/schemas.py` and the template JSON. Change both together.
- `npm run typecheck` checks types without building; `npm run build` runs `tsc` first, so a type error fails the Docker build too.
- Strict mode is on, including `noUncheckedIndexedAccess`.

## How the template engine works

Every diagram type is a JSON file in `backend/templates/`, loaded into the DB on startup.
The frontend never hardcodes SIPOC; it reads:

| Key       | Purpose                                             |
| --------- | --------------------------------------------------- |
| `layout`  | zone size, gaps, item height                        |
| `zones`   | the fixed regions (columns): id, label, hint, color |
| `shapes`  | default label + inspector fields for items          |
| `accent`  | the diagram type's colour (home tile, editor badge) |
| `palette` | shapes shown in the toolbox (omit for all)          |
| `rules`   | `itemsSnapToZone`, `edgesOnlyWithin: [zoneIds]`     |

Diagrams store only `items` (zone, x, y, label, fields) and `edges`. Zones are rebuilt from
the template on load, so improving a template updates every diagram that uses it.
Bump `version` in the JSON to push changes into an existing database.

**Included templates:** SIPOC, DMAIC, Swimlane, Flowchart, Architecture, Personas (`backend/templates/*.json`).
To add one, copy an existing file, change `key`, `name`, `accent` and the zones, then
restart the backend (`docker compose up -d --build backend`). No code changes needed.

**Card summaries:** on a field, `"showOnCard": true` shows its value under the card title;
`"cardLabel": "CTQ"` adds a prefix (`CTQ: …`). SIPOC shows owner + CTQ, DMAIC owner + tool.

## Suggested next steps

2. `feat/undo-redo` — history stack in the editor
3. `feat/row-layout` — `layout.type: "rows"` for swimlanes
4. `feat/fishbone-layout` — custom layout type with auto-positioned bones
5. Auth + per-user diagrams, then a template builder UI
