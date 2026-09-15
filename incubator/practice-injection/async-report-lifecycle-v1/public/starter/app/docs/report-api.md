# Async report API

The starter exposes two explicit API versions. Both versions use JSON and return the same core report fields:

- `id`
- `status`: `queued`, `processing`, `paused`, `completed`, or `failed`
- `completed_segments`
- `total_segments` (always `3` in this starter)
- `last_checkpoint`
- `error` (`null` or a stable `{ code, summary }` object)

## Endpoints

```text
POST /api/v1/reports
GET  /api/v1/reports/:id
POST /api/v1/reports/:id/pause
POST /api/v1/reports/:id/resume

POST /api/v2/reports
GET  /api/v2/reports/:id
POST /api/v2/reports/:id/pause
POST /api/v2/reports/:id/resume
```

`POST /api/v1/reports` and `POST /api/v2/reports` accept an optional JSON `id`. If omitted, the server generates one. A newly created report is `queued`.

The v2 state adds compatibility metadata but keeps the v1 core fields. A v1 reader must preserve unknown v2 fields when it writes a state it can safely handle. Unsupported schema, missing required fields, invalid JSON, and unsafe migration return a stable error code and do not replace the original state file.

Responses never expose filesystem paths, stack traces, or raw persisted documents.
