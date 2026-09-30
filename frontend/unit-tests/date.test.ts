import { afterEach, expect, jest, test } from '@jest/globals';

const now = new Date('2026-01-02T12:00:00Z');

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test.each(['ja-JP', 'en-US', 'fr-FR', 'zh-CN', 'ar'])(
  'formats recent tweets without parsing localized text (%s)',
  async (locale) => {
    jest.resetModules();
    jest.spyOn(window.navigator, 'language', 'get').mockReturnValue(locale);
    jest.useFakeTimers({ now });
    const { formatDate } = await import('../src/lib/date');
    const { Timestamp } = await import('../src/lib/api/query');
    const formatter = new Intl.RelativeTimeFormat(locale, {
      style: 'short',
      numeric: 'auto'
    });
    const cases: [number, number, Intl.RelativeTimeFormatUnit][] = [
      [0, 0, 'second'],
      [-100, 0, 'second'],
      [-5000, -5, 'second'],
      [-5 * 60000, -5, 'minute'],
      [-2 * 3600000, -2, 'hour'],
      [1000, 0, 'second']
    ];
    for (const [offset, value, unit] of cases) {
      const timestamp = new Timestamp(new Date(+now + offset).toISOString());
      expect(formatDate(timestamp, 'tweet')).toBe(
        formatter.format(value, unit)
      );
    }
  }
);
