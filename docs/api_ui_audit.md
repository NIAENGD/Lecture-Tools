# FastAPI and UI Surface Audit

## Summary
- The FastAPI server currently exposes endpoints for curriculum browsing, lecture lifecycle operations, asset uploads, transcription, GPU probing, and storage management, but responses are ad-hoc dictionaries with inconsistent pagination metadata and error details. 【F:app/web/server.py†L2614-L2703】【F:app/web/server.py†L2947-L3126】【F:app/web/server.py†L3583-L3609】【F:app/web/server.py†L3128-L3307】【F:app/web/server.py†L4495-L4574】
- Long-running tasks (transcription, mastering, slide processing) are tracked only in-memory, and progress endpoints require polling without streaming updates or resumable job state. 【F:app/web/server.py†L3583-L3609】【F:app/web/server.py†L3639-L4003】【F:app/web/server.py†L4259-L4489】
- Frontend logic lives in a single 9k-line `index.ts` file with `// @ts-nocheck`, global mutable state, and bespoke DOM manipulation, preventing modular, typed views or efficient state management. 【F:app/web/static/js/index.ts†L1-L156】【F:app/web/static/js/index.ts†L632-L727】【F:app/web/static/js/index.ts†L7709-L7758】

## Endpoint Coverage by UI Story

### Class / Module / Lecture Browsing
- `/api/classes` returns classes with nested module/lecture slices, stats, and pagination hints via query parameters for offsets and limits. However, nested pagination metadata is absent (e.g., lecture lists omit total counts) and responses are raw dicts. 【F:app/web/server.py†L2614-L2684】
- `/api/classes/{class_id}/modules` and `/api/classes/{class_id}/modules/{module_id}/lectures` provide module and lecture expansions, but lecture endpoints lack pagination objects, complicating virtualization sync on the client. 【F:app/web/server.py†L2653-L2703】

### Lecture Ingestion & Asset Management
- `POST /api/lectures` creates lectures; `POST /api/lectures/{lecture_id}/assets/{asset_type}` handles uploads with immediate storage writes and optional background work (mastering, slide prep). Both return bare dicts and reuse shared thread pools without per-job identifiers. 【F:app/web/server.py†L2800-L2822】【F:app/web/server.py†L2947-L3080】
- Asset deletion consolidates multiple cases but only reports serialized lecture data, omitting audit metadata (e.g., which files were removed). 【F:app/web/server.py†L3082-L3126】

### Standalone Transcription & Audio Mastering
- Transcription launches via `POST /api/lectures/{lecture_id}/transcribe` which bundles mastering decisions, executes sequential steps on a single-thread executor, and streams progress updates into in-memory trackers. Failures surface as HTTP exceptions without machine-readable error codes. 【F:app/web/server.py†L3639-L4003】
- Polling endpoints `/api/lectures/{lecture_id}/transcription-progress` and `/api/progress` expose tracker snapshots but rely on periodic client polling and do not emit server-sent events. 【F:app/web/server.py†L3583-L3609】

### GPU Probing and Settings
- `/api/settings/whisper-gpu/status` and `/api/settings/whisper-gpu/test` surface cached GPU probe results. Responses mirror internal dicts, so schema changes risk silent client breakage. 【F:app/web/server.py†L3128-L3158】
- `/api/settings` reads/writes UI preferences using `SettingsStore` but returns raw dictionaries without enum validation or versioning. 【F:app/web/server.py†L3160-L3307】

### Storage Export / Import / Browsing
- Export and import routes wrap ZIP archives yet load entire uploads into memory (`await file.read()`), blocking large archives and preventing resumable transfers. 【F:app/web/server.py†L3309-L3404】
- Storage browsing endpoints (`/api/storage/usage`, `/api/storage/list`, `/api/storage/download`) depend on synchronous filesystem calls without pagination or streaming downloads, limiting usability for large folders. 【F:app/web/server.py†L4495-L4574】

