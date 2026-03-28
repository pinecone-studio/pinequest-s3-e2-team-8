import type React from "react";
import Link from "next/link";
import DashboardImage from "../_icons/DashboardImage";
import { getEducatorStats } from "@/lib/dashboard/actions";
import { getExamSchedules } from "@/lib/schedule/actions";

// ─── Constants ────────────────────────────────────────────────────────────────
const TIMEZONE = "Asia/Ulaanbaatar";
const TIMELINE_START_HOUR = 8;
const TIMELINE_END_HOUR = 18;

type ScheduleRow = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  room: string | null;
  groups: { id: string; name: string }[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("mn-MN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIMEZONE,
  });
}

function getTimeDecimal(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIMEZONE,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour + minute / 60;
}

function isTodayInUB(iso: string) {
  const todayKey = new Date().toLocaleDateString("en-CA", {
    timeZone: TIMEZONE,
  });
  const rowKey = new Date(iso).toLocaleDateString("en-CA", {
    timeZone: TIMEZONE,
  });
  return todayKey === rowKey;
}

function getStableColorIndex(id: string, size: number) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 1_000_000;
  }
  return Math.abs(hash) % size;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number;
  sub: string;
  color: "blue" | "orange" | "yellow";
}) {
  const bg: Record<string, string> = {
    blue: "#4F9DF7",
    orange: "#FF993A",
    yellow: "#FFD143",
  };
  const blob: Record<string, string> = {
    blue: "#2F6BD7",
    orange: "#FF7E07",
    yellow: "#FFC000",
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-4 text-white shadow-lg"
      style={{ backgroundColor: bg[color], minHeight: 90 }}
    >
      {/* decorative blobs */}
      <div
        className="absolute rounded-[50%] opacity-60"
        style={{
          top: "-30%",
          left: "-20%",
          width: "60%",
          height: "80%",
          backgroundColor: blob[color],
        }}
      />
      <div
        className="absolute rounded-[40%] opacity-70"
        style={{
          bottom: "-30%",
          right: "-20%",
          width: "50%",
          height: "70%",
          backgroundColor: blob[color],
        }}
      />

      <div className="relative z-10 flex h-full flex-col justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold leading-tight opacity-90">
            {label}
          </p>
          <p className="mt-1 text-3xl font-semibold leading-none">{value}</p>
        </div>
        <p className="text-[10px] opacity-80">{sub}</p>
      </div>
    </div>
  );
}

