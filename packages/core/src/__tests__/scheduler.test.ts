import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LibSqlMemoryAdapter } from '@opentalon/memory';
import { SandboxedVmRunner } from '@opentalon/skill-engine';
import { CronParser } from '../scheduler/cron-parser.js';
import { CronScheduler } from '../scheduler/cron-scheduler.js';
import { DualBrainRouter } from '../router/dual-brain-router.js';
import { MockLLMDriver } from '../drivers/mock-driver.js';
import { type CronNotificationEvent } from '../scheduler/types.js';

describe('CronParser', () => {
  it('parses aliases and returns expected next run time in future', () => {
    const now = new Date('2026-10-23T10:00:00Z');
    const nextHourly = CronParser.getNextRunTime('@hourly', now);
    expect(nextHourly).toBeGreaterThan(now.getTime());

    const nextDaily = CronParser.getNextRunTime('@daily', now);
    expect(nextDaily).toBeGreaterThan(now.getTime());

    const nextMinutely = CronParser.getNextRunTime('@minutely', now);
    expect(nextMinutely - now.getTime()).toBeLessThanOrEqual(60 * 1000);
  });

  it('parses natural intervals', () => {
    const now = new Date('2026-10-23T10:00:00Z');
    const next10s = CronParser.getNextRunTime('every 10s', now);
    expect(next10s - now.getTime()).toBe(10000);

    const next15m = CronParser.getNextRunTime('every 15m', now);
    expect(next15m - now.getTime()).toBe(15 * 60 * 1000);

    const next2h = CronParser.getNextRunTime('every 2h', now);
    expect(next2h - now.getTime()).toBe(2 * 3600 * 1000);
  });

  it('parses standard 5-part cron expressions', () => {
    const now = new Date('2026-10-23T10:14:00Z');
    const next15 = CronParser.getNextRunTime('*/15 * * * *', now);
    const nextDate = new Date(next15);
    expect(nextDate.getMinutes() % 15).toBe(0);
  });

  it('throws descriptive error on invalid cron format', () => {
    expect(() => CronParser.getNextRunTime('invalid expression')).toThrow(/Invalid cron expression/);
  });
});

