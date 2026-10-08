# OneSign V2 integration: review and proposal

Status: for your review. Nothing in `src/` (`backend/`, `erd/`, `frontend/`) has been changed.
Date: 2026-10-15.

## Request

> "our real goal is to integrate the onesign v2 here like we did on atlas … remember our approach in other projects"

## The approach we use (Atlas, Athena)

1. Review first, in `audit-notes/<topic>-review.md`, with no code.
2. Once the owner approves the design, put full-file fixes in `audit-notes/fixes/`, mirroring the real paths, marked `── NEW ──` / `── FIX ──`.
3. Keep one running `fixes/README.md` with the file → real path table, a section per fix, what was tested, and open questions.
4. Test on a throwaway overlay (source + fixes). The real stack isn't touched.
5. The owner applies the files by hand.

## How OneSign V2 works in Atlas (reference)

The same service lives at `athena/src/app/Services/V2/OneSignService.php` for BAMS budget headers;
only the module and the record differ.

| Piece | Atlas file | What it does |
|---|---|---|
| Client | `app/Services/V2/OneSignService.php` | `POST` to `ONESIGN_V2_INBOUND_URL`, header `X-CAS-API-Key`, `Idempotency-Key`, retry ×2 |
| Submit | `submitBookingRequest()` | `endpoint_type: FULL_APPROVAL_CREATE`, plus `system_code`, `module_code`, `reference_no`, `reference_code` (`ATLAS-BOOKING-REQUEST-<ref>-<ULID>`) and `payload` {title, description, `source_view_url`, `callback_url?token=…`, requester snapshot, one SEQUENTIAL step with approvers, `business_data`, `metadata.integration_version = ONESIGN_V2`} |
| Cancel | `cancelBookingRequest()` | `endpoint_type: APPROVAL_CANCEL` with `approval_request_no`, reason, actor |
| Callback | `OneSignV2AtlasCallbackController` (public route `/callback/booking-request`) | Checks the token (header `X-OneSign-Callback-Token` or `?token=`, `hash_equals`). Takes `event_id`, `reference_code` or `approval_request_no`, `event_type` and `event_sequence_no`. Then: insert-or-ignore into `onesign_callback_receipts` (duplicate = 200 "already processed"); in a transaction, lock the record; ignore older sequences and anything that would undo a final status; update `onesign_*` columns and the record's status; write the approver decision rows (`css.approvals`) |
| Status values | callback | `PENDING`, `APPROVED`, `REJECTED`, `RETURNED`, `CANCELLED`, `PROCESSING_FAILED` (+ local `SUBMITTING`, `SUBMISSION_FAILED`, `CANCELLATION_PENDING`) |
| Config | `config/services.php` → `onesign_v2.*` | `ONESIGN_V2_INBOUND_URL`, `_API_KEY`, `_AUTH_HEADER`, `_AUTH_PREFIX`, `_SYSTEM_CODE`, `_*_MODULE_CODE`, `_*_CALLBACK_URL`, `_CALLBACK_SECRET`, `_CALLBACK_HEADER`, timeouts/retries |
| Requester | `Auth::user()` | from the portal login (ipcc auth API → Sanctum) |
| Approvers | request body `approvals[]` | picked in the Vue form from employee / approver-matrix data (`ipc_connection`) |
| Failure handling | `submitToOneSign()` | the record is saved first; if OneSign fails → `SUBMISSION_FAILED` + reason, and the user can retry |

## What Flowmira has and doesn't have

| Need | Flowmira today | Gap |
|---|---|---|
| Backend to call OneSign | FastAPI (`backend/`), deps: fastapi, sqlalchemy, pydantic, psycopg | Port the service to Python. Needs an HTTP client (`httpx`, or stdlib `urllib`) |
| Something to approve | `diagrams` (and `erd_documents`) | **Decide what gets approved** (Q1) |
| Requester identity | **No login and no users at all.** Anyone who can open :8080 can edit anything | **Biggest gap** (Q2) |
| Approver list | No employee data or connection | Q3 |
| Link for approvers (`source_view_url`) | **No URLs per diagram**: `App.tsx` keeps the current view in React state | Add a deep link such as `/#/view/<id>`, opening read-only. This is a natural use for Present mode |
| Callback reachable by OneSign | Runs on `localhost:8080` in Docker. No UAT/prod URL on file (`CLAUDE.md` §5 `<TODO>`) | Q5 |
| DB changes | `Base.metadata.create_all()` at startup, no migrations | Use **new tables only**: `create_all` creates them, and `diagrams` stays untouched (no ALTER needed) |
| System registration | none | OneSign admin must register a system code (e.g. `FLOWMIRA`) + module code + API key (Q4) |

