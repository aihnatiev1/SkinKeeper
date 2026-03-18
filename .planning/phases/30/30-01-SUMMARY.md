---
phase: 30-scaling-infrastructure
plan: 01
subsystem: backend-infra
tags: [job-queue, concurrency, inventory, infrastructure]
dependency_graph:
  requires: []
  provides: [JobQueue, getQueue, getAllQueueStats, inventory-queue-migration]
  affects: [inventory-refresh, sync-status-api]
tech_stack:
  added: []
  patterns: [in-memory-job-queue, get-or-create-registry, BullMQ-compatible-interface]
key_files:
  created:
    - backend/src/infra/types.ts
    - backend/src/infra/JobQueue.ts
  modified:
    - backend/src/routes/inventory.ts
decisions:
  - "JobQueue uses randomUUID from node:crypto (named import, not default)"
  - "Map iteration uses Array.from() for TypeScript compatibility without downlevelIteration"
  - "sync-status response maps queue statuses to existing client-expected values (active->syncing, completed->done)"
  - "Background inspect-batch moved inside job processor so it runs as part of job lifecycle"
metrics:
  duration: 221s
  completed: "2026-03-18T18:31:06Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 1
---

# Phase 30 Plan 01: In-Memory Job Queue + Inventory Migration Summary

In-memory JobQueue with configurable concurrency, progress tracking, and BullMQ-compatible interface; inventory refresh migrated from ad-hoc syncJobs Map to structured queue.

## What Was Done

### Task 1: Create JobQueue infrastructure with types (616637f)

Created `backend/src/infra/` directory with two files:

- **types.ts**: Shared types (`Job<T>`, `JobStatus`, `QueueOptions`, `JobHandler<T>`) defining the queue contract.
- **JobQueue.ts**: In-memory queue implementation with:
  - Configurable concurrency via `QUEUE_CONCURRENCY` or per-queue `QUEUE_CONCURRENCY_INVENTORY` env vars (default: 3)
  - Progress tracking via `updateProgress()` callback
  - Auto-cleanup of completed/failed jobs after TTL (default 30min, unref'd timer)
  - Module-level queue registry with `getQueue()` (get-or-create) and `getAllQueueStats()`
  - Interface mirrors BullMQ's `Queue.add()` / `Worker.process()` / `Job.progress` pattern

### Task 2: Migrate inventory refresh to JobQueue (5bb5990)

Modified `backend/src/routes/inventory.ts`:

- Removed the `syncJobs` Map and its manual cleanup `setInterval`
- Created `inventoryQueue` via `getQueue<InventoryRefreshData>('inventory')`
- Registered processor containing the existing sync logic (account loop, upsert, delete stale, inspect)
- POST `/refresh` now calls `inventoryQueue.add()` and returns `{ success, jobId, status: "syncing" }`
- GET `/sync-status/:jobId` reads from queue and maps to backward-compatible response shape
- Error handling simplified: queue handles job failure status automatically

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed crypto import for Node16 module resolution**
- **Found during:** Task 1 verification
- **Issue:** `import crypto from 'node:crypto'` fails with TS1192 (no default export) under `module: Node16`
- **Fix:** Changed to named import `import { randomUUID } from 'node:crypto'`
- **Files modified:** backend/src/infra/JobQueue.ts
- **Commit:** 616637f

**2. [Rule 3 - Blocking] Fixed Map iteration TypeScript errors**
- **Found during:** Task 1 verification
- **Issue:** `for...of` on Map iterators requires `--downlevelIteration` flag
- **Fix:** Wrapped all Map iterations with `Array.from()`
- **Files modified:** backend/src/infra/JobQueue.ts
- **Commit:** 616637f

## Pre-existing Issues (Out of Scope)

- `steam.ts` has 9 compile errors (missing imports: axios, initProxyPool, getAvailableSlot, etc.) -- these belong to 30-02 plan
- 3 test files (10 tests) failing pre-existing -- related to steam.ts/priceJob.ts issues

## Verification

1. `npx tsc --noEmit` -- zero errors (excluding pre-existing steam.ts)
2. `npm test` -- 21 passed / 3 failed (all failures pre-existing)
3. API response shape preserved: `{ status, totalItems, error, startedAt, privateAccounts }`

## Commits

| Task | Commit  | Description                                          |
| ---- | ------- | ---------------------------------------------------- |
| 1    | 616637f | Add in-memory JobQueue with concurrency control      |
| 2    | 5bb5990 | Migrate inventory refresh to JobQueue                |
