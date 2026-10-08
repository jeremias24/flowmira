# Flowmira — template-driven diagram editor (process improvement + database ERDs)

> Claude Code reads this file at the start of every session in this project.
> Keep it short and true. Put long write-ups in `audit-notes/` and link them here.
> Update it when a requirement, decision, or environment changes.

## 1. Requirements (why this exists)

- **Purpose:** diagram editor for process-improvement and software work (SIPOC, DMAIC, Swimlane,
  Flowchart, Architecture, Personas) plus database ERDs (from a live schema or DBML)
- **Users:** <TODO>
- **Owner / requester:** <TODO>
- **In scope:** see `README.md`
- **Out of scope:** <TODO>
- **Source of requirements:** <TODO>

## 2. Design (how it is built)

- **Stack:** FastAPI + SQLAlchemy (Python), React + TypeScript + Vite + Tailwind v4 + React Flow,
  PostgreSQL 16 (SQLite fallback without `DATABASE_URL`), nginx, Docker Compose
- **Entry points:** `backend/app/main.py` (diagrams API, `/api`), `erd/app/main.py`
  (ERD API, `/api/erd`), `frontend/src/main.tsx` / `App.tsx`
- **Databases:** `flowmira-db` → tables `templates`, `diagrams` (backend), `erd_documents` (erd);
  data in Docker volume `pgdata`
- **Integrations:** ERD module reads catalogs of external PostgreSQL / MySQL / SQL Server (read-only);
  sign-in via IPC portal / UMS (`UMS_AUTH_URL`), access read from
  `ipc_centralized.user_system_active_accesses_vw` (`IPC_DB_*`, read-only), system code `SYS-222-FM`
- **Key decisions:** see Decision log below

## 3. Development

