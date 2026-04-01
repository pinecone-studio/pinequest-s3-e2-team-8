"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookMarked,
  ChevronRight,
  Landmark,
  Languages,
  Sigma,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import TeacherAssignmentPanel from "./TeacherAssignmentPanel";
import type {
  Subject,
  TeacherAssignmentTeacher,
} from "./teacher-assignment-types";

type DepartmentMeta = {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  icon: typeof Sigma;
  accentClassName: string;
  surfaceClassName: string;
};

type DepartmentGroup = DepartmentMeta & {
  teachers: TeacherAssignmentTeacher[];
  subjectCount: number;
};

const DEPARTMENT_META: DepartmentMeta[] = [
  {
    id: "science-tech",
    title: "Байгалийн ухаан, технологийн тэнхим",
    description: "Математик, физик, хими, биологи, мэдээлэл зүйн багш нар",
    keywords: [
      "математик",
      "физик",
      "хими",
      "биологи",
      "мэдээлэл",
      "информатик",
      "technology",
      "math",
      "physics",
      "chemistry",
      "biology",
    ],
    icon: Sigma,
    accentClassName: "text-[#1d4ed8] bg-[#e9f1ff] border-[#bfd6ff]",
    surfaceClassName: "from-[#f8fbff] to-[#edf5ff]",
  },
  {
    id: "language-humanities",
    title: "Хэл, хүмүүнлэгийн тэнхим",
    description: "Монгол, англи хэл болон хүмүүнлэгийн чиглэлийн багш нар",
    keywords: [
      "монгол",
      "англи",
      "хэл",
      "уран",
      "literature",
      "language",
      "english",
    ],
    icon: Languages,
    accentClassName: "text-[#7c3aed] bg-[#f3ebff] border-[#dccbff]",
    surfaceClassName: "from-[#fbf8ff] to-[#f4eeff]",
  },
  {
    id: "social",
    title: "Нийгмийн ухааны тэнхим",
    description: "Түүх, нийгэм, газарзүй, иргэний боловсролын багш нар",
    keywords: [
      "түүх",
      "нийгэм",
      "газарзүй",
      "иргэний",
      "ёс",
      "geography",
      "history",
      "social",
    ],
    icon: Landmark,
    accentClassName: "text-[#b45309] bg-[#fff3df] border-[#ffd8a8]",
    surfaceClassName: "from-[#fffaf1] to-[#fff3e2]",
  },
  {
    id: "other",
    title: "Бусад хичээлийн тэнхим",
    description: "Дээрх ангилалд ороогүй бусад хичээлүүдийн бүлэг",
    keywords: [],
    icon: BookMarked,
    accentClassName: "text-[#0f766e] bg-[#e8fbf7] border-[#b8efe4]",
    surfaceClassName: "from-[#f5fffc] to-[#ebfbf7]",
  },
  {
    id: "unassigned",
    title: "Хичээл оноогоогүй багш нар",
    description: "Одоогоор хичээл оноолт аваагүй багш нарын жагсаалт",
    keywords: [],
    icon: UsersRound,
    accentClassName: "text-[#475569] bg-[#f1f5f9] border-[#dbe5f0]",
    surfaceClassName: "from-[#fbfdff] to-[#f4f7fb]",
  },
];

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function inferDepartment(subjects: Subject[]) {
  if (subjects.length === 0) {
    return DEPARTMENT_META.find((item) => item.id === "unassigned")!;
  }

  const scores = new Map<string, number>();

  for (const subject of subjects) {
    const normalized = normalizeText(subject.name);

    for (const meta of DEPARTMENT_META) {
      if (meta.id === "other" || meta.id === "unassigned") continue;
      if (meta.keywords.some((keyword) => normalized.includes(keyword))) {
        scores.set(meta.id, (scores.get(meta.id) ?? 0) + 1);
      }
    }
  }

  const topDepartmentId = [...scores.entries()].sort(
    (left, right) => right[1] - left[1]
  )[0]?.[0];

  if (!topDepartmentId) {
    return DEPARTMENT_META.find((item) => item.id === "other")!;
  }

  return (
    DEPARTMENT_META.find((item) => item.id === topDepartmentId) ??
    DEPARTMENT_META.find((item) => item.id === "other")!
  );
}

