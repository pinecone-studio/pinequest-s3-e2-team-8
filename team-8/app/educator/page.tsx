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

function MockPreview({ variant }: { variant: "create" | "grade" }) {
  return (
    <div className="mb-3 flex h-16 items-center gap-2 rounded-xl border bg-muted/40 px-3">
      {variant === "create" ? (
        <>
          <div className="h-10 w-8 flex-shrink-0 rounded-md bg-muted" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-1.5 w-4/5 rounded bg-muted" />
            <div className="h-1.5 w-3/5 rounded bg-muted" />
            <div className="h-1.5 w-2/3 rounded bg-muted" />
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col gap-1.5">
          <div className="h-1.5 w-[90%] rounded bg-muted" />
          <div className="h-1.5 w-3/4 rounded bg-muted" />
          <div className="my-0.5 h-px w-full bg-border" />
          <div className="h-1.5 w-[85%] rounded bg-muted" />
          <div className="h-1.5 w-3/5 rounded bg-muted" />
        </div>
      )}
    </div>
  );
}

function TimelineRow({ row }: { row: ScheduleRow }) {
  const start = getTimeDecimal(row.start_time);
  const end = getTimeDecimal(row.end_time);
  const totalSpan = TIMELINE_END_HOUR - TIMELINE_START_HOUR;
  const left =
    Math.max(0, Math.min(1, (start - TIMELINE_START_HOUR) / totalSpan)) * 100;
  const width = Math.max(
    2,
    Math.min(1, (end - TIMELINE_START_HOUR) / totalSpan) * 100 - left
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
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

  const timeLabels = Array.from(
    { length: TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1 },
    (_, i) => `${String(TIMELINE_START_HOUR + i).padStart(2, "0")}:00`
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

      {/* ── Quick actions ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold">Шинэ шалгалт үүсгэх</h3>
          <p className="mb-3 text-xs text-muted-foreground">
            AI ашиглан эсвэл гараар шалгалт үүсгэнэ.
          </p>
          <MockPreview variant="create" />
          <Link href="/educator/create-exam">
            <button className="w-full rounded-lg border bg-primary py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              Шалгалт үүсгэх ↗
            </button>
          </Link>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold">
            Шалгалтын хариулт засах
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Тексттэй асуултын хариуг хянан засна.
          </p>
          <MockPreview variant="grade" />
          <Link href="/educator/grading">
            <button className="w-full rounded-lg border py-2 text-xs font-medium hover:bg-muted">
              Шалгалт засах ↗
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
