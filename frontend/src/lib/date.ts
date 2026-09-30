import type { Timestamp } from '@lib/api/query';

const LOCALE =
  typeof navigator !== 'undefined' && navigator.language
    ? navigator.language
    : 'en-us';

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat(LOCALE, {
  style: 'short',
  numeric: 'auto'
});

type Units = Readonly<Partial<Record<Intl.RelativeTimeFormatUnit, number>>>;

const UNITS: Units = {
  day: 24 * 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  minute: 60 * 1000
};

export function formatDate(
  targetDate: Timestamp,
  mode: 'post' | 'full' | 'joined'
): string {
  const date = targetDate.toDate();

  if (mode === 'full') return getFullTime(date);
  if (mode === 'post') return getCompactPostTime(date);
  return getJoinedTime(date);
}

export function formatNumber(number: number): string {
  return new Intl.NumberFormat(LOCALE, {
    notation: number > 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1
  }).format(number);
}

export function getPostTime(targetDate: Timestamp): string {
  const date = targetDate.toDate();

  const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  const formattedDate = dateFormatter.format(date);
  const formattedTime = timeFormatter.format(date);

  return `${formattedTime} · ${formattedDate}`;
}

function getFullTime(date: Date): string {
  const fullDate = new Intl.DateTimeFormat(LOCALE, {
    hour: 'numeric',
    minute: 'numeric',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date);

  const splittedDate = fullDate.split(', ');

  const formattedDate =
    splittedDate.length === 2
      ? [...splittedDate].reverse().join(' · ')
      : [splittedDate.slice(0, 2).join(', '), splittedDate.slice(-1)]
          .reverse()
          .join(' · ');

  return formattedDate;
}

function getCompactPostTime(date: Date): string {
  if (isToday(date)) return getRelativeTime(date);
  if (isYesterday(date))
    return new Intl.DateTimeFormat(LOCALE, {
      day: 'numeric',
      month: 'short'
    }).format(date);

  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: isCurrentYear(date) ? undefined : 'numeric'
  }).format(date);
}

function getJoinedTime(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function getRelativeTime(date: Date): string {
  const elapsed = +date - +new Date();

  if (elapsed > 0) return RELATIVE_TIME_FORMATTER.format(0, 'second');

  const unitsItems = Object.entries(UNITS) as [keyof Units, number][];

  for (const [unit, millis] of unitsItems)
    if (Math.abs(elapsed) > millis)
      return RELATIVE_TIME_FORMATTER.format(Math.round(elapsed / millis), unit);

  return RELATIVE_TIME_FORMATTER.format(Math.round(elapsed / 1000), 'second');
}

function isToday(date: Date): boolean {
  return new Date().toDateString() === date.toDateString();
}

function isYesterday(date: Date): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toDateString() === date.toDateString();
}

function isCurrentYear(date: Date): boolean {
  return date.getFullYear() === new Date().getFullYear();
}
