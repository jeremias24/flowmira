# Production deployment + role-based access: review and proposal

Status: **applied to the local stack 2026-10-20** (owner: "apply it and rebuild"). Production not yet. See
[`fixes/README.md`](fixes/README.md#sign-in-and-roles-ums-sys-222-fm). Nothing in `backend/`, `erd/` or
`frontend/` has been changed.
Date: 2026-10-20.

> Design note: the fix keeps sessions in a table (`auth_sessions`, cookie = random token, only its
> SHA-256 stored), not an HMAC-signed cookie as first sketched in §1. Sign-out and access removal
> take effect at once, and there's no signing secret to manage. So `FLOWMIRA_SESSION_SECRET` isn't
> needed.

## Request

> "deploy it on production for be able to users can use it … if regular users they can use only
> diagrams nothing else only users with system owner can use all"

## ⚠ Found while reviewing UMS: sign-in links can be made for anyone (affects every UMS system)

Read on 2026-10-20 in `~/projects/ums/src` and `~/projects/ipcc/src` (local copies; production may differ.
Please check).

- **Portal side:** `ipcc` `SystemWidget.vue` builds the link as
  `url.replace("{attribute}", MixinService.encrypt(JSON.stringify({userId, username, employeeId, fullName, systemReferenceCode, section})))`.
  `MixinService.encrypt` is `window.btoa(encodeURIComponent(value))`. That's **encoding, not
  encryption**: no key, no signature, no expiry. It's built in the browser.
- **UMS side:** `AuthController::login($encryptedCredentials)` runs
  `json_decode(urldecode(base64_decode(...)))`, reads only `username` and `systemReferenceCode`,
  finds the user **by username alone**, and issues a Sanctum token (`createToken('main')`). There's no
  password and no check that the portal made the link. The code's own comment says:
  *"to be adjust for encrypted credentials"*.
- **So:** anyone who knows a username (for employees it's the employee no.) can type
  `base64(urlencode({"username":"…","systemReferenceCode":"SYS-222-FM"}))` into a URL and be signed in
  as that person, in Flowmira and in every other system that uses UMS `/authenticate`.
- Also: `userAccesses()` filters the user's accesses by **user type only, not by system**. A System
  Owner of Atlas gets an entry back even when asking for `SYS-222-FM`, so each app must filter by
  `systemReferenceCode` itself. Flowmira does.
- `verifyApiToken` throws a 500 (not 401) for an unknown token (`$tokenData` is null).

**What Flowmira can and can't do about it:** Flowmira's login sends the credentials to UMS unchanged,
so **when UMS is fixed, Flowmira needs no change**. Until then Flowmira's login is only as strong as
UMS. That matters more here: Flowmira System Owners can make the server connect to databases (ERD).
So in production, also set `ERD_ALLOWED_HOSTS` narrowly.

**Proposed UMS/portal fix (separate review, not part of this one):** the portal **backend** (not the
browser) issues a short-lived, single-use code, either signed with a key shared with UMS (HMAC,
with issued-at + nonce, about 60 s) or stored by UMS. UMS `/authenticate` only accepts such codes. This
is in `ums/` + `ipcc/`, so it needs its own `audit-notes/` review there (Q10).

## What Flowmira has today

| Area | Today | Why it matters for production |
|---|---|---|
| Login | **None.** Anyone who can reach :8080 can do everything | Roles need an identity first |
| API protection | No auth on any route (`backend/app/routers/*.py`, `erd/app/routers/erd.py`) | Hiding buttons isn't enough: anyone can call `/api/erd/introspect` with curl |
| ERD module | `POST /api/erd/introspect` connects to **any database the server can reach** (only `ERD_ALLOWED_HOSTS` limits it, and it's empty by default) | On a company server, that's a way into internal databases. It must be System Owner–only **on the server**, not just in the UI |
| Ownership | `diagrams` has no owner column. Everyone sees every diagram | Decide who sees what (Q4) |
| Home page (`DiagramList.tsx`) | Diagram list, ERD section (`ErdSection`), "Backup and restore" (back up everything, import) | ERD and backup are the "everything else" |
| Editor export (`ExportMenu.tsx`) | PNG, PDF, GIF, `.flowmira`, DBML (ERD only) | PNG/PDF/GIF/`.flowmira` of one's own diagram are diagram features |
| Config | `POSTGRES_PASSWORD` defaults to `rootpass` (backend) / `change-me` (erd, a mismatch), `CORS_ORIGINS=http://localhost:…` | Must be set for prod |
| Schema changes | `create_all()` only, no migrations; it never adds columns to existing tables | Ownership needs care (see below) |
| URL routing | View kept in React state; no URLs | The portal hands off to a URL (`/authenticate/<credentials>`), so one route is needed |

## How our other systems do it (Atlas, reference)

- The portal (ipcc) opens `<app>/authenticate/<credentials>`.
- `views/authentication/Authenticate.vue` calls `VITE_APP_AUTH_URL/authenticate/<credentials>`, gets
  `user.accesses[]`, and picks the entry whose `systemReferenceCode` is the app's own (`SYS-005-ATLAS`).
  Its `userType` is one of `System Owner`, `Super User`, `Administrator`, `Regular User`, `Security`.
- `router/index.ts` (`meta.auth`) and `config/MainMenu.ts` (`access: [...]`) hide pages by `userType`.
- The browser then posts the user to `POST /api/auth/register_session`.

**Two things not to copy:**

1. Atlas checks roles **only in the browser**. Its API doesn't check `userType`; its own
   Decision log says "Reject / cancel checked by status only, not role".
2. `AuthController::registerSession` logs in **whatever user and `accesses` the browser posts**.
   It doesn't ask the auth API. Anyone can post `userType: "System Owner"` and get it.

For Flowmira the ERD module is the risky part, so the role has to be checked on the server.

## Proposed design

### 1. Login: same portal, verified by the server

#### 1a. What Atlas, Athena and `ipc_centralized` show (reviewed 2026-10-20)

**`ipc_centralized` tables (DDL from the owner):**

- `systems`: one row per app. The columns that matter are `system_reference_code` and `url`. The
  portal opens `url` with `{attribute}` replaced by the sign-in credentials, e.g. Atlas is
  `…/authenticate/{attribute}`. `accepted_user_type_id` lists which user types the app takes
  (most apps: `[2,3,5,13]`).
  - **`SYS-222-FM` isn't in the dump yet.** The owner will add it with
    `accepted_user_type_id = [2,3,5,13]` (owner, 2026-10-20).
  - The number in the code looks like `owner_section_id` (`SYS-005-ATLAS` ↔ 5,
    `SYS-036-BAMS` ↔ 36), so Flowmira's row would have `owner_section_id = 222`. Confirm (Q8).
- `user_system_accesses`: one row per user + system (`UNIQUE (user_id, system_id)`), with
  `user_type_id`, `status_id`/`status_code`. This is the actual "who is System Owner of Flowmira"
  record.
- User types (pasted by the owner 2026-10-20). Flowmira accepts `[2,3,5,13]`:

  | id | name | Flowmira role |
  |---|---|---|
  | **2** | **Super User** | **owner: everything** (Q2 answered) |
  | **3** | **System Owner** | **owner: everything** |
  | 5 | Regular User | user: diagrams only |
  | 13 | Administrator | user: diagrams only (Q2 answered) |
  | 1 | Disable | blocked |
  | any other (4, 6–12) | Read-only, Dealer…, HR, … | blocked: not in `accepted_user_type_id` |

  Flowmira matches by **`userTypeId`** (exact id) when UMS sends it, and falls back to the exact
  `userType` name. Inactive accesses never reach Flowmira: UMS reads them from
  `UserSystemActiveAccessesVw` (active ones only).
- **The `systems` row needs `technology = 'laravel'`.** The portal (`SystemWidget.vue`) builds the
  `/authenticate/{attribute}` link only for `'laravel'` systems. Anything else is sent through the old
  PHP form (`proc_api_authenticate.php`) instead. Flowmira is FastAPI, but it uses the "laravel" flow.

**How the two Laravel apps check users:**

| | Atlas (`SYS-005-ATLAS`) | Athena / BAMS (`SYS-036-BAMS`) |
|---|---|---|
| Portal handoff | `/authenticate/:credentials` → browser calls `VITE_APP_AUTH_URL/authenticate/<credentials>` | Same (`react/src/config/route.ts`) |
| Who checks the user | **Only the browser.** `register_session` trusts whatever user/accesses are posted | **The server.** `UmsAuthGuard` (`ums.auth`) on every API group |
| How | n/a | `UmsClient::verifyApiToken()`: `POST <SSO_UMS_URL>/verify_api_token` with `Authorization: Bearer <apiToken>`, form fields `apiToken` + `systemReferenceCode`. Then finds the access with that `systemReferenceCode`; none → 403 |
| Role names | exact list: `System Owner`, `Super User`, `Administrator`, `Regular User`, `Security` | browser maps by **substring** (`"admin"`, `"system owner"` → admin) |
| Config | `VITE_APP_AUTH_URL`, `VITE_APP_SYSTEM_CODE` | `SSO_UMS_URL` (or `UMS_AUTH_URL`), `APP_SYSTEM_CODE`, `UMS_TIMEOUT` |

**Copy Athena's server check. Don't copy these:**

- Atlas's trust-the-browser session.
- Athena's substring role match. `"Administrator"` contains "admin", so it would count as full access.
  Flowmira matches the **exact** `userType` (or `userTypeId`).
- Athena returning `$e->getMessage()` in its 401 JSON.
- Athena calls UMS on **every request**. Flowmira only needs to call it at sign-in plus a periodic
  re-check, so it isn't slowed down when UMS is slow.

#### 1b. Flowmira's FastAPI login (Athena pattern, in Python)

Flowmira keeps **no passwords and has no login form**. Identity comes from the portal/UMS, as it does
for every other IPC system.

1. UMS adds the `systems` row for `SYS-222-FM`, with `url = https://<flowmira-host>/authenticate/{attribute}`.
   Users get `user_system_accesses` rows for it (Regular User / System Owner).
2. The user clicks Flowmira in the portal, which opens `/authenticate/<credentials>`. The SPA sends
   `<credentials>` to `POST /api/auth/login`.
3. `backend/app/ums.py` (new, `httpx`):
   - `authenticate(credentials)`: `GET <UMS_AUTH_URL>/authenticate/<credentials>` → user + `apiToken`.
   - `verify_api_token(token)`: `POST <UMS_AUTH_URL>/verify_api_token` (same form fields as Athena).
   - Both run on the **server**. Errors are logged; the user sees only "Sign-in failed".
4. Pick the access with `systemReferenceCode == "SYS-222-FM"`. None → 403 "Your account has no access to
   Flowmira". Role = exact `userType` mapped to `owner` / `user` (Q2 decides Super User/Administrator).
5. Set Flowmira's own **signed, HttpOnly, Secure, SameSite=Lax cookie** (`user_id`, `employee_no`,
   `full_name`, `email`, `user_type`, `role`, issued/expiry; HMAC with `FLOWMIRA_SESSION_SECRET`).
   The UMS `apiToken` stays in the server-side session row, not in the browser.
6. **Re-check** every `UMS_RECHECK_MINUTES` (e.g. 15) with `verify_api_token`, so removing someone's access in
   UMS takes effect without waiting for the cookie to expire. If UMS is unreachable during a re-check,
   keep the session until it expires (config).
7. `GET /api/auth/me`, `POST /api/auth/logout`.

**Chosen by the owner (2026-10-20): read the access from `ipc_centralized.user_system_active_accesses_vw`.**
See `fixes/README.md`, update 2. The paragraph below is the original note.

**Optional, stronger:** Flowmira could also read `ipc_centralized.user_system_accesses` directly with a
**read-only** MySQL user, as Atlas does with `ipc_connection`. The role would then come from the table
itself, not from the API response. Recommended only if the `verify_api_token` response doesn't include
`accesses`/`userType`. It needs the user-types table (Q9) and a read-only DB account. Default: **API only,
no direct DB access**.

New env keys (names only): `UMS_AUTH_URL`, `UMS_TIMEOUT`, `UMS_RECHECK_MINUTES`, `FLOWMIRA_SYSTEM_CODE`
(`SYS-222-FM`), `FLOWMIRA_SESSION_SECRET`, `SESSION_HOURS`, `COOKIE_SECURE`. For the optional DB check:
`IPC_DB_HOST`, `IPC_DB_PORT`, `IPC_DB_NAME`, `IPC_DB_USER`, `IPC_DB_PASSWORD`.

### 2. Who can do what

"Full" = System Owner (3) **and Super User (2)**. Regular User (5) and Administrator (13) = diagrams
only (owner, 2026-10-20).

| Feature | Regular User, Administrator | System Owner, Super User |
|---|---|---|
| Create / edit / delete diagrams (all 6 templates) | ✅ own diagrams only | ✅ all, including the unowned ones from before |
| Present mode, line hops, crow's foot, etc. | ✅ | ✅ |
| Export one diagram: PNG, PDF, GIF, `.flowmira` | ✅ | ✅ |
| ERD module (list, open, connect to a database, DBML) | ❌ hidden **and** 403 | ✅ |
| Back up everything (all diagrams + ERDs) | ❌ hidden **and** 403 | ✅ |
| Import `.flowmira` | ❌ hidden **and** 403 (import is the only caller that sends dates; non-owners get 403 for that) | ✅ |

### 3. Enforcing it on the server

- **Diagrams API** (`backend/`): a FastAPI dependency `current_user()` on every `/api/diagrams` and
  `/api/templates` route. Not signed in → 401. Ownership filter per Q4.
- **ERD API** (`erd/`): **nginx `auth_request`**. Every `/api/erd/` request is first checked against the
  backend's `GET /api/auth/check?role=owner`. Anything other than 200 is refused before it reaches
  `flowmira-erd`. One place to enforce it, and the ERD code stays as it is.
  `/api/erd/health` stays open for the Docker healthcheck (it's called inside the container, not
  through nginx anyway).
- **Backup everything:** it's done in the browser (`backup.ts`) by listing all diagrams + ERDs. The
  ERD calls are already blocked by the rule above, and the diagram list only returns the user's own
  (Q4). The button is hidden for regular users.

### 4. Diagram ownership (if Q4 = "own only")

`create_all` won't add a column to the existing `diagrams` table. Two options:

- **(a) Recommended:** at startup, add `owner_employee_no` (nullable, indexed) only if it's missing:
  check with SQLAlchemy `inspect()`, then `ALTER TABLE diagrams ADD COLUMN …`. This works on Postgres
  and the SQLite fallback. It only adds a column; it never drops or rewrites anything.
- **(b)** A new table `diagram_owners(diagram_id, employee_no)`. Nothing existing changes, but every
  query needs a join.

Existing diagrams have no owner. They'd be visible to System Owners only, until a System Owner assigns
them or they're left as "shared" (Q6).

### 5. Frontend

- `App.tsx`: on load, call `/api/auth/me`. Handle the `/authenticate/<credentials>` path (the nginx SPA
  fallback already serves it). Show "Not signed in, open Flowmira from the portal" or "No access"
  screens.
- `DiagramList.tsx`: render `ErdSection` and "Backup and restore" only for System Owner.
- A small "signed in as … · Sign out" line on the **home page** only. The editor header stays
  unchanged, as you asked before.
- `api.ts` / `erd/api.ts`: `credentials: "include"`. On 401, go to the "not signed in" screen.

### 6. Production checklist (independent of roles)

- [ ] Server + URL + HTTPS (Q7). The cookie is `Secure`, so it needs HTTPS.
- [ ] A strong `POSTGRES_PASSWORD` in `.env`. Fix the `rootpass` / `change-me` default mismatch in
      `docker-compose.yml` so the two services can't silently disagree.
- [ ] `CORS_ORIGINS` = the prod URL (same origin via nginx, so CORS barely matters, but no localhost).
- [ ] `ERD_ALLOWED_HOSTS` set to the servers System Owners may inspect, even with the role check.
- [ ] Postgres not published on a host port. Already true in `docker-compose.yml`; never use the dev overlay in prod.
- [ ] Nightly `pg_dump` of `flowmira-db` to storage outside the Docker volume. "Back up everything"
      is manual and owner-only.
- [ ] Remove the stray `*:Zone.Identifier` files (Windows download markers) from the repo. They're harmless.
- [ ] Fill `CLAUDE.md` §5 (environments, deploy steps) once Q7 is answered.

### Files the fix would touch (once approved)

New: `backend/app/auth.py`, `backend/app/routers/auth.py`, `frontend/src/auth.ts`, a sign-in screen.
Changed: `backend/app/main.py`, `models.py`, `routers/diagrams.py`, `routers/templates.py`,
`backend/requirements.txt` (`httpx`), `frontend/nginx.conf`, `frontend/src/App.tsx`, `api.ts`,
`erd/api.ts`, `components/DiagramList.tsx`, `docker-compose.yml`, `.env.example`.
Not changed: everything in `erd/app/`.

### How it would be tested

On a throwaway overlay, not the real stack. A **stub auth API** returns a System Owner, a Regular
User and a user with no Flowmira access. For each one: the UI shows/hides the right sections, and
curl against every `/api/erd/*` and `/api/diagrams/*` route returns the right 200/401/403.
`erd/tests/test_erd.py` must still pass.

## Answers (owner, 2026-10-20)

- Q2: Super User = full, Administrator = diagrams only.
- Q3: only `accepted_user_type_id` `[2,3,5,13]` get in; everyone else is blocked.
- Q4: each user sees and edits only their own diagrams; owners see all.
- Q5: import is owner-only.
- Q6: existing (unowned) diagrams are visible to owners only.
- Q8, Q9: see below.

## Open questions (owner)

1. **Portal registration:** ~~system code~~ **answered: `SYS-222-FM`**
   (`FLOWMIRA_SYSTEM_CODE=SYS-222-FM`). Still open: the production `AUTH_URL`; can the auth API be
   called **from the server** (not only the browser)? Are the `<credentials>` single-use?
2. **Super User / Administrator:** full access like System Owner, or diagrams only? You said only
   System Owner gets everything, so the default is diagrams only.
3. **No Flowmira access in the portal:** blocked (recommended) or treated as regular user?
4. **Who sees which diagrams?** (a) each user sees only their own (System Owner sees all), which is
   recommended; (b) everyone sees and edits everyone's; (c) everyone sees all, edits only their own.
5. **Import `.flowmira` for regular users?** Importing their own exported file is harmless, but you
   said "nothing else". Default is owner-only.
6. **Existing diagrams** (no owner today): leave them System Owner–only, or make them visible to all?
7. **Where does production run?** Which server and folder (Atlas uses
   `/mnt/dockerstorage/dockerfile/DEV/...`), which URL, and who provides HTTPS (company reverse
   proxy or nginx in this stack)?
10. **UMS sign-in links** (see ⚠ section): should I write a separate review + fix for `ums/` and
    `ipcc/`? Should Flowmira go to production before that's fixed? Other systems already run with
    it, but Flowmira's ERD module is a reason to wait.
8. ~~`systems` row~~ **Answered:** the owner adds `SYS-222-FM` with `accepted_user_type_id = [2,3,5,13]`.
9. ~~User types~~ **Answered:** table pasted (see 1a). Still open: the UMS URL for the **local test**
   (is it the one Athena uses in dev, `SSO_UMS_URL`?) and later for production.

## Rollout order (owner, 2026-10-20)

**Test here first, then production.**

1. Fixes in `audit-notes/fixes/`. Test them on a throwaway overlay against a **stub UMS**: Super User,
   System Owner, Regular User, Administrator, Disable, no-access.
2. The owner applies them to this local stack (:8080). Then test against the **real UMS** with
   `SYS-222-FM` and the local URL in the `systems.url` row.
3. Production only after step 2 passes. That needs Q7 (server, URL, HTTPS) and the checklist in §6.