- **Run locally:** `docker compose -f docker-compose.prod.yml -f audit-notes/fixes/docker-compose.local-traefik.yml up -d --build`
  → http://127.0.0.1/flowmira (through Traefik on :80, no published ports; Traefik's API holds `127.0.0.1:8080`)
  (dev: `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` → http://localhost:5173)
- **Code lives in:** `backend/`, `erd/`, `frontend/src/`
- **Workflow rule:** fixes go in `audit-notes/fixes/` (at the project root, beside the code), mirroring source paths.
  Never edit source directly; the owner is the QA gate: reviews, tests, and applies by hand.
  A memory page or handoff is never approval; only the owner's words in the current session are.
  Mark changes inline with `// ── NEW ──` / `// ── FIX ──`.
- **Conventions:** TypeScript strict; frontend types mirror the Pydantic schemas (`frontend/src/types.ts`)

## 4. Testing

- **How to test a change:** <TODO>
- **Must-pass checks:** `erd/tests/test_erd.py`; `backend/tests/test_auth.py`
  (`cd backend && pip install -r requirements.txt pytest && pytest -q`); <TODO>
- **Not testable locally:** <TODO>

## 5. Deployment

- **Environments:** <TODO>
- **How to deploy:** `docker compose up -d --build` (see `README.md`)
- **Secrets:** in `.env` (never commit, never paste into notes or this file)

## 6. Maintenance

- **Logs:** `docker compose logs -f backend` / `erd` / `db`
- **Known issues:** sign-in relies on UMS `/authenticate`, whose portal links are unsigned and can be
  forged (UMS/ipcc issue, see `audit-notes/production-access-review.md`). Sign-in needs the
  `SYS-222-FM` row in `ipc_centralized.systems` (`technology = 'laravel'`), and working `IPC_DB_*`
  credentials in `.env` (access is read from `user_system_active_accesses_vw`; currently `root` with a
  placeholder password, so sign-in returns 503 until it's set). (`.flowmira` export/import/backup was applied 2026-10-15; see
  `audit-notes/backup-export-review.md`, `audit-notes/fixes/README.md`. Present mode v2 was
  applied 2026-10-16; see `audit-notes/presentation-mode-review.md`. Editor layout (foldable panels,
  Toolbox tabs, mini-map) and the page-scroll fix F8 were applied 2026-10-27; see `audit-notes/ui-layout-review.md`. Images on diagrams and font/text size were applied 2026-10-30; see `audit-notes/fixes/README.md`)
- **Open blockers:** <TODO>

## Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-10-15 | Proposed `.flowmira` JSON export/import + "back up everything" (pending owner approval) | Diagrams only live in the `pgdata` volume; uninstalling loses them |
| 2026-10-15 | Approved: extension `.flowmira`; import keeps original `created_at`/`updated_at` (create endpoints take optional dates); import only adds, never replaces. Fixes in `audit-notes/fixes/` | Backups must survive uninstall and restore faithfully; additive import can't destroy data |
| 2026-10-15 | Fixes applied to source and `docker compose up -d --build` run on :8080, by Claude at the owner's request | Owner asked for it to be applied |
| 2026-10-15 | Proposed "Present" mode: full-screen, read-only, diagram-only view in both editors (pending owner approval). Fixes in `audit-notes/fixes/`, see `audit-notes/presentation-mode-review.md` | Owner wants to present diagrams without the editor UI |
| 2026-10-15 | v1 of Present mode applied by the owner. Revised to v2: Present hides only the left/right tool panels; the header stays and isn't modified; the Present button is on the canvas (pending owner approval) | Owner: "tools must not be show right and left only do not modify header" |
| 2026-10-15 | Goal: integrate OneSign V2 approvals like Atlas/Athena. Review written (`audit-notes/onesign-v2-review.md`); design pending owner answers (requester identity, approvers, system code, callback URL) | Owner's stated real goal for Flowmira |
| 2026-10-16 | Present mode v2 applied to source (`Editor.tsx`, `ErdEditor.tsx`) and `docker compose up -d --build` run on :8080, by Claude at the owner's request | Owner: "apply it and rebuild" |
| 2026-10-16 | Proposed line hops (electrical "not connected" arc where lines cross) in both editors, on by default, + Elbow/Curved switch for ERD lines (pending owner approval). Fixes in `audit-notes/fixes/`, see `audit-notes/line-crossings-review.md`. Cardinality addition waiting on owner's choice | Owner: "arrow curve to avoid connection confusion… not connected symbol for electronics" |
| 2026-10-16 | Line hops + curved ERD lines applied to source and `docker compose up -d --build` run on :8080, by Claude at the owner's request. Hops default on for existing diagrams too (open question not yet answered) | Owner: "apply it and rebuild" |
| 2026-10-16 | Cardinality = crow's-foot arrow ends in the diagram editor (One, Zero or one, Many, One or many, Zero or many per end; replaces the arrowhead). Proposed, pending owner approval; fixes in `audit-notes/fixes/` | Owner: "use crow's foot arrowheads in diagram editor" |
| 2026-10-16 | Crow's-foot arrow ends applied to source and `docker compose up -d --build` run on :8080, by Claude at the owner's request | Owner: "apply it and rebuild" |
| 2026-10-19 | ai-memory scope pinned in `.ai-memory.toml` at the project root: `workspace = "default"`, `project = "flowmira"`. Pass both on every ai-memory call for this project | memory was falling back to `default`/`scratch`; this keeps flowmira's memory in its own project, and this client must name both on every call |
| 2026-10-20 | Proposed production deployment with portal login (server-verified) and roles: Regular User = diagrams only; System Owner = everything (ERD, backup/import). Roles enforced on the server (FastAPI dependency + nginx `auth_request` for `/api/erd/`). Pending owner answers; see `audit-notes/production-access-review.md` | Owner: "regular users they can use only diagrams nothing else only users with system owner can use all" |
| 2026-10-20 | Flowmira's portal system code is `SYS-222-FM` (matched against `accesses[].systemReferenceCode`; env `FLOWMIRA_SYSTEM_CODE`) | Owner: "system_reference_code will be SYS-222-FM" |
| 2026-10-20 | Proposed login = Athena's UMS pattern in FastAPI: server calls UMS `/authenticate/<credentials>` + `/verify_api_token`, exact `userType` match for `SYS-222-FM`, own signed cookie, periodic re-check. No passwords in Flowmira. Not copying Atlas's browser-trusted session. Pending owner approval | Owner shared `ipc_centralized.systems` / `user_system_accesses` and asked to review Atlas for a FastAPI login |
| 2026-10-20 | `SYS-222-FM` will be added to `ipc_centralized.systems` with `accepted_user_type_id = [2,3,5,13]` (Super User, System Owner, Regular User, Administrator). System Owner (id 3) = full; Regular User (5) = diagrams only; others blocked. Rollout: test locally first, production after | Owner: "i will add SYS-222-FM in systems [2,3,5,13] … we will test here it first before on production" |
| 2026-10-20 | Roles: full = System Owner (3) + Super User (2); diagrams only = Regular User (5) + Administrator (13). Each user sees only their own diagrams (owners see all); existing unowned diagrams = owners only; import = owners only | Owner's answers to the review questions |
| 2026-10-20 | Sign-in/roles fixes written in `audit-notes/fixes/` (UMS login server-side, `auth_sessions` table, owner columns on `diagrams`, nginx `auth_request` for `/api/erd/`); tested on a throwaway stack with a stub UMS. Not applied, pending owner review. Found: UMS `/authenticate` links are unsigned base64 (can be forged for any username); reported, not fixed (UMS/ipcc are separate projects) | Owner asked for production with roles; "test here first before on production" |
| 2026-10-20 | Sign-in/roles applied to source and `docker compose up -d --build` run on :8080, by Claude at the owner's request. `.env` got `UMS_AUTH_URL` (local UMS `host.docker.internal:8001/api/v1`) and `APP_ORIGIN`. Flowmira now needs a portal sign-in for everything except `/api/health`. Production still pending (Q7, UMS link issue Q10) | Owner: "apply it and rebuild" |
| 2026-10-20 | Proposed: access (role) read from `ipc_centralized.user_system_active_accesses_vw` at sign-in and every re-check, via a SELECT-only account (`IPC_DB_*`); UMS only identifies the user. Fix in `audit-notes/fixes/` (update 2), tested on a throwaway MySQL with the real view. Pending owner approval | Owner: "use this for checking the access" |
| 2026-10-20 | Applied and rebuilt: the view is the **only** source of access (UMS fallback removed, `IPC_DB_HOST` required). `.env` has `IPC_DB_USER=root` with a placeholder password the owner will replace (later: a SELECT-only account). Sessions to ipc_centralized are `READ ONLY` | Owner: "just use the view i sent … i will change it later root password" |
| 2026-10-20 | Access source changed to `CALL ipc_centralized.sp_user_system_active_accesses(userId, employeeId, userClassId)` (staged, and found already in `src/` and running). Live check: works read-only; `SYS-222-FM` is `is_common = 1`, so every class-1 user is Regular User and the procedure reports id 5 even for owners. Owner decision pending (Q11: match by type name, or `is_common = 0`) | Owner: "use this ipc_centralized.sp_user_system_active_accesses this is the correct" |
| 2026-10-20 | Production (`flowmira-prod`, Traefik `/flowmira`): reach UMS through Traefik on the server address (`UMS_AUTH_URL=http://172.21.0.216/<UMS path>/api/v1`); MySQL is a separate application, connected only through `IPC_DB_*` in `.env` (no shared Docker network) | Owner: "we can use traefik"; "remove mysql because we have separate application for that just connect the env" |
| 2026-10-20 | Production `IPC_DB_PASSWORD` is intentionally blank; staged `docker-compose.prod.yml` uses `${IPC_DB_PASSWORD?…}` (present, blank allowed) instead of `:?` | Owner: "i intended to blank the password" |
| 2026-10-20 | Production backend joins `traefik-network` and calls UMS's nginx directly (`UMS_AUTH_URL=http://ums-ums-nginx-1/api/ums/v1`): the host firewall on `ipcapps` (Oracle Cloud) rejects container → host-IP traffic (`Errno 113 No route to host`) | Found in production logs |
| 2026-10-26 | Dev stack runs with `audit-notes/fixes/docker-compose.dev-ports.yml` (backend `:8010`, ERD `:8012`; `:8011` is bams-local-fastapi), because root `docker-compose.yml` is now the prod stack and the portal stacks hold `:8000` (ipcc-nginx) / `:8001` (ums-nginx). Proposed, not applied | Dev `up` failed: "Bind for 0.0.0.0:8000 failed: port is already allocated" |
| 2026-10-27 | Proposed editor layout changes: collapsible side panels, Inspector opens on select in free layouts, Toolbox tabs, MiniMap, 12px minimum text, drawers below 768px (pending owner answers). See `audit-notes/ui-layout-review.md` | Owner: "flowchart module has the problem of viewing please check the right and left tools" |
| 2026-10-27 | Layout fixes written in `audit-notes/fixes/` (new `SideDock.tsx`; `Editor.tsx`, `Palette.tsx`, `Inspector.tsx`, `ErdEditor.tsx`, `styles.css`), including the ERD mini-map and drawer. Throwaway build passes; not checked in a browser; not applied, pending owner review | Owner: "yes please" to all proposed changes |
| 2026-10-27 | Bug F8 (editor page taller than the window, scrolls): `sr-only` labels in the Toolbox are positioned against the page. Fix = `relative` on the panel scroll containers + `relative md:overflow-hidden` on both editor roots; staged in `audit-notes/fixes/` (also works alone on today's `src/`, 4 class edits). Mechanism confirmed in headless Chrome; not checked in the real app; not applied | Owner's bug report: "the diagram editor layout doesn't fill the browser window" |
| 2026-10-27 | Approved: apply the layout changes + F8. Narrow screens keep stacking (slide-over drawers dropped). Mini-map off by default. Previewed in headless Chrome with a fake API (page = window height at every desktop size and zoom). Copying into `src/` was blocked by a permission check; the owner runs `apply.sh` (see `audit-notes/fixes/README.md`) | Owner: "yes please"; F8 report: "Don't change the mobile (narrow screen) layout, where stacking is intended" |
| 2026-10-27 | Layout changes + F8 applied to source (`SideDock.tsx` new; `Editor.tsx`, `Palette.tsx`, `Inspector.tsx`, `ErdEditor.tsx`, `styles.css`) and `docker compose up -d --build frontend` run on :8080, by Claude at the owner's request. Served bundle checked; not yet checked signed in | Owner: "please apply it now" |
| 2026-10-30 | Local target is http://127.0.0.1/flowmira with no ports: `docker-compose.prod.yml` + `audit-notes/fixes/docker-compose.local-traefik.yml` (project `flowmira-prod`, fresh volume, `UMS_AUTH_URL=http://ums-nginx/api/v1`, `COOKIE_SECURE=0`). No source or `.env` edits. Running and checked up to sign-in. `SYS-222-FM` was missing from the local `systems` table; added as id 51 with the owner's approval (`audit-notes/fixes/add-flowmira-system-row.sql`). The current procedure keeps `usa.user_type_id` first, so Q11 no longer applies | Owner: "make this working and do not use port our target is 127.0.0.1/flowmira" |
| 2026-10-30 | Images on diagrams: new `image` shape in all six templates (Add image, paste, drop). Stored inside the diagram as data URLs, shrunk to 1600 px; PNG/JPG/WebP/GIF first frame, no SVG; everyone who can edit can add them. Home list stops reading diagram data. Staged in `audit-notes/fixes/`, tested in headless Chrome with a fake API | Owner: "yes please" to the proposal; wants images on diagrams and flowcharts |
| 2026-10-30 | Images applied to source (10 files) and the local-Traefik stack rebuilt on http://127.0.0.1/flowmira, by Claude at the owner's request. Served bundle checked; not yet checked signed in | Owner: "apply it and rebuild" |
| 2026-10-30 | Font and text size for shapes and arrow labels, in the Details panel; applies to everything selected. 7 system fonts + Default, sizes 10-72, saved per item as a font key. Staged in `audit-notes/fixes/`, tested in headless Chrome with a fake API; not applied, pending owner review | Owner: "enable to change font and adjust the size" |
| 2026-10-30 | Font and text size applied to source (8 files) and the local-Traefik stack rebuilt on http://127.0.0.1/flowmira, by Claude at the owner's request. Served bundle checked; not yet checked signed in | Owner: "apply the font size and font family" |
| 2026-10-30 | `docker-compose.prod.yml` sets `container_name`: `flowmira-prod-db`, `-backend`, `-erd`, `-frontend` (no Compose `-1` suffix). Applied and recreated locally, data kept; takes effect on production at its next deploy | Owner: "correct this -1 in the container name remove it" |
| 2026-10-30 | Shapes get 12 connection points (middle of each side + 25% and 75%), following the outline; middle dots keep their ids so existing arrows don't move; Details panel lists all 12. Diagrams editor only, ERDs unchanged. Staged in `audit-notes/fixes/`, tested in headless Chrome with a fake API; not applied, pending owner review | Owner: "shapes additional connetion point so i can connect it not on olny 4 points" |
| 2026-10-30 | 12 connection points applied to source (`anchors.ts` new; `ShapeNode.tsx`, `Inspector.tsx`, `styles.css`) and the local-Traefik frontend rebuilt on http://127.0.0.1/flowmira, by Claude at the owner's request. Served bundle checked; not yet checked signed in | Owner: "apply fixes please" |
| 2026-10-30 | Yellow arrow handle fixed for every elbow route (backward, same-side, mixed sides, lined up), via new `elbow.ts`. Unbent arrows draw as before. Staged in `audit-notes/fixes/`, tested in headless Chrome with a fake API; not applied, pending owner review | Owner: "Drag the yellow handle … is not working i want to adjust it so other arrow not covering" |
| 2026-10-30 | Yellow arrow handle fix applied to source (`elbow.ts` new; `FlowEdge.tsx`, `Inspector.tsx`, `styles.css`) and the local-Traefik frontend rebuilt on http://127.0.0.1/flowmira, by Claude at the owner's request. Served bundle checked; not yet checked signed in | Owner: "apply it and rebuild" |
| 2026-10-30 | Text color (shapes and arrow labels) and left/center/right alignment (shapes), in the Details panel; applies to everything selected. Main label only. Staged in `audit-notes/fixes/`, tested in headless Chrome with a fake API; not applied, pending owner review | Owner: "change the color of fonts also the align center, left and right" |
| 2026-10-30 | Text color and alignment applied to source (8 files) and the local-Traefik frontend rebuilt on http://127.0.0.1/flowmira, by Claude at the owner's request. Served bundle checked; not yet checked signed in | Owner: "apply the fixes please" |
| 2026-11-10 | Proposed Data Flow Diagram type + three Gane & Sarson DFD shapes (numbered process with header band, external entity, data store); the shapes are also offered in Flowchart. Staged in `audit-notes/fixes/`, tested in headless Chrome with a fake API; not applied, pending owner review | Owner: "add Data Flow Diagram module … i like this shape … can enter a label 0" |
| 2026-11-10 | Data Flow Diagram + DFD shapes applied to source (`dfd.ts`, `dfd.json` new; `flowchart.json`, `types.ts`, `shapes.tsx`, `ShapeNode.tsx`, `styles.css`, `Inspector.tsx`, `Editor.tsx`) and the local-Traefik backend + frontend rebuilt on http://127.0.0.1/flowmira, by Claude at the owner's request. Served bundle and seeded templates checked; not yet checked signed in | Owner: "apply it and rebuild" |
| 2026-11-10 | Keep the DFD shapes in the Flowchart toolbox as well as in the Data Flow Diagram type; don't remove them | Owner: "do not remove the DFD from flowchart i have a other plan there" |
| 2026-11-10 | Proposed Flowmira tab icon: `frontend/public/favicon.svg` (small flowchart: white box → yellow diamond → two boxes, on dark ink) + `<link rel="icon">` in `index.html`. Before this the tab showed another app's icon (Traefik sends root `/favicon.ico` elsewhere). Staged in `audit-notes/fixes/`, throwaway build checked; not applied, pending owner review | Owner: "change the icon of flowmira that related to application" |
| 2026-11-10 | Tab icon applied to source (`frontend/public/favicon.svg` new; `frontend/index.html`) and the local-Traefik frontend rebuilt on http://127.0.0.1/flowmira, by Claude at the owner's request. Served page and icon checked | Owner: "please apply the changes" |
| 2026-11-10 | Proposed: refresh keeps the open diagram/ERD. Address = `/flowmira/diagram/<id>` / `/flowmira/erd/<id>` (replaceState, Back button unchanged); editors ask before refresh/close with unsaved changes. Staged in `audit-notes/fixes/` (`App.tsx`, `Editor.tsx`, `ErdEditor.tsx`), 14 headless Chrome checks pass with a fake API; not applied, pending owner review | Owner: "avoid the application go back to the home page when user refresh the browser" |
| 2026-11-10 | Refresh fix applied to source (`App.tsx`, `Editor.tsx`, `ErdEditor.tsx`) and the local-Traefik frontend rebuilt on http://127.0.0.1/flowmira, by Claude at the owner's request. Served bundle checked; not yet checked signed in | Owner: "apply fixes" |
| 2026-11-10 | Fishbone = auto-arranged layout (new layout type `fishbone`: bones are zones, alternating above/below the spine; causes placed along the bone; head = undeletable, unmovable shape `fishbone-head`), not a starter drawing | Owner chose "Auto-arranged bones" |
| 2026-11-10 | Proposed Fishbone (Ishikawa) template + Flowchart toolbox with all 33 shapes and foldable categories (remembered per type in the browser, all shown by default). Staged in `audit-notes/fixes/`, 41 + 14 headless Chrome checks pass with a fake API; not applied, pending owner review | Owner: "add the fish bone template … if i select flow chart all shapes must be there, but users can hide the category" |
| 2026-11-10 | Fishbone template + full Flowchart toolbox applied to source (`fishbone.json`, `fishbone.ts` new; `flowchart.json`, `templateEngine.ts`, `types.ts`, `styles.css`, `ZoneNode.tsx`, `Editor.tsx`, `Palette.tsx`, `LaneEditor.tsx`) and the local-Traefik backend + frontend rebuilt on http://127.0.0.1/flowmira, by Claude at the owner's request. Seeded templates and served bundle checked; not yet checked signed in | Owner: "please apply now" |
| 2026-11-10 | Diagram/ERD addresses use a server-encrypted ref (AES-SIV, key `FLOWMIRA_ID_KEY` in `.env`, required by compose; same key for backend and erd): `/flowmira/diagram/<32 chars>`. API keeps numeric ids + new `by-ref` lookups with the same access checks; old number addresses go home. Staged in `audit-notes/fixes/`, tested; not applied, pending owner review. Found: `backend/tests/test_auth.py` has 18 failures on today's source (tests stub the old view, code calls the procedure) | Owner: "can you make the last parameter encrypted?" and chose "Encrypted on the server" |
| 2026-11-10 | Encrypted addresses applied to source (15 files; key lines added to `docker-compose.prod.yml`, `.env.example`), a generated `FLOWMIRA_ID_KEY` added to the local `.env`, and the local-Traefik backend + erd + frontend rebuilt, by Claude at the owner's request. Same key in both services checked; not yet checked signed in. Production `.env` still needs its own key | Owner: "can you apply the fixes now?" |
