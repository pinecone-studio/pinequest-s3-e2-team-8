"use client";

import { useMemo, useState } from "react";

const TIMEZONE = "Asia/Ulaanbaatar";

export type ExamScheduleRow = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
};

type Exam = {
  id: string;
  title: string;
  startHour: number;
  startMin: number;
  endHour: number;
  endMin: number;
  color: "green" | "gray";
};

const START_HOUR = 8;
const END_HOUR = 17;
const TOTAL_HOURS = END_HOUR - START_HOUR; // 9
const TIME_LABELS = Array.from(
  { length: TOTAL_HOURS + 1 },
  (_, i) => `${START_HOUR + i}:00`,
);

function toMinutes(h: number, m: number) {
  return (h - START_HOUR) * 60 + m;
}
const TOTAL_MINUTES = TOTAL_HOURS * 60;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatTime(h: number, m: number) {
  return `${pad(h)}:${pad(m)}`;
}

function getTimeParts(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIMEZONE,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hour, minute };
}

function getDateKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", {
    timeZone: TIMEZONE,
  });
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function shiftDateKey(dateKey: string, days: number) {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDateLabelFromKey(dateKey: string) {
  const date = parseDateKey(dateKey);
  return `${date.getUTCMonth() + 1} сарын ${date.getUTCDate()}`;
}

function getStableColor(id: string): "green" | "gray" {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 1_000_000;
  }
  return Math.abs(hash) % 2 === 0 ? "green" : "gray";
}

function assignRows(exams: Exam[]) {
  const rows: number[] = new Array(exams.length).fill(0);
  for (let i = 0; i < exams.length; i += 1) {
    const usedRows = new Set<number>();
    for (let j = 0; j < i; j += 1) {
      const aStart = toMinutes(exams[j].startHour, exams[j].startMin);
      const aEnd = toMinutes(exams[j].endHour, exams[j].endMin);
      const bStart = toMinutes(exams[i].startHour, exams[i].startMin);
      const bEnd = toMinutes(exams[i].endHour, exams[i].endMin);
      if (aStart < bEnd && aEnd > bStart) {
        usedRows.add(rows[j]);
      }
    }
    let r = 0;
    while (usedRows.has(r)) r += 1;
    rows[i] = r;
  }
  return rows;
}

function clampMinutes(value: number) {
  return Math.max(0, Math.min(TOTAL_MINUTES, value));
}

function SearchIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="9" cy="9" r="6" />
      <path d="M15 15l3 3" strokeLinecap="round" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.5 4.5L7 10l5.5 5.5" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.5 4.5L13 10l-5.5 5.5" />
    </svg>
  );
}

