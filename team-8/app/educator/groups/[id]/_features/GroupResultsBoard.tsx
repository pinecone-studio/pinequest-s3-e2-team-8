"use client";

import { useState } from "react";
import { removeMemberFromGroup } from "@/lib/group/actions";
import { formatDateTimeUB } from "@/lib/utils/date";
import StudentIdentity from "@/components/profile/StudentIdentity";
import AddMemberForm from "./AddMemberForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

type GroupResultsRow = {
  student_id: string;
  student_name: string;
  student_email: string;
  student_avatar_url: string | null;
  joined_at: string;
  score: number | null;
  status: "passed" | "failed" | "not_taken";
  status_label: string;
  attempted_exam_count: number;
  assigned_exam_count: number;
  latest_exam_title: string | null;
  latest_submitted_at: string | null;
  passing_threshold: number;
};

interface GroupResultsBoardProps {
  groupId: string;
  groupName: string;
  canManage: boolean;
  rows: GroupResultsRow[];
}

type StatusFilter = "all" | GroupResultsRow["status"];

function getStatusTone(status: GroupResultsRow["status"]) {
  if (status === "passed") return "success" as const;
  if (status === "failed") return "danger" as const;
  return "info" as const;
}

function getScoreText(score: number | null) {
  return score === null ? "—" : `${score}`;
}

