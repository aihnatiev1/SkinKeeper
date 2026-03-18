export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed';

export interface Job<T = unknown> {
  id: string;
  name: string;
  data: T;
  status: JobStatus;
  progress: number;        // 0-100 or item count
  result?: unknown;
  error?: string;
  createdAt: number;       // Date.now()
  startedAt?: number;
  completedAt?: number;
}

export interface QueueOptions {
  concurrency: number;     // max parallel jobs
  jobTtlMs: number;        // auto-cleanup completed jobs (default 30min)
}

export type JobHandler<T = unknown> = (
  job: Job<T>,
  updateProgress: (progress: number) => void
) => Promise<unknown>;
