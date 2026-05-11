const STRICT_ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z)?)?$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DateWindowBoundary = "start" | "end";

export function isStrictIsoDateString(value: string): boolean {
  return parseStrictIsoDate(value) !== undefined;
}

export function isStrictIsoDateOnlyString(value: string): boolean {
  const parsed = parseStrictIsoDate(value);
  return parsed !== undefined && parsed.dateOnly;
}

export function strictIsoDateTimestampMs(value: string, boundary: DateWindowBoundary = "start"): number | undefined {
  const parsed = parseStrictIsoDate(value);
  if (parsed === undefined) {
    return undefined;
  }
  if (boundary === "end" && parsed.dateOnly) {
    return parsed.timestampMs + DAY_MS - 1;
  }
  return parsed.timestampMs;
}

function parseStrictIsoDate(value: string): { timestampMs: number; dateOnly: boolean } | undefined {
  const match = STRICT_ISO_DATE_PATTERN.exec(value);
  if (match === null) {
    return undefined;
  }

  const [, yearRaw, monthRaw, dayRaw, hourRaw = "00", minuteRaw = "00", secondRaw = "00", millisecondRaw = "0", zoneRaw] = match;
  const dateOnly = match[4] === undefined;
  if (!dateOnly && zoneRaw !== "Z") {
    return undefined;
  }

  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const hour = Number(hourRaw);
  const minute = Number(minuteRaw);
  const second = Number(secondRaw);
  const millisecond = Number(millisecondRaw.padEnd(3, "0"));
  const timestampMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const date = new Date(timestampMs);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second ||
    date.getUTCMilliseconds() !== millisecond
  ) {
    return undefined;
  }

  return { timestampMs, dateOnly };
}
