# Backup / "export as file" review

Date: 2026-10-15
Request: an "export as file" option so diagrams survive if Flowmira is uninstalled.

## Where data lives today

| Data | Stored in | Code |
|---|---|---|
| Diagrams (SIPOC, DMAIC, Swimlane, …) | `diagrams` table, `data` JSON column (items, edges, zones, layout, settings) | `backend/app/models.py:27` |
| ERDs | `erd_documents` table (DBML text + layout JSON + source info, never a password) | `erd/app/models.py:11` |
| Templates | `templates` table, but re-seeded from `backend/templates/*.json` on every start | `backend/app/seed.py` |

All of it is in the PostgreSQL Docker volume `pgdata` (`docker-compose.yml`).

## Findings

1. **No way to get your work out as a re-openable file.** The Export menu
   (`frontend/src/components/ExportMenu.tsx:5`) only does PNG, transparent PNG, PDF and GIF.
   Those are pictures: they can't be imported back into Flowmira.
2. **Uninstalling deletes everything.** `docker compose down -v`, removing Docker Desktop, or
   pruning volumes deletes `pgdata` and every diagram with it. Nothing else holds a copy.
3. **No import.** The home page (`frontend/src/components/DiagramList.tsx`) can create and
   delete diagrams, but can't load one from a file.
4. **Good news: no backend change is needed.** The API already returns the full diagram
   (`GET /api/diagrams/{id}`, `GET /api/erd/documents/{id}`) and accepts it back
   (`POST /api/diagrams` takes `data`; `POST /api/erd/documents` takes `dbml`, `layout`,
   `source`, `source_info`). Export and import can be done in the frontend alone.

## Proposed design

A Flowmira file format, **`.flowmira`**: plain JSON, readable in any text editor.

```json
{
  "format": "flowmira",
  "version": 1,
  "exported_at": "2026-10-15T08:30:00Z",
  "app_version": "1.x",
  "diagrams": [
    { "title": "...", "template_key": "sipoc", "data": { "items": [], "edges": [] },
      "created_at": "...", "updated_at": "..." }
  ],
  "erds": [
    { "title": "...", "dbml": "...", "layout": {}, "source": "dbml", "source_info": null }
  ]
}
```

The same format is used for one diagram and for a full backup, so one importer handles both.

| Feature | Where |
|---|---|
| **Export → "Flowmira file (.flowmira)"**, for the open diagram | `ExportMenu.tsx`, `Editor.tsx`, `ErdEditor.tsx` |
| **"Back up everything"**: all diagrams and ERDs in one `flowmira-backup-YYYY-MM-DD.flowmira` | home page, `DiagramList.tsx` |
| **"Import / restore"**: pick a `.flowmira` file to load its contents | home page, `DiagramList.tsx` |
| ERD only: also **Export → DBML (.dbml)**, which opens in dbdiagram.io too | `ErdEditor.tsx` |

Import rules:
- Always **adds** new diagrams and never overwrites. Importing the same file twice gives duplicates,
  which is safe; the user can delete the extras.
- Checks `format == "flowmira"` and `version <= 1`; rejects anything else with a clear message.
- Unknown `template_key`: that diagram is skipped and listed in the result message. The backend
  already returns 400 for it.
- Database-sourced ERDs come back view-only, as they are now. Refresh asks for the password,
  which is never in the file because it's never stored.
- Original `created_at`/`updated_at` are kept in the file, but the API sets new dates on import.
  Keeping the originals would need a small backend change (open question).

## Server-side backup

This is a separate safety net for whoever runs the server, and it complements the file export:

```bash
docker compose exec db pg_dump -U flowmira flowmira > flowmira-db-$(date +%F).sql
```

## Decisions (owner, 2026-10-15)

1. Extension: **`.flowmira`**.
2. Import **keeps the original dates**: small backend change, in both `backend` and `erd`.
3. Restore only **adds** and never replaces.

Fixes: [`fixes/README.md`](fixes/README.md).