function buildDepartmentGroups(
  teachers: TeacherAssignmentTeacher[]
): DepartmentGroup[] {
  const grouped = new Map<string, TeacherAssignmentTeacher[]>();

  for (const teacher of teachers) {
    const department = inferDepartment(teacher.subjects);
    const existing = grouped.get(department.id) ?? [];
    existing.push(teacher);
    grouped.set(department.id, existing);
  }

  return DEPARTMENT_META.map((meta) => {
    const departmentTeachers = (grouped.get(meta.id) ?? []).sort((left, right) =>
      (left.full_name || left.email).localeCompare(right.full_name || right.email)
    );

    return {
      ...meta,
      teachers: departmentTeachers,
      subjectCount: departmentTeachers.reduce(
        (total, teacher) => total + teacher.subjects.length,
        0
      ),
    };
  }).filter((department) => department.teachers.length > 0);
}

export default function TeacherDepartmentBoard({
  teachers,
  allSubjects,
}: {
  teachers: TeacherAssignmentTeacher[];
  allSubjects: Subject[];
}) {
  const departments = useMemo(() => buildDepartmentGroups(teachers), [teachers]);
  const [openDepartmentId, setOpenDepartmentId] = useState("");

  useEffect(() => {
    if (departments.length === 0) {
      setOpenDepartmentId("");
      return;
    }

    if (!departments.some((department) => department.id === openDepartmentId)) {
      setOpenDepartmentId(departments[0]?.id ?? "");
    }
  }, [departments, openDepartmentId]);

  const activeDepartment =
    departments.find((department) => department.id === openDepartmentId) ??
    departments[0] ??
    null;

  if (departments.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-zinc-200 py-16 text-center text-muted-foreground">
        Багш бүртгэлгүй байна.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {departments.map((department) => {
          const Icon = department.icon;
          const isActive = activeDepartment?.id === department.id;

          return (
            <button
              key={department.id}
              type="button"
              onClick={() => setOpenDepartmentId(department.id)}
              className={cn(
                "rounded-[28px] border border-zinc-200 bg-gradient-to-br px-5 py-5 text-left transition-all",
                department.surfaceClassName,
                isActive
                  ? "border-[#9fc3ff] shadow-[0_16px_40px_rgba(47,128,237,0.08)]"
                  : "hover:border-zinc-300"
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div
                  className={cn(
                    "rounded-2xl border px-3 py-3",
                    department.accentClassName
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <Badge
                  variant="outline"
                  className="rounded-full bg-white/80 text-zinc-600"
                >
                  {department.teachers.length} багш
                </Badge>
              </div>

              <div className="mt-4 space-y-2">
                <h3 className="text-lg font-semibold text-zinc-950">
                  {department.title}
                </h3>
                <p className="text-sm leading-6 text-zinc-500">
                  {department.description}
                </p>
              </div>

              <div className="mt-5 flex items-center justify-between text-sm">
                <span className="text-zinc-500">
                  {department.subjectCount} хичээл оноолт
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 font-medium",
                    isActive ? "text-[#2563eb]" : "text-zinc-600"
                  )}
                >
                  Дэлгэрэнгүй
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 transition-transform",
                      isActive && "translate-x-0.5"
                    )}
                  />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {activeDepartment ? (
        <section className="rounded-[32px] border border-zinc-200 bg-white px-5 py-5 shadow-none">
          <div className="flex flex-col gap-3 border-b border-zinc-100 pb-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-zinc-950">
                {activeDepartment.title}
              </h3>
              <p className="mt-1 text-sm text-zinc-500">
                {activeDepartment.description}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className="rounded-full bg-[#f8fbff] text-[#3156a6]"
              >
                {activeDepartment.teachers.length} багш
              </Badge>
              <Badge
                variant="outline"
                className="rounded-full bg-[#f8fbff] text-[#3156a6]"
              >
                {activeDepartment.subjectCount} хичээл
              </Badge>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {activeDepartment.teachers.map((teacher) => (
              <TeacherAssignmentPanel
                key={teacher.id}
                teacher={teacher}
                allSubjects={allSubjects}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
