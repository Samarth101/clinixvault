/**
 * ClinixVault Indian Standard Time (IST / GMT+5:30) Formatting Utilities.
 * Enforces precise Indian time across all clinical reports, ambient transcripts,
 * audit logs, and executive header clocks.
 */

export const IST_TIMEZONE = 'Asia/Kolkata';

/**
 * Formats a Date object or timestamp into 12-hour IST time: "12:15:30 PM IST"
 */
export function formatISTTime(dateInput: Date | string | number = new Date(), includeSeconds = true): string {
  try {
    const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return 'Invalid Date';

    const timeStr = new Intl.DateTimeFormat('en-IN', {
      timeZone: IST_TIMEZONE,
      hour: 'numeric',
      minute: '2-digit',
      ...(includeSeconds ? { second: '2-digit' } : {}),
      hour12: true,
    }).format(d);

    return `${timeStr} IST`;
  } catch {
    return new Date().toLocaleTimeString();
  }
}

/**
 * Formats a Date object or timestamp into Indian Standard Date: "30 Oct 2026"
 */
export function formatISTDate(dateInput: Date | string | number = new Date()): string {
  try {
    const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return 'Invalid Date';

    return new Intl.DateTimeFormat('en-IN', {
      timeZone: IST_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return new Date().toLocaleDateString();
  }
}

/**
 * Formats into full date-time string: "30 Oct 2026, 12:15:30 PM IST"
 */
export function formatISTDateTime(dateInput: Date | string | number = new Date()): string {
  try {
    const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return 'Invalid Date';

    return `${formatISTDate(d)}, ${formatISTTime(d, true)}`;
  } catch {
    return new Date().toLocaleString();
  }
}

/**
 * Formats a timestamp for clinical logging: "HH:mm:ss.SSS" in IST
 */
export function formatISTLogTimestamp(dateInput: Date | string | number = new Date()): string {
  try {
    const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return '00:00:00.000';

    const parts = new Intl.DateTimeFormat('en-IN', {
      timeZone: IST_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d);

    const hour = parts.find((p) => p.type === 'hour')?.value || '00';
    const minute = parts.find((p) => p.type === 'minute')?.value || '00';
    const second = parts.find((p) => p.type === 'second')?.value || '00';
    const ms = String(d.getMilliseconds()).padStart(3, '0');

    return `${hour}:${minute}:${second}.${ms}`;
  } catch {
    return '00:00:00.000';
  }
}
