-- ── NEW ── Puts Flowmira back in the portal for the local run at http://127.0.0.1/flowmira.
-- The row was in ipc_centralized.systems on 2026-10-20 (id 39) and is gone from the local database now.
-- Run once on the local MySQL. Safe to run twice: it adds nothing if the code already exists.
-- Same values as the old row: common system, class 1, user types 2,3,5,13.
-- is_common = 1: every class 1 user gets Regular User. sp_user_system_active_accesses now keeps a
-- user's own user_type_id first, so a row in user_system_accesses with type 3 or 2 still means owner.
-- owner_section_id 18 = MANAGEMENT INFORMATION SYSTEM.
-- Production uses its own host in url; do not copy this url there.
INSERT INTO ipc_centralized.systems
  (system_code, system_reference_code, name, technology, accepted_user_class_id, accepted_user_type_id,
   url, owner_section_id, is_common, is_allow_proby, active_flag, is_on_dashboard, created_datetime)
SELECT 'FM', 'SYS-222-FM', 'Flowmira', 'laravel', '[1]', '[2,3,5,13]',
       'http://127.0.0.1/flowmira/authenticate/{attribute}', 18, 1, 1, 1, 1, NOW()
WHERE NOT EXISTS (SELECT 1 FROM ipc_centralized.systems WHERE system_reference_code = 'SYS-222-FM');

-- Undo:
-- DELETE FROM ipc_centralized.systems WHERE system_reference_code = 'SYS-222-FM';
