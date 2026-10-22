/**
 * Zero-dependency robust UNIX Cron & Natural Interval Parser for OpenTalon.
 * Supports:
 * - Standard 5-field UNIX cron: "min hour dom mon dow" (e.g. "0 9 * * 1-5", "* /15 * * * *")
 * - Shorthand aliases: "@hourly", "@daily", "@weekly", "@monthly", "@yearly", "@minutely"
 * - Natural intervals: "every 30s", "every 15m", "every 2h", "every 1d"
 */

export interface ParsedCronSchedule {
  type: 'cron' | 'interval';
  intervalMs?: number;
  cronString?: string;
}

export class CronParser {
  private static readonly ALIASES: Record<string, string> = {
    '@yearly': '0 0 1 1 *',
    '@annually': '0 0 1 1 *',
    '@monthly': '0 0 1 * *',
    '@weekly': '0 0 * * 0',
    '@daily': '0 0 * * *',
    '@midnight': '0 0 * * *',
    '@hourly': '0 * * * *',
    '@minutely': '* * * * *',
  };

  /**
   * Parse a cron expression or natural interval into a normalized representation.
   */
  public static parse(expression: string): ParsedCronSchedule {
    const trimmed = expression.trim();

    // Check for natural interval: "every <number> <unit>"
    const naturalMatch = trimmed.match(/^every\s+(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hours?|d|days?)$/i);
    if (naturalMatch) {
      const amount = parseInt(naturalMatch[1], 10);
      const unit = naturalMatch[2].toLowerCase();
      let multiplier = 1000;

      if (unit.startsWith('s')) {
        multiplier = 1000;
      } else if (unit.startsWith('m')) {
        multiplier = 60 * 1000;
      } else if (unit.startsWith('h')) {
        multiplier = 3600 * 1000;
      } else if (unit.startsWith('d')) {
        multiplier = 86400 * 1000;
      }

      return {
        type: 'interval',
        intervalMs: amount * multiplier,
      };
    }

    // Check for aliases
    const resolved = this.ALIASES[trimmed.toLowerCase()] || trimmed;
    const parts = resolved.split(/\s+/);

    if (parts.length !== 5) {
      throw new Error(
        `Invalid cron expression "${expression}". Expected 5 fields (min hour dom mon dow) or natural interval (e.g. "every 15m").`
      );
    }

    return {
      type: 'cron',
      cronString: resolved,
    };
  }

  /**
   * Computes the next run epoch timestamp (in ms) given a schedule and reference time.
   */
  public static getNextRunTime(expression: string, fromDate: Date = new Date()): number {
    const parsed = this.parse(expression);

    if (parsed.type === 'interval' && parsed.intervalMs) {
      return fromDate.getTime() + parsed.intervalMs;
    }

    const cron = parsed.cronString!;
    const parts = cron.split(/\s+/);
    const [minStr, hourStr, domStr, monStr, dowStr] = parts;

    const minMatches = this.parseField(minStr, 0, 59);
    const hourMatches = this.parseField(hourStr, 0, 23);
    const domMatches = this.parseField(domStr, 1, 31);
    const monMatches = this.parseField(monStr, 1, 12);
    const dowMatches = this.parseField(dowStr, 0, 6, true); // 0 or 7 = Sunday

    // Iterate minute by minute, up to 366 days in the future
    const current = new Date(fromDate.getTime());
    current.setSeconds(0, 0);
    current.setMinutes(current.getMinutes() + 1); // Advance at least 1 minute

    const maxIterations = 366 * 24 * 60; // Max minutes in a leap year
    for (let i = 0; i < maxIterations; i++) {
      const month = current.getMonth() + 1; // 1-12
      const date = current.getDate(); // 1-31
      const day = current.getDay(); // 0-6 (0 = Sun)
      const hour = current.getHours(); // 0-23
      const minute = current.getMinutes(); // 0-59

      if (
        monMatches.has(month) &&
        domMatches.has(date) &&
        dowMatches.has(day) &&
        hourMatches.has(hour) &&
        minMatches.has(minute)
      ) {
        return current.getTime();
      }

      current.setMinutes(current.getMinutes() + 1);
    }

    throw new Error(`Unable to find next run time for cron expression "${expression}" within 1 year.`);
  }

  /**
   * Helper to parse a single cron field with ranges, lists, and steps.
   */
  private static parseField(
    field: string,
    min: number,
    max: number,
    isDayOfWeek = false
  ): Set<number> {
    const set = new Set<number>();

    // Handle comma-separated list
    const items = field.split(',');
    for (const item of items) {
      if (item === '*') {
        for (let i = min; i <= max; i++) set.add(i);
      } else if (item.startsWith('*/')) {
        const step = parseInt(item.slice(2), 10);
        if (isNaN(step) || step <= 0) throw new Error(`Invalid step in "${item}"`);
        for (let i = min; i <= max; i += step) set.add(i);
      } else if (item.includes('-')) {
        const [startStr, endStep] = item.split('-');
        let step = 1;
        let endStr = endStep;
        if (endStep.includes('/')) {
          const [e, s] = endStep.split('/');
          endStr = e;
          step = parseInt(s, 10);
        }
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        for (let i = start; i <= end; i += step) {
          set.add(isDayOfWeek && i === 7 ? 0 : i);
        }
      } else {
        const val = parseInt(item, 10);
        if (isNaN(val)) throw new Error(`Invalid field value "${item}"`);
        set.add(isDayOfWeek && val === 7 ? 0 : val);
      }
    }

    return set;
  }
}
