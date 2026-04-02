"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Subject, TeacherAssignmentTeacher } from "./teacher-assignment-types";
import TeacherAssignmentPanel from "./TeacherAssignmentPanel";

type SortOption =
  | "name-asc"
  | "name-desc"
  | "subjects-desc"
  | "subjects-asc";

const SORT_LABELS: Record<SortOption, string> = {
  "name-asc": "Нэрээр А-Я",
  "name-desc": "Нэрээр Я-А",
  "subjects-desc": "Хичээл ихээс",
  "subjects-asc": "Хичээл багаас",
};

type TeacherDepartmentDetailData = {
  id: string;
  title: string;
  description: string;
  teachers: TeacherAssignmentTeacher[];
  subjectCount: number;
};

function getTeacherLabel(teacher: TeacherAssignmentTeacher) {
  return (teacher.full_name || teacher.email).trim().toLocaleLowerCase("mn");
}

export default function TeacherDepartmentDetail({
  department,
  subjects,
}: {
  department: TeacherDepartmentDetailData;
  subjects: Subject[];
}) {
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");

  const sortedTeachers = useMemo(() => {
    const teachers = [...department.teachers];

    teachers.sort((left, right) => {
      if (sortBy === "subjects-desc") {
        return (
          right.subjects.length - left.subjects.length ||
          getTeacherLabel(left).localeCompare(getTeacherLabel(right), "mn")
        );
      }

      if (sortBy === "subjects-asc") {
        return (
          left.subjects.length - right.subjects.length ||
          getTeacherLabel(left).localeCompare(getTeacherLabel(right), "mn")
        );
      }

      if (sortBy === "name-desc") {
        return getTeacherLabel(right).localeCompare(getTeacherLabel(left), "mn");
      }

      return getTeacherLabel(left).localeCompare(getTeacherLabel(right), "mn");
    });

    return teachers;
  }, [department.teachers, sortBy]);

  return (
    <div className="space-y-6">
      <Select
        value={sortBy}
        onValueChange={(value) => setSortBy(value as SortOption)}
      >
        <SelectTrigger className="h-10 w-fit min-w-[150px] gap-3 rounded-lg border-none bg-[#F0EEEE] px-4 text-[15px] font-medium text-[#111111] shadow-none">
          <SelectValue placeholder="Ангилах" />
        </SelectTrigger>
        <SelectContent className="rounded-xl border border-[#ececec] bg-white p-1 shadow-[0_16px_32px_rgba(15,23,42,0.08)]">
          <SelectItem value="name-asc">{SORT_LABELS["name-asc"]}</SelectItem>
          <SelectItem value="name-desc">{SORT_LABELS["name-desc"]}</SelectItem>
          <SelectItem value="subjects-desc">
            {SORT_LABELS["subjects-desc"]}
          </SelectItem>
          <SelectItem value="subjects-asc">
            {SORT_LABELS["subjects-asc"]}
          </SelectItem>
        </SelectContent>
      </Select>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-[20px] font-semibold tracking-tight text-zinc-950">
              {department.title}
            </h2>
            <p className="mt-1 text-[16px] text-zinc-500">
              {department.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="rounded-full bg-[#F2F8FF] px-7 py-4 text-[14px] font-semibold text-[#6B6B6B]">
              {department.teachers.length} багш
            </Badge>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {sortedTeachers.map((teacher) => (
            <TeacherAssignmentPanel
              key={teacher.id}
              teacher={teacher}
              allSubjects={subjects}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
