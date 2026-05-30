import { describe, it, expect } from 'vitest';
import {
  calculateStreak,
  calculateMonthlyStats,
  isStreakAlive,
  aggregateCalendars,
  calculateWrappedStats,
} from './calculate';
import type { ContributionCalendar } from '../types';

function buildCalendar(counts: number[]): ContributionCalendar {
  const weeks = [];
  for (let i = 0; i < counts.length; i += 7) {
    const slice = counts.slice(i, i + 7);
    weeks.push({
      contributionDays: slice.map((count, j) => ({
        contributionCount: count,
        date: `2024-01-${String(i + j + 1).padStart(2, '0')}`,
      })),
    });
  }
  return {
    totalContributions: counts.reduce((a, b) => a + b, 0),
    weeks,
  };
}

describe('calculateStreak', () => {
  it('returns all zeros for a user with 0 contributions', () => {
    const calendar = buildCalendar([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

    const result = calculateStreak(calendar);

    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
    expect(result.totalContributions).toBe(0);
  });

  it('counts an active streak when the last day has contributions', () => {
    const calendar = buildCalendar([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1]);

    const result = calculateStreak(calendar);

    expect(result.currentStreak).toBe(9);
    expect(result.longestStreak).toBe(9);
    expect(result.totalContributions).toBe(9);
  });

  it('resets currentStreak to 0 when both today and yesterday have 0 contributions', () => {
    const calendar = buildCalendar([0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0]);

    const result = calculateStreak(calendar);

    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(5);
    expect(result.totalContributions).toBe(5);
  });

  it('tracks the longest streak independently of the current streak', () => {
    const calendar = buildCalendar([1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1]);

    const result = calculateStreak(calendar);

    expect(result.longestStreak).toBe(7);
    expect(result.currentStreak).toBe(6);
    expect(result.totalContributions).toBe(13);
  });

  it('keeps the streak alive via the grace period when only yesterday has contributions', () => {
    const calendar = buildCalendar([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0]);

    const result = calculateStreak(calendar);

    expect(result.currentStreak).toBe(2);
    expect(result.longestStreak).toBe(2);
  });

  it('keeps the streak alive with a grace period > 1 (e.g. grace=2)', () => {
    const calendar = buildCalendar([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]);

    const resultGrace1 = calculateStreak(calendar, 'UTC', undefined, 1);
    expect(resultGrace1.currentStreak).toBe(0);

    const resultGrace2 = calculateStreak(calendar, 'UTC', undefined, 2);
    expect(resultGrace2.currentStreak).toBe(1);
    expect(resultGrace2.longestStreak).toBe(1);
  });

  it('handles a single active day without crashing (edge case: no "yesterday")', () => {
    const calendar = buildCalendar([1]);

    expect(() => calculateStreak(calendar)).not.toThrow();
    const result = calculateStreak(calendar);
    expect(result.totalContributions).toBe(1);
    expect(result.longestStreak).toBe(1);
  });

  it('does not walk past the start of a 1-day calendar when grace is larger than the available days', () => {
    const calendar = buildCalendar([1]);

    const result = calculateStreak(calendar, 'UTC', undefined, 7);
    expect(result.currentStreak).toBe(1);
  });

  it('handles a single inactive day safely (0 contributions)', () => {
    const calendar = buildCalendar([0]);
    expect(() => calculateStreak(calendar)).not.toThrow();
    const result = calculateStreak(calendar);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
  });

  it('handles an empty contribution calendar safely without crashing', () => {
    const calendar = buildCalendar([]);
    expect(() => calculateStreak(calendar)).not.toThrow();
    const result = calculateStreak(calendar);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
  });

  it('should find the longest streak when it is in the middle of the calendar', () => {
    const calendar = buildCalendar([
      0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1,
      1, 1, 1, 1,
    ]);

    const result = calculateStreak(calendar);

    expect(result.longestStreak).toBe(10);
    expect(result.currentStreak).toBe(5);
  });
});

it('handles massive single-day commit spike timeline', () => {
  const calendar = buildCalendar([
    0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 120, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1,
  ]);

  const result = calculateStreak(calendar);

  expect(result.currentStreak).toBe(7);
  expect(result.longestStreak).toBe(7);
});

describe('calculateStreak — timezone awareness', () => {
  const tzCalendar = {
    totalContributions: 3,
    weeks: [
      {
        contributionDays: [
          { contributionCount: 1, date: '2024-06-12' },
          { contributionCount: 1, date: '2024-06-13' },
          { contributionCount: 1, date: '2024-06-14' },
          { contributionCount: 0, date: '2024-06-15' },
          { contributionCount: 0, date: '2024-06-16' },
        ],
      },
    ],
  };

  const nowUTC = new Date('2024-06-16T07:00:00.000Z');

  it('breaks the streak when evaluated in UTC because today and yesterday both have 0 commits', () => {
    const result = calculateStreak(tzCalendar, 'UTC', nowUTC);
    expect(result.currentStreak).toBe(0);
  });

  it('preserves the streak when the local date (UTC-8) maps to a day with commits via grace period', () => {
    const result = calculateStreak(tzCalendar, 'Etc/GMT+8', nowUTC);
    expect(result.currentStreak).toBe(3);
  });

  it('falls back to the last available day when the local date is ahead of the calendar data', () => {
    const futureNow = new Date('2024-06-16T12:00:00.000Z');
    const result = calculateStreak(tzCalendar, 'Etc/GMT-14', futureNow);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(3);
  });

  it('still calculates longestStreak correctly regardless of timezone', () => {
    const result = calculateStreak(tzCalendar, 'Etc/GMT+8', nowUTC);
    expect(result.longestStreak).toBe(3);
    expect(result.totalContributions).toBe(3);
  });

  it('returns the correct local todayDate for use by the SVG generator', () => {
    const result = calculateStreak(tzCalendar, 'Etc/GMT+8', nowUTC);
    expect(result.todayDate).toBe('2024-06-15');
  });

  it('returns UTC date as todayDate when no timezone is given', () => {
    const result = calculateStreak(tzCalendar, 'UTC', nowUTC);
    expect(result.todayDate).toBe('2024-06-16');
  });

  it('verifies streak formulas for timezone shifts around midnight timeline', () => {
    const midnightCalendar: ContributionCalendar = {
      totalContributions: 2,
      weeks: [
        {
          contributionDays: [
            { contributionCount: 1, date: '2024-06-14' },
            { contributionCount: 1, date: '2024-06-15' },
            { contributionCount: 0, date: '2024-06-16' },
            { contributionCount: 0, date: '2024-06-17' },
            { contributionCount: 0, date: '2024-06-18' },
            { contributionCount: 0, date: '2024-06-19' },
            { contributionCount: 0, date: '2024-06-20' },
          ],
        },
      ],
    };

    const nowMidnight = new Date('2024-06-16T07:59:00.000Z');

    const resultUTCMinus8 = calculateStreak(midnightCalendar, 'Etc/GMT+8', nowMidnight);
    expect(resultUTCMinus8.currentStreak).toBe(2);
    expect(resultUTCMinus8.longestStreak).toBe(2);

    const resultUTCPlus8 = calculateStreak(midnightCalendar, 'Etc/GMT-8', nowMidnight);
    expect(resultUTCPlus8.currentStreak).toBe(2);
    expect(resultUTCPlus8.longestStreak).toBe(2);
  });
});

describe('isStreakAlive', () => {
  it('returns true when both today and yesterday have contributions', () => {
    expect(isStreakAlive({ contributionCount: 1 }, { contributionCount: 1 })).toBe(true);
  });

  it('returns true when only today has contributions', () => {
    expect(isStreakAlive({ contributionCount: 1 }, { contributionCount: 0 })).toBe(true);
  });

  it('returns true when only yesterday has contributions', () => {
    expect(isStreakAlive({ contributionCount: 0 }, { contributionCount: 1 })).toBe(true);
  });

  it('returns false when both today and yesterday have zero contributions', () => {
    expect(isStreakAlive({ contributionCount: 0 }, { contributionCount: 0 })).toBe(false);
  });

  it('returns false when yesterday is null and today has no contributions', () => {
    expect(isStreakAlive({ contributionCount: 0 }, null)).toBe(false);
  });
});

describe('calculateMonthlyStats', () => {
  it('calculates monthly stats correctly when both months have commits', () => {
    const calendar = {
      totalContributions: 15,
      weeks: [
        {
          contributionDays: [
            { contributionCount: 5, date: '2024-05-15' },
            { contributionCount: 10, date: '2024-06-10' },
          ],
        },
      ],
    };
    const now = new Date('2024-06-15T12:00:00Z');
    const result = calculateMonthlyStats(calendar, 'UTC', now);

    expect(result.currentMonthTotal).toBe(10);
    expect(result.previousMonthTotal).toBe(5);
    expect(result.deltaAbsolute).toBe(5);
    expect(result.deltaPercentage).toBe(100);
    expect(result.currentMonthName).toBe('June');
  });

  it('handles zero previous month contributions', () => {
    const calendar = {
      totalContributions: 10,
      weeks: [
        {
          contributionDays: [{ contributionCount: 10, date: '2024-06-10' }],
        },
      ],
    };
    const now = new Date('2024-06-15T12:00:00Z');
    const result = calculateMonthlyStats(calendar, 'UTC', now);

    expect(result.previousMonthTotal).toBe(0);
    expect(result.currentMonthTotal).toBe(10);
    expect(result.deltaPercentage).toBeNull();
  });

  it('handles zero current month contributions', () => {
    const calendar = {
      totalContributions: 5,
      weeks: [
        {
          contributionDays: [{ contributionCount: 5, date: '2024-05-10' }],
        },
      ],
    };
    const now = new Date('2024-06-15T12:00:00Z');
    const result = calculateMonthlyStats(calendar, 'UTC', now);

    expect(result.previousMonthTotal).toBe(5);
    expect(result.currentMonthTotal).toBe(0);
    expect(result.deltaPercentage).toBe(-100);
  });

  it('handles negative delta correctly', () => {
    const calendar = {
      totalContributions: 15,
      weeks: [
        {
          contributionDays: [
            { contributionCount: 10, date: '2024-05-10' },
            { contributionCount: 5, date: '2024-06-10' },
          ],
        },
      ],
    };
    const now = new Date('2024-06-15T12:00:00Z');
    const result = calculateMonthlyStats(calendar, 'UTC', now);

    expect(result.previousMonthTotal).toBe(10);
    expect(result.currentMonthTotal).toBe(5);
    expect(result.deltaPercentage).toBe(-50);
    expect(result.deltaAbsolute).toBe(-5);
  });

  it('handles year boundary correctly (Jan vs Dec)', () => {
    const calendar = {
      totalContributions: 15,
      weeks: [
        {
          contributionDays: [
            { contributionCount: 10, date: '2023-12-15' },
            { contributionCount: 5, date: '2024-01-15' },
          ],
        },
      ],
    };
    const now = new Date('2024-01-15T12:00:00Z');
    const result = calculateMonthlyStats(calendar, 'UTC', now);

    expect(result.previousMonthTotal).toBe(10);
    expect(result.currentMonthTotal).toBe(5);
    expect(result.currentMonthName).toBe('January');
  });

  it('verify January correctly uses December of previous year with explicit now baseline', () => {
    const calendar = {
      totalContributions: 15,
      weeks: [
        {
          contributionDays: [
            { contributionCount: 10, date: '2023-12-15' },
            { contributionCount: 5, date: '2024-01-15' },
          ],
        },
      ],
    };
    const now = new Date('2024-01-20T12:00:00Z');
    const result = calculateMonthlyStats(calendar, 'UTC', now);

    expect(result.currentMonthTotal).toBe(5);
    expect(result.previousMonthTotal).toBe(10);
    expect(result.currentMonthName).toBe('January');
  });

  it('returns zeros and does not crash when given an empty calendar', () => {
    const emptyCalendar = {
      totalContributions: 0,
      weeks: [],
    } as Parameters<typeof calculateMonthlyStats>[0];

    const testDate = new Date('2026-05-29T12:00:00Z');
    let result: ReturnType<typeof calculateMonthlyStats>;

    expect(() => {
      result = calculateMonthlyStats(emptyCalendar, 'UTC', testDate);
    }).not.toThrow();

    expect(result!.currentMonthTotal).toBe(0);
    expect(result!.previousMonthTotal).toBe(0);
  });
});

describe('calculateStreak — empty and sparse year edge cases', () => {
  it('returns stable output when all weeks have zero-contribution days', () => {
    const calendar = buildCalendar([
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const result = calculateStreak(calendar);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
    expect(result.totalContributions).toBe(0);
    expect(result.todayDate).toBeDefined();
  });

  it('is deterministic: same empty calendar always returns identical output', () => {
    const calendar = buildCalendar([]);
    const fixedNow = new Date('2024-01-15T12:00:00Z');
    const r1 = calculateStreak(calendar, 'UTC', fixedNow);
    const r2 = calculateStreak(calendar, 'UTC', fixedNow);
    expect(r1).toEqual(r2);
  });

  it('handles partial year — only one week of data — without crashing', () => {
    const calendar = buildCalendar([0, 1, 0, 0, 1, 0, 0]);
    expect(() => calculateStreak(calendar)).not.toThrow();
    const result = calculateStreak(calendar);
    expect(result.longestStreak).toBe(1);
    expect(result.totalContributions).toBe(2);
  });
});

describe('calculateStreak — todayDate format', () => {
  const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

  it('todayDate matches YYYY-MM-DD for a normal calendar', () => {
    const calendar = buildCalendar([1, 0, 1, 1, 0, 1, 1]);
    const fixedNow = new Date('2024-01-07T12:00:00Z');
    const result = calculateStreak(calendar, 'UTC', fixedNow);
    expect(result.todayDate).toMatch(DATE_REGEX);
  });

  it('todayDate matches YYYY-MM-DD for an empty calendar', () => {
    const emptyCalendar = buildCalendar([]);
    const fixedNow = new Date('2024-03-15T00:00:00Z');
    const result = calculateStreak(emptyCalendar, 'UTC', fixedNow);
    expect(result.todayDate).toMatch(DATE_REGEX);
  });

  it('todayDate matches YYYY-MM-DD when a non-UTC timezone shifts the local date', () => {
    const calendar = buildCalendar([1, 1, 1, 1, 1, 1, 1]);
    const fixedNow = new Date('2024-01-07T20:00:00Z');
    const result = calculateStreak(calendar, 'Asia/Kolkata', fixedNow);
    expect(result.todayDate).toMatch(DATE_REGEX);
  });
});

describe('calculateStreak — year boundary transition (Dec 31 → Jan 1)', () => {
  it('counts a streak that spans the Dec 31 → Jan 1 boundary as one continuous run', () => {
    const calendar: ContributionCalendar = {
      totalContributions: 7,
      weeks: [
        {
          contributionDays: [
            { contributionCount: 0, date: '2024-12-26' },
            { contributionCount: 1, date: '2024-12-27' },
            { contributionCount: 1, date: '2024-12-28' },
            { contributionCount: 1, date: '2024-12-29' },
            { contributionCount: 1, date: '2024-12-30' },
            { contributionCount: 1, date: '2024-12-31' },
            { contributionCount: 1, date: '2025-01-01' },
          ],
        },
        {
          contributionDays: [{ contributionCount: 1, date: '2025-01-02' }],
        },
      ],
    };

    const now = new Date('2025-01-02T12:00:00Z');
    const result = calculateStreak(calendar, 'UTC', now);

    expect(result.currentStreak).toBe(7);
    expect(result.longestStreak).toBe(7);
    expect(result.totalContributions).toBe(7);
    expect(result.todayDate).toBe('2025-01-02');
  });
});

describe('aggregateCalendars', () => {
  it('handles calendars with different numbers of weeks', () => {
    const cal1 = {
      totalContributions: 15,
      weeks: [
        {
          contributionDays: [{ date: '2024-01-01', contributionCount: 5 }],
        },
        {
          contributionDays: [{ date: '2024-01-08', contributionCount: 10 }],
        },
      ],
    };

    const cal2 = {
      totalContributions: 3,
      weeks: [
        {
          contributionDays: [{ date: '2024-01-01', contributionCount: 3 }],
        },
      ],
    };

    const result = aggregateCalendars([cal1, cal2]);

    expect(result.weeks).toHaveLength(2);
    expect(result.weeks[0].contributionDays[0].contributionCount).toBe(8);
    expect(result.weeks[1].contributionDays[0].contributionCount).toBe(10);
  });

  it('returns an empty calendar if no calendars are provided', () => {
    const result = aggregateCalendars([]);
    expect(result.totalContributions).toBe(0);
    expect(result.weeks).toEqual([]);
  });

  it('aggregates multiple calendars correctly for orgs', () => {
    const cal1 = buildCalendar([1, 0, 2]);
    const cal2 = buildCalendar([0, 3, 1]);

    const result = aggregateCalendars([cal1, cal2]);

    expect(result.totalContributions).toBe(7);
    expect(result.weeks[0].contributionDays[0].contributionCount).toBe(1);
    expect(result.weeks[0].contributionDays[1].contributionCount).toBe(3);
    expect(result.weeks[0].contributionDays[2].contributionCount).toBe(3);
  });
});

describe('calculateWrappedStats', () => {
  it('returns weekendRatio as 0 when all contributions occur on weekdays', () => {
    const calendar = {
      totalContributions: 25,
      weeks: [
        {
          contributionDays: [
            { date: '2024-01-01', contributionCount: 5 },
            { date: '2024-01-02', contributionCount: 5 },
            { date: '2024-01-03', contributionCount: 5 },
            { date: '2024-01-04', contributionCount: 5 },
            { date: '2024-01-05', contributionCount: 5 },
          ],
        },
      ],
    };

    const result = calculateWrappedStats(calendar);

    expect(result.weekendRatio).toBe(0);
  });

  it('calculates GitHub Wrapped stats accurately', () => {
    const cal = buildCalendar([0, 0, 0, 0, 0, 5, 15]);

    const result = calculateWrappedStats(cal);

    expect(result.totalContributions).toBe(20);
    expect(result.highestDailyCount).toBe(15);
    expect(result.mostActiveDate).toBe('2024-01-07');
    expect(result.busiestMonth).toBe('2024-01');
    expect(result.weekendRatio).toBe(100);
  });

  it('verify empty calendar returns safe zero values', () => {
    expect(() => calculateWrappedStats({ totalContributions: 0, weeks: [] })).not.toThrow();

    const result = calculateWrappedStats({ totalContributions: 0, weeks: [] });

    expect(result.weekendRatio).toBe(0);
    expect(result.highestDailyCount).toBe(0);
  });

  it('returns weekendRatio === 100 when all contributions are on weekends', () => {
    const weekendCalendar = {
      totalContributions: 10,
      weeks: [
        {
          contributionDays: [
            { date: '2026-05-02', contributionCount: 5 },
            { date: '2026-05-03', contributionCount: 5 },
            { date: '2026-05-04', contributionCount: 0 },
          ],
        },
      ],
    } as Parameters<typeof calculateWrappedStats>[0];

    const result = calculateWrappedStats(weekendCalendar);

    expect(result.weekendRatio).toBe(100);
  });
});
