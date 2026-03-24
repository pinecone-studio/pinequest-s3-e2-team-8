/**
 * UB цаг дээр дараах форматаар хэвлэх: "2026.03.24 19:15"
 * Сервер нь аль ч timezone-д байлаа зөв харуулна
 */
export function formatDateTimeUB(dateStr: string): string {
  const d = new Date(dateStr);
  const f = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = f.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  return `${get("year")}.${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
}
