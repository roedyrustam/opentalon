import { describe, it, expect, vi } from 'vitest';
import { CascadingLLMDriver } from '../drivers/cascading-driver.js';
import { type ILLMPort, type LLMRequest, type LLMResponse } from '../types.js';

class TestMockDriver implements ILLMPort {
  public shouldFail = false;
  public failErrorMessage = 'Simulated 429 Rate Limit Exceeded';
  public responseModel = 'test-model';
  public callsMade = 0;

  public async generateContent(_request: LLMRequest): Promise<LLMResponse> {
    this.callsMade++;
    if (this.shouldFail) {
      throw new Error(this.failErrorMessage);
    }
    return {
      content: `Response from ${this.responseModel}`,
      tokensUsed: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
      model: this.responseModel,
    };
  }

  public async createEmbedding(_text: string): Promise<number[]> {
    if (this.shouldFail) {
      throw new Error('Embedding failed');
    }
    return [0.1, 0.2, 0.3];
  }
}

describe('CascadingLLMDriver - Multi-Model Provider Cascading', () => {
  it('calls the primary provider when it is healthy', async () => {
    const primary = new TestMockDriver();
    primary.responseModel = 'gemini-3.5-flash-lite';

    const secondary = new TestMockDriver();
    secondary.responseModel = 'claude-3-7-sonnet';

    const cascade = new CascadingLLMDriver({
      providers: [
        { name: 'gemini', driver: primary, priority: 0 },
        { name: 'claude', driver: secondary, priority: 1 },
      ],
    });

    const res = await cascade.generateContent({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(primary.callsMade).toBe(1);
    expect(secondary.callsMade).toBe(0);
    expect(res.content).toContain('gemini-3.5-flash-lite');
  });

  it('automatically falls back to secondary provider when primary fails', async () => {
    const primary = new TestMockDriver();
    primary.shouldFail = true;
    primary.responseModel = 'gemini';

    const secondary = new TestMockDriver();
    secondary.responseModel = 'claude-3-7-sonnet';

    const failoverSpy = vi.fn();

    const cascade = new CascadingLLMDriver({
      providers: [
        { name: 'gemini', driver: primary, priority: 0 },
        { name: 'claude', driver: secondary, priority: 1 },
      ],
      onFailover: failoverSpy,
    });

    const res = await cascade.generateContent({
      messages: [{ role: 'user', content: 'What is 2+2?' }],
    });

    expect(primary.callsMade).toBe(1);
    expect(secondary.callsMade).toBe(1);
    expect(res.content).toContain('claude-3-7-sonnet');
    expect(failoverSpy).toHaveBeenCalledWith('gemini', 'claude', expect.any(Error));
  });

  it('enforces circuit breaker cooldown on failed provider', async () => {
    const primary = new TestMockDriver();
    primary.shouldFail = true;

    const secondary = new TestMockDriver();
    secondary.responseModel = 'deepseek-chat';

    const cascade = new CascadingLLMDriver({
      providers: [
        { name: 'primary-failing', driver: primary, priority: 0, cooldownMs: 10_000 },
        { name: 'secondary-healthy', driver: secondary, priority: 1 },
      ],
    });

    // 1st request: primary fails, secondary succeeds
    await cascade.generateContent({ messages: [{ role: 'user', content: 'Turn 1' }] });
    expect(primary.callsMade).toBe(1);
    expect(secondary.callsMade).toBe(1);

    // 2nd request: primary should be in cooldown and skipped immediately
    await cascade.generateContent({ messages: [{ role: 'user', content: 'Turn 2' }] });
    expect(primary.callsMade).toBe(1); // Still 1, not called again
    expect(secondary.callsMade).toBe(2);

    const statuses = cascade.getProvidersStatus();
    const primaryStatus = statuses.find((s) => s.name === 'primary-failing');
    expect(primaryStatus?.healthy).toBe(false);
    expect(primaryStatus?.failureCount).toBe(1);
  });

  it('cascades embeddings when primary embedding fails', async () => {
    const primary = new TestMockDriver();
    primary.shouldFail = true;

    const secondary = new TestMockDriver();
    secondary.shouldFail = false;

    const cascade = new CascadingLLMDriver({
      providers: [
        { name: 'primary', driver: primary, priority: 0 },
        { name: 'secondary', driver: secondary, priority: 1 },
      ],
    });

    const embedding = await cascade.createEmbedding('Test embedding text');
    expect(embedding).toEqual([0.1, 0.2, 0.3]);
  });

  it('throws descriptive aggregate error when all cascade providers fail', async () => {
    const p1 = new TestMockDriver();
    p1.shouldFail = true;
    p1.failErrorMessage = 'Quota Exceeded';

    const p2 = new TestMockDriver();
    p2.shouldFail = true;
    p2.failErrorMessage = 'Network Timeout';

    const cascade = new CascadingLLMDriver({
      providers: [
        { name: 'p1', driver: p1, priority: 0 },
        { name: 'p2', driver: p2, priority: 1 },
      ],
    });

    await expect(
      cascade.generateContent({ messages: [{ role: 'user', content: 'Hello' }] })
    ).rejects.toThrow(/All providers in CascadingLLMDriver failed/);
  });
});
