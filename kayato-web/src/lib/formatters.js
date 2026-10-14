export const DEFAULT_CURRENCY = 'PHP';
export const DEFAULT_TIMEZONE = 'Asia/Manila';

export const CURRENCY_OPTIONS = [
  { value: 'PHP', label: 'PHP, Philippine peso' },
  { value: 'USD', label: 'USD, US dollar' },
  { value: 'EUR', label: 'EUR, Euro' },
  { value: 'GBP', label: 'GBP, British pound' },
  { value: 'JPY', label: 'JPY, Japanese yen' },
  { value: 'SGD', label: 'SGD, Singapore dollar' },
  { value: 'AUD', label: 'AUD, Australian dollar' },
  { value: 'CAD', label: 'CAD, Canadian dollar' },
];

export const TIMEZONE_OPTIONS = [
  { value: 'Asia/Manila', label: 'Asia/Manila (Philippines)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo' },
  { value: 'Asia/Seoul', label: 'Asia/Seoul' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong Kong' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai' },
  { value: 'Europe/London', label: 'Europe/London' },
  { value: 'Europe/Paris', label: 'Europe/Paris' },
  { value: 'America/New_York', label: 'America/New York' },
  { value: 'America/Los_Angeles', label: 'America/Los Angeles' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney' },
  { value: 'UTC', label: 'UTC' },
];

export function normalizeCurrency(value) {
  const currency = String(value || DEFAULT_CURRENCY).toUpperCase();
  return CURRENCY_OPTIONS.some((option) => option.value === currency) ? currency : DEFAULT_CURRENCY;
}

export function normalizeTimeZone(value) {
  const timeZone = String(value || DEFAULT_TIMEZONE);
  try {
    new Intl.DateTimeFormat('en-PH', { timeZone }).format();
    return timeZone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function currencyLabel(value) {
  const currency = normalizeCurrency(value);
  return CURRENCY_OPTIONS.find((option) => option.value === currency)?.label || currency;
}

export function formatCurrency(value, currency = DEFAULT_CURRENCY) {
  const amount = Number(value);
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: normalizeCurrency(currency),
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function dateOnlyKey(value) {
  if (!value) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

export function dateOnlyValue(value) {
  const key = dateOnlyKey(value);
  return key ? new Date(`${key}T00:00:00.000Z`) : null;
}

export function formatCalendarDate(value, options = { dateStyle: 'medium' }) {
  const date = dateOnlyValue(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-PH', { ...options, timeZone: 'UTC' }).format(date);
}

export function formatDateTime(value, timeZone = DEFAULT_TIMEZONE, options = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const displayOptions = Object.keys(options).length ? options : { dateStyle: 'medium', timeStyle: 'short' };
  return new Intl.DateTimeFormat('en-PH', {
    ...displayOptions,
    timeZone: normalizeTimeZone(timeZone),
  }).format(date);
}

export function dateKeyInTimeZone(value = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: normalizeTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function todayInTimeZone(timeZone = DEFAULT_TIMEZONE) {
  const [year, month, day] = dateKeyInTimeZone(new Date(), timeZone).split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function calendarDayDifference(value, timeZone = DEFAULT_TIMEZONE) {
  const due = dateOnlyValue(value);
  const today = dateOnlyValue(dateKeyInTimeZone(new Date(), timeZone));
  if (!due || !today) return null;
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}
