import { randomUUID } from 'node:crypto';
import type { Job, JobStatus, JobHandler, QueueOptions } from './types.js';

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  concurrency: number;
}

export class JobQueue<T = unknown> {
  private readonly name: string;
  private readonly concurrency: number;
  private readonly jobTtlMs: number;
  private readonly jobs = new Map<string, Job<T>>();
  private readonly waitingIds: string[] = [];
  private handler: JobHandler<T> | null = null;
  private activeCount = 0;
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor(name: string, options?: Partial<QueueOptions>) {
    this.name = name;

    // Per-queue env override: QUEUE_CONCURRENCY_INVENTORY, QUEUE_CONCURRENCY_INSPECT, etc.
    const envKey = `QUEUE_CONCURRENCY_${name.toUpperCase()}`;
    const envVal = process.env[envKey] ?? process.env.QUEUE_CONCURRENCY;
    this.concurrency = options?.concurrency ?? (envVal ? parseInt(envVal, 10) : 3);
    this.jobTtlMs = options?.jobTtlMs ?? 30 * 60_000;

    // Cleanup completed/failed jobs older than jobTtlMs every 5 minutes
    this.cleanupTimer = setInterval(() => this._cleanup(), 5 * 60_000);
    this.cleanupTimer.unref();
  }

  /** Add a job to the queue. Returns the created Job immediately. */
  add(name: string, data: T): Job<T> {
    const job: Job<T> = {
      id: randomUUID(),
      name,
      data,
      status: 'waiting',
      progress: 0,
      createdAt: Date.now(),
    };
    this.jobs.set(job.id, job);
    this.waitingIds.push(job.id);
    this._process();
    return job;
  }

  /** Register a handler function. One handler per queue. */
  process(handler: JobHandler<T>): void {
    this.handler = handler;
    // Kick processing in case jobs were added before handler was registered
    this._process();
  }

  /** Get a job by ID. Returns undefined if not found or already cleaned up. */
  getJob(id: string): Job<T> | undefined {
    return this.jobs.get(id);
  }

  /** Get aggregate stats for this queue. */
  getStats(): QueueStats {
    let waiting = 0;
    let active = 0;
    let completed = 0;
    let failed = 0;
    for (const job of Array.from(this.jobs.values())) {
      switch (job.status) {
        case 'waiting': waiting++; break;
        case 'active': active++; break;
        case 'completed': completed++; break;
        case 'failed': failed++; break;
      }
    }
    return { name: this.name, waiting, active, completed, failed, concurrency: this.concurrency };
  }

  /** Stop the cleanup timer (for graceful shutdown). */
  destroy(): void {
    clearInterval(this.cleanupTimer);
  }

  // ─── Private ───────────────────────────────────────────────────────────

  private _process(): void {
    if (!this.handler) return;

    while (this.activeCount < this.concurrency && this.waitingIds.length > 0) {
      const jobId = this.waitingIds.shift()!;
      const job = this.jobs.get(jobId);
      if (!job || job.status !== 'waiting') continue;

      job.status = 'active';
      job.startedAt = Date.now();
      this.activeCount++;

      const updateProgress = (progress: number) => {
        job.progress = progress;
      };

      // Execute handler — intentionally not awaited so we can start multiple concurrent jobs
      this.handler(job, updateProgress)
        .then((result) => {
          job.status = 'completed';
          job.result = result;
          job.completedAt = Date.now();
        })
        .catch((err: unknown) => {
          job.status = 'failed';
          job.error = err instanceof Error ? err.message : String(err);
          job.completedAt = Date.now();
        })
        .finally(() => {
          this.activeCount--;
          this._process();
        });
    }
  }

  private _cleanup(): void {
    const now = Date.now();
    for (const [id, job] of Array.from(this.jobs.entries())) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.completedAt &&
        now - job.completedAt > this.jobTtlMs
      ) {
        this.jobs.delete(id);
      }
    }
  }
}

// ─── Module-level queue registry ───────────────────────────────────────

const queues = new Map<string, JobQueue<any>>();

/** Get or create a named queue. Options only apply on first creation. */
export function getQueue<T = unknown>(name: string, options?: Partial<QueueOptions>): JobQueue<T> {
  let queue = queues.get(name);
  if (!queue) {
    queue = new JobQueue<T>(name, options);
    queues.set(name, queue);
  }
  return queue as JobQueue<T>;
}

/** Get stats for all registered queues. */
export function getAllQueueStats(): Record<string, QueueStats> {
  const stats: Record<string, QueueStats> = {};
  for (const [name, queue] of Array.from(queues.entries())) {
    stats[name] = queue.getStats();
  }
  return stats;
}