export default function ExamScheduleClient({
  scheduleRows,
  dateLabel,
  todayKey,
}: {
  scheduleRows: ExamScheduleRow[];
  dateLabel: string;
  todayKey: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [visibleDateKey, setVisibleDateKey] = useState(todayKey);

  const exams = useMemo(() => {
    return scheduleRows
      .filter((row) => row.start_time && row.end_time)
      .filter((row) => getDateKey(row.start_time) === visibleDateKey)
      .map((row) => {
        const start = getTimeParts(row.start_time);
        const end = getTimeParts(row.end_time);
        return {
          id: row.id,
          title: row.title,
          startHour: start.hour,
          startMin: start.minute,
          endHour: end.hour,
          endMin: end.minute,
          color: getStableColor(row.id),
        } satisfies Exam;
      })
      .sort(
        (a, b) =>
          a.startHour * 60 + a.startMin - (b.startHour * 60 + b.startMin),
      );
  }, [scheduleRows, visibleDateKey]);

  const filtered = exams.filter((e) =>
    e.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );
  const visibleDateLabel =
    visibleDateKey === todayKey
      ? dateLabel
      : formatDateLabelFromKey(visibleDateKey);
  const isTodaySelected = visibleDateKey === todayKey;
  const emptyMessage =
    exams.length === 0
      ? "Энэ өдөр товлогдсон шалгалт алга."
      : "Хайлтад тохирох шалгалт олдсонгүй.";

  const rows = assignRows(filtered);
  const maxRow = rows.length > 0 ? Math.max(...rows) : 0;
  const ROW_HEIGHT = 62;
  const HEADER_HEIGHT = 48;
  const MIN_TIMELINE_HEIGHT = 474;
  const totalHeight = Math.max(
    MIN_TIMELINE_HEIGHT,
    HEADER_HEIGHT + (maxRow + 1) * ROW_HEIGHT + 28,
  );

  return (
    <div className="pt-[20px]">
      <div>
        <h2
          style={{
            fontSize: 22,
            fontWeight: 500,
            color: "#111827",
            margin: "0 0 10px 0",
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          Шалгалтын хуваарь
        </h2>
      </div>
      <div
        style={{
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          background: "#ffffff",
          borderRadius: 0,
          border: "1px solid #e6ebf2",
          boxShadow: "none",
          padding: 0,
          width: "100%",
          maxWidth: "100%",
          minWidth: 320,
          boxSizing: "border-box",
          overflow: "hidden",
        }}
      >
        {/* Toolbar row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 14px 12px 14px",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {/* Left: date label */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: 18,
                fontWeight: 500,
                color: "#111827",
                letterSpacing: "-0.02em",
              }}
            >
              {visibleDateLabel}
            </span>
          </div>

          {/* Right: toolbar buttons */}
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {showSearch && (
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Хайх..."
                style={{
                  height: 32,
                  borderRadius: 8,
                  border: "1px solid #d9dee7",
                  padding: "0 12px",
                  fontSize: 14,
                  outline: "none",
                  width: 170,
                  background: "#ffffff",
                  color: "#111827",
                }}
              />
            )}

            {/* Search button */}
            <button
              type="button"
              onClick={() => {
                setShowSearch((v) => !v);
                if (showSearch) setSearchQuery("");
              }}
              style={{
                height: 32,
                border: "none",
                background: "transparent",
                padding: 0,
                fontSize: 14,
                cursor: "pointer",
                fontWeight: 400,
                color: showSearch ? "#4b5563" : "#8b92a0",
                display: "flex",
                alignItems: "center",
                gap: 8,
                whiteSpace: "nowrap",
              }}
            >
              <SearchIcon />
              Хайх
            </button>

            <button
              type="button"
              onClick={() => setVisibleDateKey(todayKey)}
              title="Өнөөдөр рүү буцах"
              style={{
                height: 32,
                borderRadius: 8,
                border: "1px solid #d8dee8",
                background: "#ffffff",
                padding: "0 14px",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
                color: "#111827",
                whiteSpace: "nowrap",
                boxShadow: isTodaySelected ? "inset 0 0 0 1px #f1f3f7" : "none",
              }}
            >
              Одоо
            </button>

            {/* Prev / Next arrows */}
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              {(
                [
                  {
                    icon: <ChevronLeftIcon />,
                    key: "prev",
                    shift: -1,
                    title: "Өмнөх өдөр",
                  },
                  {
                    icon: <ChevronRightIcon />,
                    key: "next",
                    shift: 1,
                    title: "Дараах өдөр",
                  },
                ] as const
              ).map((button) => (
                <button
                  key={button.key}
                  type="button"
                  title={button.title}
                  onClick={() =>
                    setVisibleDateKey((current) =>
                      shiftDateKey(current, button.shift),
                    )
                  }
                  style={{
                    width: 26,
                    height: 26,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "#818796",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 0,
                  }}
                >
                  {button.icon}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Timeline */}
        {filtered.length === 0 ? (
          <div
            style={{
              borderTop: "1px solid #edf1f5",
              minHeight: MIN_TIMELINE_HEIGHT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              color: "#9ca3af",
              fontSize: 14,
              background: "#ffffff",
            }}
          >
            {emptyMessage}
          </div>
        ) : (
          <div
            style={{
              overflowX: "auto",
              marginTop: 0,
              borderTop: "1px solid #edf1f5",
            }}
          >
            <div
              style={{
                minWidth: 1180,
                position: "relative",
                height: totalHeight,
                background: "#ffffff",
              }}
            >
              {/* Vertical hour grid lines */}
              {TIME_LABELS.map((label, i) => {
                const pct = (i / TOTAL_HOURS) * 100;
                return (
                  <div
                    key={label}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: `${pct}%`,
                      bottom: 0,
                      width: 1,
                      background:
                        i === 0 || i === TOTAL_HOURS
                          ? "transparent"
                          : "#eceff5",
                      zIndex: 0,
                    }}
                  />
                );
              })}

              {/* Time labels row */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: HEADER_HEIGHT,
                  background: "#fbfcfe",
                }}
              >
                {TIME_LABELS.map((label, i) => (
                  <div
                    key={label}
                    style={{
                      position: "absolute",
                      left: `${(i / TOTAL_HOURS) * 100}%`,
                      fontSize: 12,
                      color: "#7d8594",
                      transform: "translateX(-50%)",
                      whiteSpace: "nowrap",
                      top: 13,
                      fontWeight: 400,
                    }}
                  >
                    {label}
                  </div>
                ))}
              </div>

              {/* Horizontal separator line under time labels */}
              <div
                style={{
                  position: "absolute",
                  top: HEADER_HEIGHT,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: "#eceff5",
                  zIndex: 1,
                }}
              />

              {/* Exam blocks */}
              {filtered.map((exam, idx) => {
                const row = rows[idx];
                const startMinutes = clampMinutes(
                  toMinutes(exam.startHour, exam.startMin),
                );
                const endMinutes = clampMinutes(
                  toMinutes(exam.endHour, exam.endMin),
                );
                const startPct = (startMinutes / TOTAL_MINUTES) * 100;
                const widthPct =
                  ((Math.max(endMinutes, startMinutes + 1) - startMinutes) /
                    TOTAL_MINUTES) *
                  100;
                const isGreen = exam.color === "green";

                return (
                  <div
                    key={exam.id}
                    title={`${exam.title}\n${formatTime(
                      exam.startHour,
                      exam.startMin,
                    )} - ${formatTime(exam.endHour, exam.endMin)}`}
                    style={{
                      position: "absolute",
                      top: HEADER_HEIGHT + row * ROW_HEIGHT + 14,
                      left: `calc(${startPct}% + 16px)`,
                      width: `calc(${widthPct}% - 16px)`,
                      height: 48,
                      borderRadius: 6,
                      background: isGreen ? "#cdf4d3" : "#f1f3f6",
                      borderLeft: `3px solid ${isGreen ? "#49d977" : "#9ca3af"}`,
                      padding: "8px 10px",
                      boxSizing: "border-box",
                      cursor: "default",
                      zIndex: 2,
                      overflow: "hidden",
                      transition: "box-shadow 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.boxShadow =
                        "0 1px 3px rgba(15, 23, 42, 0.08)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.boxShadow =
                        "none";
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: "#2b2f38",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        marginBottom: 3,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {exam.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#8d93a0",
                        fontWeight: 400,
                      }}
                    >
                      {formatTime(exam.startHour, exam.startMin)} -{" "}
                      {formatTime(exam.endHour, exam.endMin)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
