import Link from "next/link";
import { getGroups } from "@/lib/group/actions";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";

import {
  Users,
  BookOpen,
  TrendingUp,
  Search,
  Plus,
  Clock,
  Eye,
} from "lucide-react"; // Added icons
import { Input } from "@/components/ui/input"; // Assuming you have an Input component
import { Button } from "@/components/ui/button";

export default async function GroupsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const isAdmin = profile?.role === "admin";
  const groups = await getGroups();

  // --- Stats Calculations ---
  const totalGroups = groups.length;
  const totalStudents = groups.reduce(
    (acc, group: any) => acc + (group.student_group_members?.[0]?.count ?? 0),
    0,
  );
  // Placeholder average (Replace with real logic if you have scores in your DB)
  const averageScore = "82%";

  const groupTypeLabel: Record<string, string> = {
    class: "Анги",
    elective: "Сонголт",
    mixed: "Холимог",
  };
  const badgeColors = [
    "#3154C5",
    "#7C3AED",
    "#DB2777",
    "#F97316",
    "#16A34A",
    "#0EA5E9",
    "#D97706",
    "#7F32F5",
    "#0D9488",
    "#BE185D",
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-8.5 md:grid-cols-3">
        <div className="flex p-4 bg-white rounded-2xl shadow-sm">
          <div className="flex items-center justify-center p-3 bg-slate-100 rounded-xl mr-4">
            <BookOpen className="h-5 w-5 text-[#4078C1]" />
          </div>
          <div className="flex flex-col">
            <p className="text-[13px] text-muted-foreground leading-none mb-1">
              Нийт анги
            </p>
            <p className="text-xl font-bold leading-none">{totalGroups}</p>
          </div>
        </div>
        {/* Box 2: Total Students */}
        <div className="flex items-center p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-center p-3 bg-slate-100 rounded-xl mr-4">
            <Users className="h-5 w-5 text-[#4078C1] " />
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-[13px] text-muted-foreground leading-none mb-1">
              Нийт сурагч
            </p>
            <p className="text-xl font-bold leading-none">{totalStudents}</p>
          </div>
        </div>
        {/* Box 3: Average Score */}
        <div className="flex items-center p-4 bg-white rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center justify-center p-3 bg-slate-100 rounded-xl mr-4">
            <TrendingUp className="h-5 w-5 text-[#4078C1]" />
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-[13px] text-muted-foreground leading-none mb-1">
              Дундаж оноо
            </p>
            <p className="text-xl font-bold leading-none">{averageScore}</p>
          </div>
        </div>
      </div>
      {/* 2. Search and Action Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Анги, дүн хайх"
            className="pl-10 bg-slate-50 border-slate-200 rounded-xl"
          />
        </div>

        {isAdmin && (
          <Button className="bg-indigo-600 hover:bg-indigo-700 rounded-xl px-6">
            <Plus className="mr-2 h-4 w-4" /> Анги нэмэх
          </Button>
        )}
      </div>

      {/* 3. Group List */}
      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-10 text-center text-muted-foreground">
            <Users className="mb-2 h-8 w-8" />
            <p>Бүлэг байхгүй байна.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4.5">
          {groups.map((group) => {
            const memberCount =
              (group as any).student_group_members?.[0]?.count ?? 0;

            // Extracting the first part of the name for the blue box (e.g., "10A")
            const shortName = group.name.split(" ")[0] || group.grade;
            const badgeColor =
              badgeColors[group.name.length % badgeColors.length];

            return (
              <Link key={group.id} href={`/educator/groups/${group.id}`}>
                <div className="flex  items-between justify-between h-29.5 py-4 px-5 bg-white rounded-2xl transition-all shadow-md border border-transparent hover:border-slate-100">
                  {/* Left Side: Icon and Title Info */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-4">
                      {/* Blue Square Badge */}
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-[13px] font-bold text-white"
                        style={{ backgroundColor: badgeColor }}
                      >
                        {shortName}
                      </div>
                      <div className="flex flex-col gap-1">
                        <h3 className="text-[15px] font-semibold text-slate-800">
                          {group.name} — ФУНКЦ БА ГРАФИК
                        </h3>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-[#7F7F7F]">
                      <Users className="h-5 w-5" />
                      <span className="text-[14px]">{memberCount} сурагч</span>
                    </div>
                  </div>

                  {/* Right Side: Time and Action */}
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-1.5 text-slate-400 text-[13px]">
                      <Clock className="h-4 w-4" />
                      <span>Даваа 09:00</span>
                    </div>

                    <div className="flex items-center gap-2 rounded-lg bg-[#DCFCE7] px-4 py-1.5 text-[14px] font-medium text-[#00A63E]">
                      <Eye className="h-4 w-4" />
                      Дүн харах
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
