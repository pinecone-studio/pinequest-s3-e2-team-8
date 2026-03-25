import { getExamSchedules } from "@/lib/schedule/actions";
import ScheduleList from "./_features/ScheduleList";
import { CalendarDays } from "lucide-react";

export default async function SchedulePage() {
  const rows = await getExamSchedules();

  const conflictCount = rows.filter((r) => r.conflicts.length > 0).length;

  return (
    <div className="space-y-6">
      {/* Гарчиг */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6" />
            Шалгалтын хуваарь
          </h2>
          <p className="text-muted-foreground">
            Шалгалтад танхим оноох, давхцал шалгах
          </p>
        </div>
        <div className="text-right text-sm text-muted-foreground shrink-0">
          <p className="font-medium">{rows.length} шалгалт</p>
          {conflictCount > 0 && (
            <p className="text-orange-600 font-medium">
              ⚠ {conflictCount} давхцалтай
            </p>
          )}
        </div>
      </div>

      {/* Хуваарийн жагсаалт */}
      <ScheduleList rows={rows} />
    </div>
  );
}