describe('CronScheduler Core', () => {
  let memory: LibSqlMemoryAdapter;
  let sandbox: SandboxedVmRunner;
  let llm: MockLLMDriver;
  let router: DualBrainRouter;
  let scheduler: CronScheduler;
  const notifications: CronNotificationEvent[] = [];

  beforeEach(async () => {
    notifications.length = 0;
    memory = new LibSqlMemoryAdapter({ url: ':memory:' });
    await memory.initialize();

    sandbox = new SandboxedVmRunner();
    llm = new MockLLMDriver();
    router = new DualBrainRouter({
      memory,
      sandbox,
      llm,
      maxFastPathTokens: 1500,
    });

    scheduler = new CronScheduler({
      memory,
      router,
      sandbox,
      tickIntervalMs: 50,
      defaultTimeoutMs: 1000,
      onNotification: (evt) => {
        notifications.push(evt);
      },
    });
  });

  afterEach(async () => {
    scheduler.stop();
    await memory.close();
  });

  it('registers a job and calculates initial nextRunAt', async () => {
    const job = await scheduler.registerJob({
      name: 'health-checker',
      cron: 'every 30s',
      actionType: 'skill',
      actionPayload: { skillName: 'test-skill' },
      status: 'active',
      maxRetries: 3,
      timeoutMs: 5000,
      notifyChannels: ['sse'],
    });

    expect(job.id).toBeDefined();
    expect(job.name).toBe('health-checker');
    expect(job.nextRunAt).toBeGreaterThan(Date.now());

    const retrieved = await memory.getJob('health-checker');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.status).toBe('active');
  });

  it('executes a direct skill action without invoking LLM (0 tokens)', async () => {
    // 1. Save skill in memory
    await memory.saveSkill({
      id: 'skill-calc',
      name: 'calculate_tax',
      description: 'Calculates tax',
      capabilities: {},
      version: '1.0.0',
      code: 'export default function run(args) { return { total: args.amount * 1.1 }; }',
      hash: 'hash-tax',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 2. Register job
    const job = await scheduler.registerJob({
      name: 'daily-tax-calc',
      cron: 'every 10s',
      actionType: 'skill',
      actionPayload: {
        skillName: 'calculate_tax',
        args: { amount: 100 },
      },
      status: 'active',
      maxRetries: 3,
      timeoutMs: 5000,
      notifyChannels: ['sse'],
    });

    // 3. Trigger job directly
    const log = await scheduler.triggerJob(job.id);
    expect(log.status).toBe('success');
    expect(log.tokensUsed).toBe(0); // 0 tokens consumed for pure skill execution
    expect(log.output).toContain('110');

    // 4. Verify notification emitted
    expect(notifications.length).toBe(1);
    expect(notifications[0].status).toBe('success');
    expect(notifications[0].jobName).toBe('daily-tax-calc');
  });

  it('executes a prompt action via DualBrainRouter and records tokens used', async () => {
    llm.mockResponse.content = 'All services are operational.';

    const job = await scheduler.registerJob({
      name: 'hourly-ai-digest',
      cron: '@hourly',
      actionType: 'prompt',
      actionPayload: {
        prompt: 'Check overall system status',
      },
      status: 'active',
      maxRetries: 3,
      timeoutMs: 5000,
      notifyChannels: ['sse'],
    });

    const log = await scheduler.triggerJob(job.id);
    expect(log.status).toBe('success');
    expect(log.tokensUsed).toBeGreaterThan(0);
    expect(log.output).toBe('All services are operational.');
  });

  it('auto-pauses job after reaching maxRetries consecutive failures', async () => {
    const job = await scheduler.registerJob({
      name: 'failing-job',
      cron: 'every 5s',
      actionType: 'skill',
      actionPayload: {
        skillName: 'non_existent_skill',
      },
      status: 'active',
      maxRetries: 2,
      timeoutMs: 5000,
      notifyChannels: ['sse'],
    });

    // Run 1: failure 1
    const log1 = await scheduler.triggerJob(job.id);
    expect(log1.status).toBe('failure');
    let state = await memory.getJob(job.id);
    expect(state?.status).toBe('active');
    expect(state?.failureCount).toBe(1);

    // Run 2: failure 2 (reaches maxRetries = 2) -> auto-pause
    const log2 = await scheduler.triggerJob(job.id);
    expect(log2.status).toBe('failure');
    state = await memory.getJob(job.id);
    expect(state?.status).toBe('paused');
    expect(state?.failureCount).toBe(2);
  });

  it('supports toggle pause/resume and deleting jobs', async () => {
    const job = await scheduler.registerJob({
      name: 'toggle-test',
      cron: '@daily',
      actionType: 'prompt',
      actionPayload: { prompt: 'Daily digest' },
      status: 'active',
      maxRetries: 3,
      timeoutMs: 5000,
      notifyChannels: ['sse'],
    });

    // Pause
    const paused = await scheduler.toggleJob(job.name, false);
    expect(paused.status).toBe('paused');

    // Resume
    const resumed = await scheduler.toggleJob(job.name, true);
    expect(resumed.status).toBe('active');
    expect(resumed.nextRunAt).toBeDefined();

    // Delete
    const deleted = await scheduler.deleteJob(job.name);
    expect(deleted).toBe(true);
    const after = await memory.getJob(job.name);
    expect(after).toBeNull();
  });

  it('evaluates ticks automatically when scheduler is started', async () => {
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);

    // Register job with past nextRunAt
    const job = await scheduler.registerJob({
      name: 'tick-job',
      cron: 'every 10s',
      actionType: 'prompt',
      actionPayload: { prompt: 'Tick ping' },
      status: 'active',
      maxRetries: 3,
      timeoutMs: 5000,
      notifyChannels: ['sse'],
    });

    // Artificially set nextRunAt to past
    await memory.updateJobStatus(job.id, 'active', {
      nextRunAt: Date.now() - 1000,
    });

    // Run tick evaluation
    await scheduler.evaluateTick(Date.now());

    // Wait a brief tick for execution log
    await new Promise((resolve) => setTimeout(resolve, 80));

    const logs = await scheduler.getLogs(job.id);
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].status).toBe('success');

    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });
});
