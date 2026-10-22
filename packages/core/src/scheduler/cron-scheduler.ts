import crypto from 'node:crypto';
import {
  type ScheduledJob,
  type JobExecutionLog,
  type IMemoryPort,
} from '@opentalon/memory';
import { type ISkillSandbox } from '@opentalon/skill-engine';
import { type DualBrainRouter } from '../router/dual-brain-router.js';
import { CronParser } from './cron-parser.js';
import {
  type ICronScheduler,
  type CronSchedulerConfig,
  type CronNotificationEvent,
} from './types.js';

export class CronScheduler implements ICronScheduler {
  private memory: IMemoryPort;
  private router?: DualBrainRouter;
  private sandbox?: ISkillSandbox;
  private tickIntervalMs: number;
  private defaultTimeoutMs: number;
  private timer: NodeJS.Timeout | null = null;
  private runningJobs: Set<string> = new Set();
  private isTickEvaluating = false;
  private isStarted = false;
  private onNotification?: (event: CronNotificationEvent) => Promise<void> | void;

  constructor(config: CronSchedulerConfig) {
    this.memory = config.memory;
    this.router = config.router;
    this.sandbox = config.sandbox;
    this.tickIntervalMs = config.tickIntervalMs ?? 1000;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30000;
    this.onNotification = config.onNotification;
  }

  public start(): void {
    if (this.isStarted) return;
    this.isStarted = true;

    // Run first evaluation immediately
    void this.evaluateTick();

    // Schedule regular heartbeat ticks
    this.timer = setInterval(() => {
      void this.evaluateTick();
    }, this.tickIntervalMs);
  }

  public stop(): void {
    this.isStarted = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public isRunning(): boolean {
    return this.isStarted;
  }

  public async evaluateTick(now: number = Date.now()): Promise<void> {
    if (this.isTickEvaluating || !this.isStarted) return;
    this.isTickEvaluating = true;

    try {
      const activeJobs = await this.memory.listJobs({ status: 'active' });

      for (const job of activeJobs) {
        // Skip if job is already executing (Single-flight mutex)
        if (this.runningJobs.has(job.id)) {
          continue;
        }

        // Initialize nextRunAt if not set
        if (!job.nextRunAt) {
          try {
            const nextRun = CronParser.getNextRunTime(job.cron, new Date(now));
            await this.memory.updateJobStatus(job.id, 'active', { nextRunAt: nextRun });
          } catch {
            // Invalid cron syntax, pause job
            await this.memory.updateJobStatus(job.id, 'paused', {
              lastStatus: 'failure',
            });
          }
          continue;
        }

        // Check if job is due
        if (now >= job.nextRunAt) {
          // Fire non-blocking execution
          void this.executeJob(job, now);
        }
      }
    } catch {
      // Gracefully survive storage tick errors
    } finally {
      this.isTickEvaluating = false;
    }
  }

  public async triggerJob(idOrName: string): Promise<JobExecutionLog> {
    const job = await this.memory.getJob(idOrName);
    if (!job) {
      throw new Error(`Scheduled job "${idOrName}" not found.`);
    }

    return this.executeJob(job, Date.now());
  }

  public async registerJob(
    jobData: Omit<ScheduledJob, 'id' | 'createdAt' | 'updatedAt' | 'failureCount'> & { id?: string }
  ): Promise<ScheduledJob> {
    const now = Date.now();
    const id = jobData.id || `job-${crypto.randomUUID().slice(0, 8)}`;
    const nextRunAt = CronParser.getNextRunTime(jobData.cron, new Date(now));

    const job: ScheduledJob = {
      id,
      name: jobData.name,
      cron: jobData.cron,
      actionType: jobData.actionType,
      actionPayload: jobData.actionPayload,
      status: jobData.status || 'active',
      nextRunAt,
      lastRunAt: jobData.lastRunAt,
      lastStatus: jobData.lastStatus,
      failureCount: 0,
      maxRetries: jobData.maxRetries ?? 3,
      timeoutMs: jobData.timeoutMs ?? this.defaultTimeoutMs,
      notifyChannels: jobData.notifyChannels || ['sse'],
      createdAt: now,
      updatedAt: now,
    };

    await this.memory.saveJob(job);
    return job;
  }

  public async toggleJob(idOrName: string, active?: boolean): Promise<ScheduledJob> {
    const job = await this.memory.getJob(idOrName);
    if (!job) {
      throw new Error(`Scheduled job "${idOrName}" not found.`);
    }

    const nextStatus =
      active !== undefined
        ? active
          ? 'active'
          : 'paused'
        : job.status === 'active'
        ? 'paused'
        : 'active';

    const updates: Partial<ScheduledJob> = {
      status: nextStatus,
      updatedAt: Date.now(),
    };

    if (nextStatus === 'active') {
      updates.nextRunAt = CronParser.getNextRunTime(job.cron, new Date());
      updates.failureCount = 0; // Reset failure counter on manual resume
    }

    await this.memory.updateJobStatus(job.id, nextStatus, updates);
    const updated = await this.memory.getJob(job.id);
    return updated!;
  }

  public async deleteJob(idOrName: string): Promise<boolean> {
    return this.memory.deleteJob(idOrName);
  }

  public async getJobs(): Promise<ScheduledJob[]> {
    return this.memory.listJobs();
  }

  public async getLogs(jobId?: string, limit = 50): Promise<JobExecutionLog[]> {
    return this.memory.getJobLogs(jobId, limit);
  }

  private async executeJob(job: ScheduledJob, startedAt: number): Promise<JobExecutionLog> {
    const logId = `log-${crypto.randomUUID().slice(0, 8)}`;
    this.runningJobs.add(job.id);

    try {
      await this.memory.updateJobStatus(job.id, 'running');
    } catch {
      // Ignore transition error
    }

    let status: 'success' | 'failure' | 'timeout' = 'success';
    let output: string | undefined;
    let errorMessage: string | undefined;
    let tokensUsed = 0;

    const timeoutMs = job.timeoutMs || this.defaultTimeoutMs;

    try {
      const executionPromise = (async () => {
        if (job.actionType === 'prompt') {
          if (!this.router) {
            throw new Error('DualBrainRouter is required for prompt action execution.');
          }
          const prompt = job.actionPayload.prompt || '';
          const result = await this.router.executeFastPath({
            sessionId: `cron-${job.id}`,
            input: prompt,
          });
          tokensUsed = result.tokensUsed.totalTokens;
          return result.output;
        } else if (job.actionType === 'skill') {
          if (!this.sandbox) {
            throw new Error('ISkillSandbox is required for direct skill action execution.');
          }
          const skillName = job.actionPayload.skillName;
          if (!skillName) {
            throw new Error('Action payload must specify skillName.');
          }
          const skill = await this.memory.getSkill(skillName);
          if (!skill) {
            throw new Error(`Skill "${skillName}" not found in memory.`);
          }
          const result = await this.sandbox.execute({
            code: skill.code,
            args: job.actionPayload.args || {},
            capabilities: skill.capabilities,
            timeoutMs,
          });
          if (!result.success) {
            throw new Error(result.error || `Skill "${skillName}" execution failed in sandbox.`);
          }
          return typeof result.data === 'object' ? JSON.stringify(result.data) : String(result.data);
        } else {
          throw new Error(`Unsupported actionType "${job.actionType}".`);
        }
      })();

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Job execution timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      });

      const res = await Promise.race([executionPromise, timeoutPromise]);
      output = typeof res === 'string' ? res : JSON.stringify(res);
      status = 'success';
    } catch (err: unknown) {
      errorMessage = err instanceof Error ? err.message : String(err);
      status = errorMessage.includes('timed out') ? 'timeout' : 'failure';
    }