function MockPreviewCreate() {
  return (
    <div
      style={{
        flex: 1,
        background: "#EDF4FD",
        borderRadius: 12,
        padding: 14,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        marginBottom: 14,
        minHeight: 180,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "white",
          border: "1.5px solid #93C5FD",
          borderRadius: 999,
          padding: "6px 16px",
          fontSize: 12,
          fontWeight: 500,
          color: "#2563EB",
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#3B82F6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
        Эхлэх - Үүсгэх
      </div>

      <div style={{ width: 1, height: 12, background: "#93C5FD" }} />

      <div
        style={{
          width: "100%",
          background: "white",
          border: "1px solid #BFDBFE",
          borderRadius: 10,
          padding: 10,
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <div
            style={{
              width: 40,
              height: 40,
              background: "#E5E7EB",
              borderRadius: 6,
              flexShrink: 0,
            }}
          />
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 5,
              paddingTop: 2,
            }}
          >
            <div
              style={{
                height: 8,
                background: "#E5E7EB",
                borderRadius: 4,
                width: "100%",
              }}
            />
            <div
              style={{
                height: 8,
                background: "#E5E7EB",
                borderRadius: 4,
                width: "80%",
              }}
            />
            <div
              style={{
                height: 8,
                background: "#E5E7EB",
                borderRadius: 4,
                width: "60%",
              }}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <div
            style={{
              height: 8,
              background: "#E5E7EB",
              borderRadius: 4,
              width: "35%",
            }}
          />
          <div
            style={{
              height: 8,
              background: "#E5E7EB",
              borderRadius: 4,
              width: "25%",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function MockPreviewGrade() {
  return (
    <div
      style={{
        flex: 1,
        background: "#EDF4FD",
        borderRadius: 12,
        padding: 14,
        marginBottom: 14,
        minHeight: 180,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          width: 28,
          height: 28,
          background: "white",
          border: "0.5px solid #D1D5DB",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#6B7280"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          paddingTop: 4,
        }}
      >
        <div
          style={{
            background: "white",
            border: "1.5px solid #93C5FD",
            borderRadius: 10,
            padding: 10,
          }}
        >
          <div
            style={{
              height: 8,
              background: "#E5E7EB",
              borderRadius: 4,
              width: "100%",
              marginBottom: 6,
            }}
          />
          <div
            style={{
              height: 8,
              background: "#E5E7EB",
              borderRadius: 4,
              width: "85%",
              marginBottom: 6,
            }}
          />
          <div
            style={{
              height: 8,
              background: "#E5E7EB",
              borderRadius: 4,
              width: "70%",
            }}
          />
        </div>
        <div
          style={{
            background: "white",
            border: "1.5px solid #93C5FD",
            borderRadius: 10,
            padding: 10,
          }}
        >
          <div
            style={{
              height: 8,
              background: "#E5E7EB",
              borderRadius: 4,
              width: "100%",
              marginBottom: 6,
            }}
          />
          <div
            style={{
              height: 8,
              background: "#E5E7EB",
              borderRadius: 4,
              width: "60%",
            }}
          />
        </div>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid #E5E7EB",
  borderRadius: 16,
  padding: 20,
  display: "flex",
  flexDirection: "column",
};

const btnStyle: React.CSSProperties = {
  width: "100%",
  background: "white",
  border: "1px solid #E5E7EB",
  borderRadius: 10,
  padding: "10px 0",
  fontSize: 12,
  fontWeight: 500,
  color: "#111827",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
};

function TimelineRow({ row }: { row: ScheduleRow }) {
  const start = getTimeDecimal(row.start_time);
  const end = getTimeDecimal(row.end_time);
  const totalSpan = TIMELINE_END_HOUR - TIMELINE_START_HOUR;
  const left =
    Math.max(0, Math.min(1, (start - TIMELINE_START_HOUR) / totalSpan)) * 100;
  const width = Math.max(
    2,
    Math.min(1, (end - TIMELINE_START_HOUR) / totalSpan) * 100 - left,
  );

  const blockColors = ["#CFEED7", "#B8D8F7", "#FFE0C2", "#E8D5F5", "#FFD5D5"];
  const colorIndex = getStableColorIndex(row.id, blockColors.length);

  return (
    <div
      className="grid items-center gap-4"
      style={{ gridTemplateColumns: "160px 1fr" }}
    >
      <div>
        <p className="text-[11px] font-semibold text-foreground">{row.title}</p>
        <p className="text-[10px] text-muted-foreground">
          {formatTime(row.start_time)} – {formatTime(row.end_time)}
        </p>
        {row.groups.length > 0 && (
          <p className="text-[10px] text-muted-foreground">
            {row.groups.map((g) => g.name).join(", ")}
          </p>
        )}
      </div>
      <div className="relative h-8 overflow-hidden rounded-lg border bg-muted/20">
        {/* grid lines */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(to right, rgba(148,163,184,0.25), rgba(148,163,184,0.25) 1px, transparent 1px, transparent calc(100% / 10))",
          }}
        />
        {/* event block */}
        <div
          className="absolute top-1/2 h-4 -translate-y-1/2 rounded-md"
          style={{
            left: `${left}%`,
            width: `${width}%`,
            backgroundColor: blockColors[colorIndex],
          }}
        />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default async function EducatorDashboard() {
  const stats = await getEducatorStats();
  const scheduleRows = (await getExamSchedules()) as ScheduleRow[];

  const todayRows = scheduleRows
    .filter((row) => isTodayInUB(row.start_time))
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );

  const timeLabels = Array.from(
    { length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 },
    (_, i) => `${String(TIMELINE_START_HOUR + i).padStart(2, "0")}:00`,
  );

  return (
    <div className="space-y-6">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#FFD372] via-[#FFF7EE] to-[#ced8e6] px-8 py-6">
        <div className="relative z-10 max-w-2xl space-y-2">
          <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
            Багшийн самбар
          </h2>
          <p className="text-sm text-muted-foreground md:text-base">
            Шалгалт, асуулт, хуваарь, дүнгийн удирдлагаа нэг дороос хянаарай.
          </p>
        </div>
        <div className="pointer-events-none absolute bottom-0 right-0 hidden h-full w-auto scale-125 origin-bottom-right md:block">
          <DashboardImage />
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Нийт жишиг даалгаврууд"
          value={stats.totalQuestions}
          sub="Асуултын сан"
          color="blue"
        />
        <StatCard
          label="Нийт шалгалтууд"
          value={stats.totalExams}
          sub="Үүсгэсэн"
          color="orange"
        />
        <StatCard
          label="Оролцоо"
          value={stats.totalParticipants}
          sub="Нийт оролцогч"
          color="yellow"
        />
      </div>
      <div className="w-[701px] h-[52px] flex flex-col justify-between">
        <p className="text-[22px] font-medium text-black leading-none">
          Эдгээр хэрэгтэй хэрэгслүүдийг ашиглаж эхэлцгээе
        </p>
        <p className="text-[14px] text-gray-400 leading-none">
          Шалгалт үүсгэх, шалгалтын хариултад засахад ашиглаж болох манай
          хэрэгслүүдийг судлаарай
        </p>
      </div>
      {/* ── Quick actions ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ ...cardStyle, width: 472, height: 372 }}>
          <p
            style={{
              margin: "0 0 4px",
              fontSize: 14,
              fontWeight: 600,
              color: "#111827",
            }}
          >
            Шинэ шалгалт үүсгэх
          </p>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "#6B7280" }}>
            AI ашиглан шалгалтыг маш амархан үүсгэ!
          </p>
          <MockPreviewCreate />
          <Link href="/educator/create-exam">
            <button style={btnStyle}>
              Шинэ шалгалт үүсгэх <span>↗</span>
            </button>
          </Link>
        </div>

        <div style={{ ...cardStyle, width: 593, height: 372 }}>
          <p
            style={{
              margin: "0 0 4px",
              fontSize: 14,
              fontWeight: 600,
              color: "#111827",
            }}
          >
            Шалгалтын хариулт засах
          </p>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "#6B7280" }}>
            Тексттэй шалгалтыг хянаж засах.
          </p>
          <MockPreviewGrade />
          <Link href="/educator/grading">
            <button style={btnStyle}>
              Шалгалт засах <span>↗</span>
            </button>
          </Link>
        </div>
      </div>

      {/* ── Schedule ── */}
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <h3 className="mb-1 text-base font-semibold">Шалгалтын хуваарь</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          Өнөөдрийн товлогдсон шалгалтуудын товч харагдац
        </p>

        {/* Header row */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>
              {new Intl.DateTimeFormat("mn-MN", {
                month: "long",
                day: "numeric",
                timeZone: TIMEZONE,
              }).format(new Date())}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
              {todayRows.length} шалгалт
            </span>
          </div>
          <div className="flex items-center gap-2">
            {["Хайх", "Ангилах"].map((label) => (
              <div
                key={label}
                className="flex items-center gap-1 rounded-full border px-3 py-1 text-[11px]"
              >
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
            <button className="h-7 rounded-full border bg-muted px-3 text-[11px] font-medium text-foreground">
              Одоо
            </button>
            <Link href="/educator/schedule">
              <button className="h-7 rounded-full border px-3 text-[11px] hover:bg-muted">
                Бүгд
              </button>
            </Link>
          </div>
        </div>

        {/* Hour labels */}
        <div
          className="mb-2 grid text-[10px] text-muted-foreground"
          style={{
            gridTemplateColumns: `160px repeat(${timeLabels.length}, minmax(0, 1fr))`,
          }}
        >
          <div />
          {timeLabels.map((label) => (
            <span key={label} className="text-right">
              {label}
            </span>
          ))}
        </div>

        {/* Rows */}
        {todayRows.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
            Өнөөдөр товлогдсон шалгалт алга.
          </div>
        ) : (
          <div className="space-y-3">
            {todayRows.map((row) => (
              <TimelineRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
