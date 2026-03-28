export const ULAANBAATAR_TIME_ZONE = "Asia/Ulaanbaatar";
export const ULAANBAATAR_UTC_OFFSET = "+08:00";

function getValidDate(dateLike: string | Date) {
  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPartsMap(
  dateLike: string | Date,
  options: Intl.DateTimeFormatOptions
) {
  const date = getValidDate(dateLike);
  if (!date) return null;

  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: ULAANBAATAR_TIME_ZONE,
    ...options,
  });
  return new Map(
    formatter
      .formatToParts(date)
      .map((part) => [part.type, part.value])
  );
}

function getPart(parts: Map<string, string> | null, type: string) {
  return parts?.get(type) ?? "";
}

export function parseUlaanbaatarDateTime(value: string) {
  const raw = value.trim();
  if (!raw) return null;

  let normalized = raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    normalized = `${raw}T00:00:00${ULAANBAATAR_UTC_OFFSET}`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) {
    normalized = `${raw}:00${ULAANBAATAR_UTC_OFFSET}`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(raw)) {
    normalized = `${raw}${ULAANBAATAR_UTC_OFFSET}`;
  }

  return getValidDate(normalized);
}

export function toUlaanbaatarIsoString(value: string) {
  return parseUlaanbaatarDateTime(value)?.toISOString() ?? null;
}

export function splitDateTimeForUlaanbaatar(iso?: string | null) {
  if (!iso) {
    return { date: "", time: "" };
  }

  const parts = getPartsMap(iso, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  if (!parts) {
    return { date: "", time: "" };
  }

  return {
    date: `${getPart(parts, "year")}-${getPart(parts, "month")}-${getPart(parts, "day")}`,
    time: `${getPart(parts, "hour")}:${getPart(parts, "minute")}`,
  };
}

export function formatDateTimeUB(dateLike: string | Date): string {
  const parts = getPartsMap(dateLike, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (!parts) return "";

  return `${getPart(parts, "year")}.${getPart(parts, "month")}.${getPart(parts, "day")} ${getPart(parts, "hour")}:${getPart(parts, "minute")}`;
}

export function formatTimeUB(dateLike: string | Date): string {
  const parts = getPartsMap(dateLike, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  if (!parts) return "";

  return `${getPart(parts, "hour")}:${getPart(parts, "minute")}`;
}

export function formatDateLabelUB(dateLike: string | Date): string {
  const date = getValidDate(dateLike);
  if (!date) return "";

  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: ULAANBAATAR_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

export function formatDateStampUB(dateLike: string | Date): string {
  const parts = getPartsMap(dateLike, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  if (!parts) return "";

  return `${getPart(parts, "year")}-${getPart(parts, "month")}-${getPart(parts, "day")}`;
}