    const finishedAt = Date.now();
    const durationMs = finishedAt - startedAt;

    const log: JobExecutionLog = {
      id: logId,
      jobId: job.id,
      startedAt,
      finishedAt,
      durationMs,
      status,
      output,
      errorMessage,
      tokensUsed,
    };

    try {
      await this.memory.saveJobLog(log);
    } catch {
      // Ignore log save error
    }

    // Determine next state
    const failureCount = status === 'success' ? 0 : (job.failureCount || 0) + 1;
    const shouldAutoPause = failureCount >= (job.maxRetries || 3);
    const nextStatus = shouldAutoPause ? 'paused' : 'active';

    let nextRunAt: number | undefined;
    if (nextStatus === 'active') {
      try {
        nextRunAt = CronParser.getNextRunTime(job.cron, new Date(finishedAt));
      } catch {
        nextRunAt = undefined;
      }
    }

    try {
      await this.memory.updateJobStatus(job.id, nextStatus, {
        nextRunAt,
        lastRunAt: startedAt,
        lastStatus: status,
        failureCount,
        updatedAt: finishedAt,
      });
    } catch {
      // Ignore update error
    }

    this.runningJobs.delete(job.id);

    // Dispatch Notification Event
    if (this.onNotification) {
      try {
        await this.onNotification({
          jobId: job.id,
          jobName: job.name,
          status,
          channels: job.notifyChannels || ['sse'],
          output,
          errorMessage,
          durationMs,
          tokensUsed,
          timestamp: finishedAt,
        });
      } catch {
        // Notification listener errors do not crash scheduler
      }
    }

    return log;
  }
}
