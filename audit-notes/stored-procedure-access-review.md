# Stored-procedure access check — staged for review

The owner requested access checks through `ipc_centralized.sp_user_system_active_accesses`.
No application source, running service, secrets, or IPC database was changed in this work.

## Contract found in the portal

`ipcc/src/app/Models/UserSystemActiveAccessesSp.php` calls:

```sql
CALL ipc_centralized.sp_user_system_active_accesses(user_id, employee_id, user_class_id);
```

Its callers pass the authenticated user's `id`, `employee_id`, and `user_class_id`.
The PHP wrapper casts a missing employee ID to 0; this proposal mirrors that behavior.
UMS's `src/app/Resources/AuthResource.php` exposes `id`, `employeeId`, and `userClassId`.
Employee ID is distinct from employee number. User class identifies the procedure's
identity context; user type returned for Flowmira determines application permissions.

Current Flowmira code selects FROM the procedure name as though it were a table.
The staged auth module replaces that with a bound CALL. Its returned accesses are
filtered to `SYS-222-FM` by the existing role logic:

| User type | Permission |
|---|---|
| 2 Super User / 3 System Owner | Full access |
| 5 Regular User / 13 Administrator | Own diagrams only |
| Other types / no Flowmira row | Refused |

## Live check of the procedure (2026-10-20, read-only, through the running backend)

State found: the staged `auth.py`, `models.py`, `main.py` are **already in `src/`** and the backend
running since 11:38 uses them (the README still said "not applied"; who copied them isn't recorded).

- Parameters: `(IN userId INT, IN employeeId INT, IN userClassId INT)`, which matches the bound `CALL`.
  `SECURITY_TYPE = DEFINER` (`root@localhost`), so EXECUTE on the routine is enough for a dedicated account.
- Returns `user_type_id`, `user_type`, `system_reference_code` (plus more). The `CALL` works in
  Flowmira's `READ ONLY` session.
- Only systems with `active_flag = 1`, **`is_on_dashboard = 1`**, and `accepted_user_class_id LIKE
  '%<class>%'`; status in (1,2,3,24,25).
- **Common systems:** `CASE WHEN s.is_common = 1 THEN 5 ELSE usa.user_type_id END AS user_type_id`.
  For a common system **every** user of an accepted class gets `user_type_id = 5`, with or without an
  access row. The *name* (`user_type`) is the real type when a row exists (`ut.name`), else
  `'Regular User'`.
- `SYS-222-FM` (id 39) has **`is_common = 1`**, `is_on_dashboard = 1`, classes `[1]`.
- User 2763 (employee_id 1321, class 1) has no access row and comes back as `SYS-222-FM`, type 5,
  "Regular User". So sign-in works now as **Regular User** (diagrams only).

**Problem:** because Flowmira matches the type **id** first, a System Owner / Super User row on a
common system comes back as id 5 and gets diagrams only. **Nobody can get full access** while
`is_common = 1`. Options (owner decides, Q11):

- **(a) Match by the exact `user_type` name first, id as fallback.** That's what Atlas's frontend does
  (`userType` names) with the same data, and Atlas is also `is_common = 1`. Everyone in class 1 keeps
  Regular access automatically; owners need a row with type 3 (or 2). *Recommended.*
- **(b) Set `is_common = 0` on the `SYS-222-FM` row.** Only people with an access row get in, and ids
  are correct. Every regular user then needs a row.

## Staged files

All paths below are under `audit-notes/fixes/`; review their diffs against source.

- `backend/app/auth.py`: bound CALL; require identity fields from UMS; persist them
  and reuse them on periodic checks. Keep existing role, ownership, and outage rules.
- `backend/app/models.py`: nullable employee_id and user_class_id on auth_sessions.
- `backend/app/main.py`: idempotent additive schema upgrade for existing sessions.
- `backend/tests/test_auth.py`: procedure simulation plus identity and migration tests.
- `.env.example`: EXECUTE privilege guidance instead of SELECT on the view.

Older sessions lack the procedure identity fields and must sign in again after application.
No diagrams are removed. No frontend or ERD authorization changes are needed.
The compatibility helper remains named view_accesses but executes only the procedure.

## Verification and limits

35 tests passed using a throwaway copy in /tmp and a disposable flowmira-backend container.
Tests cover bound argument order, employee ID vs employee number, null employee ID,
invalid identity refusal, session identity persistence, legacy session invalidation,
additive schema upgrade, roles, other-system refusal, ownership, and revocation.
SQLite tests simulate procedure results; they do not validate the actual MySQL routine.

Before applying, confirm the procedure's live definition/result columns:
`user_type_id`, `user_type`, `system_reference_code`. These match the prior access
lookup, but the actual procedure DDL was not found in the inspected repositories.
Confirm it returns active accesses only and works in a READ ONLY session.
The database account needs EXECUTE on the routine; SQL SECURITY INVOKER routines may
also require underlying object privileges. The staged env example documents this.
No live IPC call or real portal browser login was performed.

Existing behavior remains: a failed access re-check keeps an already signed-in session
until expiry; a confirmed missing access deletes it. New sign-ins fail with 503 when
IPC is unavailable. Changing that outage policy is outside this proposal.