## Missing Capabilities & Reliability Gaps
- **Response DTOs & Errors:** Most endpoints craft dicts manually, so there is no shared envelope or typed guarantee for `pagination`, `stats`, or `lecture` payloads. Consumers must rely on implicit keys, and errors consist only of `detail` strings from `HTTPException`. 【F:app/web/server.py†L2614-L2684】【F:app/web/server.py†L2947-L3126】
- **Pagination Metadata:** Nested resources (modules, lectures) lack `total`, `offset`, and `limit` information, making it hard to keep virtualized trees in sync when the backend auto-truncates results. 【F:app/web/server.py†L2653-L2703】
- **Progress Streaming:** Progress trackers are in-memory maps, so restarts lose state and concurrent workers cannot inspect queued jobs. SSE/WebSocket streaming is absent; clients must poll `/api/progress`. 【F:app/web/server.py†L3583-L3609】【F:app/web/server.py†L3639-L4003】
- **Chunked/Resumable Transfers:** Uploads and imports read the entire file payload and write synchronously, offering no resumable uploads, chunk validation, or checksum reporting for large assets. 【F:app/web/server.py†L2947-L3036】【F:app/web/server.py†L3377-L3389】
- **Background Job Instrumentation:** Long-running operations share a single-thread `ThreadPoolExecutor` with no job IDs or lifecycle hooks. Progress messages exist, but there is no consistent schema or retention beyond memory. 【F:app/web/server.py†L1840-L1904】【F:app/web/server.py†L3639-L4003】
- **Storage Operations:** Directory listings and downloads provide no pagination or size limits, leading to heavy memory usage when directories contain thousands of files. 【F:app/web/server.py†L4521-L4574】

## DTO, Error Contract, and Task-State Recommendations
- Introduce Pydantic response models for each route, e.g., `ClassListResponse`, `ModuleListResponse`, `LectureDetailResponse`, embedding shared `Pagination` objects and machine-readable error codes. 【F:app/web/server.py†L2614-L2684】【F:app/web/server.py†L3583-L3609】
- Define a consistent error envelope (e.g., `{ "error": { "code": "CLASS_NOT_FOUND", "message": "..." } }`) and raise custom exceptions mapped by FastAPI exception handlers instead of inline `HTTPException` strings.
- Extend progress trackers to persist job snapshots (SQLite/Redis) and expose `/api/progress/stream` via `StreamingResponse` for server-sent events, enabling UI to show live status without polling. 【F:app/web/server.py†L3583-L3609】
- Upgrade upload/import handlers to accept chunk manifests (tus-style resumable uploads or multipart chunk endpoints) and report checksums plus partial progress back to the client.

## Frontend Refactor Targets
- Break the monolithic `app/web/static/js/index.ts` (9,283 LOC with `// @ts-nocheck`) into ES modules for curriculum browsing, ingestion wizard, storage browser, and system settings. Each module can own its state store and render logic using reactive patterns instead of DOM querying across global maps. 【F:app/web/static/js/index.ts†L1-L156】【F:app/web/static/js/index.ts†L632-L727】
- Replace the ad-hoc global `state` object with a typed store (e.g., Zustand/Redux Toolkit or custom reactive store) that exposes selectors for long-running jobs, GPU status, and settings. This allows components to subscribe to slices rather than manually updating DOM nodes. 【F:app/web/static/js/index.ts†L632-L727】
- Encapsulate virtualization logic (`CurriculumVirtualizer`) and IntersectionObserver hooks into reusable modules so curriculum, module, and lecture panes can lazy-load consistently. Currently this logic is embedded inline, which makes reuse across dashboards impossible. 【F:app/web/static/js/index.ts†L7709-L7758】
- Restore TypeScript checking by removing `// @ts-nocheck`, introducing shared DTO types aligned with the new API contracts, and adding module-level interfaces for settings, storage entries, and progress payloads. 【F:app/web/static/js/index.ts†L1-L156】
- Implement live settings updates by wiring UI controls to the centralized store and subscribing to SSE progress events, eliminating manual timers like `transcriptionProgressTimer` and `processingProgressTimer`. 【F:app/web/static/js/index.ts†L668-L671】【F:app/web/static/js/index.ts†L7709-L7758】

## Implementation Roadmap
1. **API Layer Modernization:** Extract DTO classes for existing endpoints, add exception handlers for standard error envelopes, and extend pagination metadata for nested resources. Introduce background job IDs and expose `/api/progress/stream`.
2. **Data Transfer Improvements:** Build chunked upload endpoints (initiate, append, finalize) and streaming download/export APIs. Provide checksum metadata so the UI can resume or validate transfers.
3. **Frontend Module Split:** Move curriculum browsing into a dedicated module that consumes typed DTOs, set up a state manager, and lazy-load panels for ingestion, storage, and settings. Re-enable TypeScript checking incrementally per module.
4. **Real-time Feedback:** Integrate SSE/WebSocket clients for progress and GPU diagnostics, and update settings/theme toggles to dispatch store actions that propagate immediately across components.