function buildCsvValue(value: string | number | null) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export default function GroupResultsBoard({
  groupId,
  groupName,
  canManage,
  rows,
}: GroupResultsBoardProps) {
  const [searchValue, setSearchValue] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<GroupResultsRow | null>(
    null,
  );
  const [removeTarget, setRemoveTarget] = useState<GroupResultsRow | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const counts = {
    passed: rows.filter((row) => row.status === "passed").length,
    failed: rows.filter((row) => row.status === "failed").length,
    not_taken: rows.filter((row) => row.status === "not_taken").length,
  };

  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    if (statusFilter !== "all" && row.status !== statusFilter) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return (
      row.student_name.toLowerCase().includes(normalizedSearch) ||
      row.student_email.toLowerCase().includes(normalizedSearch)
    );
  });

  async function handleRemoveStudent() {
    if (!removeTarget) return;

    setRemovingId(removeTarget.student_id);
    await removeMemberFromGroup(groupId, removeTarget.student_id);
    setRemovingId(null);
    setRemoveTarget(null);
  }

  function handleExport() {
    const csvRows = [
      ["Сурагчийн нэр", "Дүн", "Имэйл", "Төлөв", "Өгсөн шалгалт", "Нийт шалгалт"],
      ...filteredRows.map((row) => [
        row.student_name,
        row.score,
        row.student_email,
        row.status_label,
        row.attempted_exam_count,
        row.assigned_exam_count,
      ]),
    ];

    const csvContent = csvRows
      .map((row) => row.map((value) => buildCsvValue(value)).join(","))
      .join("\n");

    const blob = new Blob([`\uFEFF${csvContent}`], {
      type: "text/csv;charset=utf-8;",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `${groupName.replace(/[\\/:*?"<>|]/g, "-")}-дүн.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  }

  const filterButtons: Array<{
    key: GroupResultsRow["status"];
    label: string;
    count: number;
  }> = [
    { key: "passed", label: "Тэнцсэн", count: counts.passed },
    { key: "failed", label: "Тэнцээгүй", count: counts.failed },
    { key: "not_taken", label: "Шалгалт өгөөгүй", count: counts.not_taken },
  ];

  return (
    <>
      <AlertDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Сурагчийг хасах уу?</AlertDialogTitle>
            <AlertDialogDescription>
              “{removeTarget?.student_name}”-ийг энэ бүлгээс хасна.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Цуцлах</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleRemoveStudent}
            >
              {removingId === removeTarget?.student_id ? "..." : "Хасах"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-[420px]">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7D879A]" />
              <Input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Сурагч хайх"
                className="h-11 rounded-[14px] border-[#E0E7F2] bg-white pl-11 pr-11 text-[14px] shadow-[0_10px_25px_rgba(171,189,214,0.12)]"
              />
              {searchValue ? (
                <button
                  type="button"
                  aria-label="Хайлт цэвэрлэх"
                  onClick={() => setSearchValue("")}
                  className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-[#F2F4F8] text-[#6D778A] transition hover:bg-[#E8ECF3]"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleExport}
                className="h-11 rounded-[14px] border-[#DDE5F1] bg-white px-4 text-[14px] font-medium text-[#233044] shadow-[0_10px_24px_rgba(171,189,214,0.12)]"
              >
                <Download className="mr-2 h-4 w-4" />
                Өгөгдөл татах
              </Button>

              {canManage ? (
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    className="h-11 rounded-[14px] bg-[#4D97F8] px-5 text-[14px] font-semibold text-white shadow-[0_16px_32px_rgba(77,151,248,0.28)] hover:bg-[#3F88E8]"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Сурагч нэмэх
                  </Button>
                </DialogTrigger>
              ) : null}
            </div>
          </div>

          <div className="inline-flex flex-wrap items-center gap-2 rounded-[18px] bg-[#F4F0EE] p-2">
            {filterButtons.map((button) => {
              const isActive = statusFilter === button.key;

              return (
                <button
                  key={button.key}
                  type="button"
                  onClick={() =>
                    setStatusFilter((current) =>
                      current === button.key ? "all" : button.key,
                    )
                  }
                  className={`inline-flex items-center gap-2 rounded-[14px] px-4 py-2 text-[14px] font-medium transition ${
                    isActive
                      ? "bg-white text-[#151A24] shadow-[0_8px_18px_rgba(178,164,157,0.2)]"
                      : "text-[#383F4D] hover:bg-white/70"
                  }`}
                >
                  <span>{button.label}</span>
                  <span
                    className={`inline-flex min-w-6 items-center justify-center rounded-full px-2 py-0.5 text-[12px] ${
                      isActive ? "bg-[#F1F2F4]" : "bg-[#DED8D5]"
                    }`}
                  >
                    {button.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-[28px] border border-[#E3EBF4] bg-white shadow-[0_16px_38px_rgba(171,189,214,0.16)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="border-b border-[#ECF0F6] bg-white">
                    <th className="px-6 py-4 text-left text-[14px] font-semibold text-[#273142]">
                      Сурагчийн нэр
                    </th>
                    <th className="px-4 py-4 text-left text-[14px] font-semibold text-[#273142]">
                      Дүн
                    </th>
                    <th className="px-4 py-4 text-left text-[14px] font-semibold text-[#273142]">
                      И-мэйл
                    </th>
                    <th className="px-4 py-4 text-left text-[14px] font-semibold text-[#273142]">
                      Төлөв
                    </th>
                    <th className="px-4 py-4 text-left text-[14px] font-semibold text-[#273142]">
                      Үйлдэл
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-14 text-center text-[14px] text-[#7B8798]"
                      >
                        Тохирох сурагч олдсонгүй.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row) => (
                      <tr
                        key={row.student_id}
                        className="border-b border-[#ECF0F6] last:border-b-0"
                      >
                        <td className="px-6 py-4">
                          <StudentIdentity
                            name={row.student_name}
                            email={undefined}
                            avatarUrl={row.student_avatar_url}
                            tone={getStatusTone(row.status)}
                            size="sm"
                            className="gap-3"
                            textClassName="text-[14px]"
                          />
                        </td>
                        <td className="px-4 py-4 text-[14px] font-medium text-[#1F2937]">
                          {getScoreText(row.score)}
                        </td>
                        <td className="px-4 py-4 text-[14px] text-[#394557]">
                          {row.student_email}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex items-center rounded-full border px-4 py-1.5 text-[12px] font-medium ${
                              row.status === "passed"
                                ? "border-[#38C172] bg-[#E8FFF0] text-[#1DA756]"
                                : row.status === "failed"
                                  ? "border-[#FF8C8C] bg-[#FFF0F0] text-[#E15B5B]"
                                  : "border-[#D7E0EC] bg-[#F7FAFD] text-[#6E7C91]"
                            }`}
                          >
                            {row.status_label}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3 text-[#485467]">
                            <button
                              type="button"
                              aria-label={`${row.student_name} мэдээлэл`}
                              onClick={() => setSelectedStudent(row)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-[#F3F6FB]"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>

                            {canManage ? (
                              <button
                                type="button"
                                aria-label={`${row.student_name} хасах`}
                                onClick={() => setRemoveTarget(row)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full transition hover:bg-[#FFF1F1] hover:text-[#D94A4A]"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Сурагч нэмэх</DialogTitle>
            <DialogDescription>
              Бүлэгт нэмэх сурагчийн имэйлийг оруулна уу.
            </DialogDescription>
          </DialogHeader>
          <AddMemberForm groupId={groupId} />
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selectedStudent)}
        onOpenChange={(open) => {
          if (!open) setSelectedStudent(null);
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>
              {selectedStudent ? selectedStudent.student_name : "Сурагчийн мэдээлэл"}
            </DialogTitle>
            <DialogDescription>
              Сурагчийн нэгтгэсэн дүн болон оролцооны мэдээлэл.
            </DialogDescription>
          </DialogHeader>

          {selectedStudent ? (
            <div className="space-y-5">
              <StudentIdentity
                name={selectedStudent.student_name}
                email={selectedStudent.student_email}
                avatarUrl={selectedStudent.student_avatar_url}
                tone={getStatusTone(selectedStudent.status)}
                size="md"
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-[#E6EDF7] bg-[#F9FBFE] p-4">
                  <p className="text-[12px] text-[#7C889B]">Нэгтгэсэн дүн</p>
                  <p className="mt-1 text-2xl font-semibold text-[#1B2432]">
                    {selectedStudent.score === null ? "—" : `${selectedStudent.score}%`}
                  </p>
                </div>
                <div className="rounded-2xl border border-[#E6EDF7] bg-[#F9FBFE] p-4">
                  <p className="text-[12px] text-[#7C889B]">Төлөв</p>
                  <p className="mt-1 text-base font-semibold text-[#1B2432]">
                    {selectedStudent.status_label}
                  </p>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-[#E6EDF7] p-4">
                <div className="flex items-center justify-between gap-4 text-[14px]">
                  <span className="text-[#7C889B]">Өгсөн шалгалт</span>
                  <span className="font-medium text-[#1B2432]">
                    {selectedStudent.attempted_exam_count} / {selectedStudent.assigned_exam_count}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 text-[14px]">
                  <span className="text-[#7C889B]">Тэнцэх босго</span>
                  <span className="font-medium text-[#1B2432]">
                    {selectedStudent.passing_threshold}%
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 text-[14px]">
                  <span className="text-[#7C889B]">Сүүлд өгсөн шалгалт</span>
                  <span className="text-right font-medium text-[#1B2432]">
                    {selectedStudent.latest_exam_title ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 text-[14px]">
                  <span className="text-[#7C889B]">Сүүлд бүртгэгдсэн хугацаа</span>
                  <span className="text-right font-medium text-[#1B2432]">
                    {selectedStudent.latest_submitted_at
                      ? formatDateTimeUB(selectedStudent.latest_submitted_at)
                      : "—"}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