## Proposed design (once the questions are answered)

The diagrams service (`backend/`) gets the integration. The ERD service stays as it is unless Q1 says otherwise.

**New tables** (created by `create_all`; nothing existing changes):

- `approval_requests`: one per submission. It holds `diagram_id`, `reference_no` (`FM-<yyyymm>-<seq>`, Q6), `reference_code` (`FLOWMIRA-DIAGRAM-<ref>-<ULID>`), `onesign_status`, `inbound_request_no`, `approval_request_no`, `failure_reason`, `last_event_id/type`, `event_sequence_no`, `last_callback_at`, `completed_at`, requester snapshot, and a **frozen snapshot of the diagram** (`title`, `template_key`, `data`) plus `data_hash`. Approvers sign that exact version, even if someone edits the diagram later.
- `approval_actions`: one row per approver (sequence, employee no, name, email, position) plus decision, remarks, acted_at and actor. This is the equivalent of Atlas `css.approvals`.
- `onesign_callback_receipts`: `event_id` is unique (idempotent), with processing_status RECEIVED / PROCESSED / IGNORED / FAILED and the payload. Same as Atlas.

**New / changed backend files** (Python port of the Atlas logic, same payload shape):

- `backend/app/onesign.py`: `submit_diagram()`, `cancel_diagram()`, idempotency key `FLOWMIRA:DIAGRAM:<op>:sha256(reference_code)`, retry, error trimmed to 1500 characters.
- `backend/app/routers/approvals.py`, with these endpoints:
  - `POST /api/diagrams/{id}/approvals`: submit. The record is saved first, then sent. On failure → `SUBMISSION_FAILED`, which can be retried.
  - `POST /api/approvals/{id}/retry`
  - `POST /api/approvals/{id}/cancel`
  - `GET /api/diagrams/{id}/approvals`: status + history.
  - `POST /api/callback/diagram`: public, token-checked with `hmac.compare_digest`. Same rules as Atlas: receipts, sequence/final-status guard, and a row lock (`SELECT … FOR UPDATE`).
- `backend/app/models.py`, `schemas.py` and `main.py` (router).
- `backend/requirements.txt` (+ `httpx`).
- `docker-compose.yml`, `.env.example`: pass the `ONESIGN_V2_*` keys through. Only the key names go in notes; no values.

**Frontend:**

- `frontend/src/api.ts`, `types.ts`: approval types and calls.
- A "Submit for approval" panel: approvers list, status badge, history, retry and cancel. **Where it goes is Q7**, because you asked earlier that the header not be modified.
- A deep link (`#/view/<id>`) opening the diagram read-only (Present mode) for `source_view_url`.
- While an approval is `PENDING`, should editing be locked? (Q8)

**Not copied from Atlas on purpose:**

- Atlas returns raw `$e->getMessage()` to clients and runs with `APP_DEBUG=true` (known issue). The Flowmira version keeps OneSign error bodies in `failure_reason` but shows the user a short message.
- Atlas sends the callback secret in the URL query (`?token=`). We'll keep it for compatibility, since OneSign may only support that, but the header is preferred if OneSign can send it (Q4).

## Open questions (owner)

1. **What is approved?** Diagrams only (SIPOC/DMAIC/Swimlane…), ERDs too, or only certain templates?
2. **Who is the requester?** Flowmira has no login. The options are: (a) add the portal login like Atlas (ipcc auth API / `VITE_APP_AUTH_URL`), which is the most work but consistent and trustworthy; (b) the person types their employee no/name/email, which is quick but unverified; (c) something else.
3. **Where do approvers come from?** (a) Employee lookup from the ipc central DB (read-only, like Atlas `ipc_connection`); (b) a fixed approver matrix per template; (c) typed in by hand.
4. **OneSign side:** is there already a system code / module code / API key for Flowmira, and does OneSign V2 accept attachments? A PNG/PDF of the diagram would help approvers. Can it send the callback token as a header?
5. **Where will Flowmira run** for OneSign to reach the callback (UAT/prod URL)? `localhost` can't receive callbacks from the real service.
6. Reference number format? (Atlas uses its own; proposal `FM-<yyyymm>-<seq>`.)
7. Where should "Submit for approval" go in the UI, given the header stays unchanged?
8. Lock editing while pending, and/or after approval (new edits → new submission)?
