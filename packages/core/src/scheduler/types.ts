import {
  type ScheduledJob,
  type JobExecutionLog,
  type IMemoryPort,
} from '@opentalon/memory';
import { type ISkillSandbox } from '@opentalon/skill-engine';
import { type DualBrainRouter } from '../router/dual-brain-router.js';

export interface CronNotificationEvent {
  jobId: string;
  jobName: string;
  status: 'success' | 'failure' | 'timeout';
  channels: string[];
  output?: string;
  errorMessage?: string;
  durationMs?: number;
  tokensUsed?: number;
  timestamp: number;
}

export interface CronSchedulerConfig {
  memory: IMemoryPort;
  router?: DualBrainRouter;
  sandbox?: ISkillSandbox;
  tickIntervalMs?: number; // Default 1000ms
  defaultTimeoutMs?: number; // Default 30000ms
  onNotification?: (event: CronNotificationEvent) => Promise<void> | void;
}

export interface ICronScheduler {
  start(): void;
  stop(): void;
  isRunning(): boolean;
  evaluateTick(now?: number): Promise<void>;
  registerJob(
    job: Omit<ScheduledJob, 'id' | 'createdAt' | 'updatedAt' | 'failureCount'> & { id?: string }
  ): Promise<ScheduledJob>;
  triggerJob(idOrName: string): Promise<JobExecutionLog>;
  toggleJob(idOrName: string, active?: boolean): Promise<ScheduledJob>;
  deleteJob(idOrName: string): Promise<boolean>;
  getJobs(): Promise<ScheduledJob[]>;
  getLogs(jobId?: string, limit?: number): Promise<JobExecutionLog[]>;
}
