"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Eye, Pencil, Search, Trash2 } from "lucide-react";
import {
  bulkDeleteQuestionBankItems,
  deleteQuestionBankItem,
  importQuestionFromBank,
  importQuestionsFromBank,
  importSampleExamToExam,
} from "@/lib/question/actions";
import type { QuestionBank, SampleExam, Subject } from "@/types";
import MathContent from "@/components/math/MathContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import EditQuestionBankDialog from "./EditQuestionBankDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import PrivateBankAddMaterial from "./PrivateBankAddMaterial";

const typeLabels: Record<string, string> = {
  multiple_choice: "Олон сонголттой",
  multiple_response: "Олон зөв",
  essay: "Нээлттэй",
  fill_blank: "Хоосон зай",
  matching: "Холбох",
};

const difficultyLabels: Record<number, string> = {
  1: "Амархан",
  2: "Дунд",
  3: "Хүнд",
};

/** Баталгаажсан сангийн карт дээрх мета тэмдэг — хамгийн багадаа 93×28, урт текст олон мөр, px 10 / py 6, radius 12 */
const certifiedBankMetaPillClass =
  "inline-flex min-h-[28px] min-w-[93px] w-max max-w-full shrink-0 items-center justify-center rounded-[12px] border border-border bg-background px-[10px] py-[6px] text-center text-xs font-medium leading-snug text-foreground whitespace-normal break-words";

type TabKey = "sample" | "bank" | "private";

function formatInlineChoicesAsList(text: string) {
  const normalized = String(text ?? "").replace(/\r\n/g, "\n");
  if (!normalized.trim()) return normalized;

  return normalized;
}

interface QuestionBankBrowserProps {
  certifiedQuestions: QuestionBank[];
  privateQuestions: QuestionBank[];
  sampleExams: SampleExam[];
  subjects: Subject[];
  examId?: string;
  examTitle?: string;
  targetExamSubjectId?: string;
  importUnavailableMessage?: string | null;
  defaultTab?: TabKey;
  viewerIsAdmin?: boolean;
}
type MessageTone = "neutral" | "success" | "error" | "warning";

function stableStringCompare(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export default function QuestionBankBrowser({
  certifiedQuestions,
  privateQuestions,
  sampleExams,
  subjects,
  examId,
  examTitle,
  targetExamSubjectId,
  importUnavailableMessage,
  defaultTab = "sample",
  viewerIsAdmin = false,
}: QuestionBankBrowserProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<TabKey>(defaultTab);
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const gradeFilter = "all";
  const subtopicFilter = "all";
  const difficultyFilter = "all";
  const [typeFilter, setTypeFilter] = useState("all");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(
    importUnavailableMessage ?? null,
  );
  const [messageTone, setMessageTone] = useState<MessageTone>(
    importUnavailableMessage ? "error" : "neutral",
  );
  const [lastImportedQuestionId, setLastImportedQuestionId] = useState<
    string | null
  >(null);
  const [lastImportedSampleId, setLastImportedSampleId] = useState<
    string | null
  >(null);
  const [pendingAction, setPendingAction] = useState<
    "import-sample" | "import-single" | "import-bulk" | "delete-bulk" | null
  >(null);
  const [pendingQuestionId, setPendingQuestionId] = useState<string | null>(
    null,
  );
  const [pendingSampleId, setPendingSampleId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [singleDeletingId, setSingleDeletingId] = useState<string | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const isBusy = pendingAction !== null;
  const isSubjectFocused =
    tab === "sample" && subjectFilter !== "all";

  useEffect(() => {
    const nextSubjectId = searchParams.get("subjectId");
    if (nextSubjectId) {
      setSubjectFilter(nextSubjectId);
    }
  }, [searchParams]);

  function setSubjectFilterFromUi(next: string) {
    setSubjectFilter(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") {
      params.delete("subjectId");
    } else {
      params.set("subjectId", next);
    }
    const queryString = params.toString();
    const target = queryString ? `${pathname}?${queryString}` : (pathname ?? "");
    if (target) {
      router.replace(target);
    }
  }

  function changeTab(next: TabKey) {
    setSelectedQuestionIds([]);
    setTab(next);
  }

  function pushSubjectFilter(nextSubjectId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextSubjectId) {
      params.set("subjectId", nextSubjectId);
      params.set("tab", "sample");
    } else {
      params.delete("subjectId");
    }
    const query = params.toString();
    const targetPath = query ? `${pathname}?${query}` : (pathname ?? "");
    if (targetPath) {
      router.push(targetPath);
    }
  }

  const filteredSampleExams = useMemo(() => {
    return sampleExams.filter((sampleExam) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        sampleExam.title.toLowerCase().includes(normalizedQuery) ||
        (sampleExam.description ?? "")
          .toLowerCase()
          .includes(normalizedQuery) ||
        (sampleExam.subtopic ?? "").toLowerCase().includes(normalizedQuery) ||
        (sampleExam.subjects?.name ?? "")
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesSubject =
        subjectFilter === "all" || sampleExam.subject_id === subjectFilter;
      const matchesGrade =
        gradeFilter === "all" || String(sampleExam.grade_level) === gradeFilter;
      const matchesSubtopic =
        subtopicFilter === "all" || sampleExam.subtopic === subtopicFilter;
      const matchesDifficulty =
        difficultyFilter === "all" ||
        String(sampleExam.difficulty_level) === difficultyFilter;

      return (
        matchesQuery &&
        matchesSubject &&
        matchesGrade &&
        matchesSubtopic &&
        matchesDifficulty
      );
    });
  }, [
    difficultyFilter,
    gradeFilter,
    normalizedQuery,
    sampleExams,
    subjectFilter,
    subtopicFilter,
  ]);

  const groupedSampleExams = useMemo(() => {
    const subjectNameById = new Map(
      subjects.map((subject) => [subject.id, subject.name]),
    );
    const groups = new Map<
      string,
      { subjectId: string | null; subjectName: string; exams: SampleExam[] }
    >();

    for (const sampleExam of filteredSampleExams) {
      const subjectId = sampleExam.subject_id ?? null;
      const subjectName =
        sampleExam.subjects?.name ||
        (subjectId ? subjectNameById.get(subjectId) : null) ||
        "Хичээл сонгоогүй";
      const key = subjectId ?? `unknown:${subjectName}`;
      const existing = groups.get(key);
      if (existing) {
        existing.exams.push(sampleExam);
      } else {
        groups.set(key, { subjectId, subjectName, exams: [sampleExam] });
      }
    }

    return Array.from(groups.values()).sort((left, right) =>
      stableStringCompare(left.subjectName, right.subjectName),
    );
  }, [filteredSampleExams, subjects]);

  /** 1 Амархан — success (emerald); 2 Дунд — #F2B544 + цагаан текст; 3 Хүнд — улаан */
  function getDifficultyBadgeClass(level: number | null | undefined) {
    if (level === 3) return "bg-[#e85b5b]";
    if (level === 2) return "bg-[#F2B544]";
    if (level === 1) return "bg-emerald-600";
    return "bg-gray-400";
  }

  const filteredCertifiedQuestions = useMemo(() => {
    return certifiedQuestions.filter((question) => {
      const tags = Array.isArray(question.tags) ? question.tags : [];
      const matchesQuery =
        normalizedQuery.length === 0 ||
        question.content.toLowerCase().includes(normalizedQuery) ||
        (question.explanation ?? "").toLowerCase().includes(normalizedQuery) ||
        (question.subtopic ?? "").toLowerCase().includes(normalizedQuery) ||
        (question.subjects?.name ?? "")
          .toLowerCase()
          .includes(normalizedQuery) ||
        tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));

      const matchesSubject =
        subjectFilter === "all" || question.subject_id === subjectFilter;
      const matchesGrade =
        gradeFilter === "all" ||
        String(question.grade_level ?? "") === gradeFilter;
      const matchesSubtopic =
        subtopicFilter === "all" || question.subtopic === subtopicFilter;
      const matchesDifficulty =
        difficultyFilter === "all" ||
        String(question.difficulty_level) === difficultyFilter;
      const matchesType = typeFilter === "all" || question.type === typeFilter;

      return (
        matchesQuery &&
        matchesSubject &&
        matchesGrade &&
        matchesSubtopic &&
        matchesDifficulty &&
        matchesType
      );
    });
  }, [
    certifiedQuestions,
    difficultyFilter,
    gradeFilter,
    normalizedQuery,
    subjectFilter,
    subtopicFilter,
    typeFilter,
  ]);

  const filteredPrivateQuestions = useMemo(() => {
    return privateQuestions.filter((question) => {
      const tags = Array.isArray(question.tags) ? question.tags : [];
      const matchesQuery =
        normalizedQuery.length === 0 ||
        question.content.toLowerCase().includes(normalizedQuery) ||
        (question.explanation ?? "").toLowerCase().includes(normalizedQuery) ||
        (question.subtopic ?? "").toLowerCase().includes(normalizedQuery) ||
        (question.subjects?.name ?? "")
          .toLowerCase()
          .includes(normalizedQuery) ||
        tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));

      const matchesSubject =
        subjectFilter === "all" || question.subject_id === subjectFilter;
      const matchesGrade =
        gradeFilter === "all" ||
        String(question.grade_level ?? "") === gradeFilter;
      const matchesSubtopic =
        subtopicFilter === "all" || question.subtopic === subtopicFilter;
      const matchesDifficulty =
        difficultyFilter === "all" ||
        String(question.difficulty_level) === difficultyFilter;
      const matchesType = typeFilter === "all" || question.type === typeFilter;

      return (
        matchesQuery &&
        matchesSubject &&
        matchesGrade &&
        matchesSubtopic &&
        matchesDifficulty &&
        matchesType
      );
    });
  }, [
    privateQuestions,
    difficultyFilter,
    gradeFilter,
    normalizedQuery,
    subjectFilter,
    subtopicFilter,
    typeFilter,
  ]);

  const activeFilteredBankQuestions = useMemo(() => {
    if (tab === "bank") return filteredCertifiedQuestions;
    if (tab === "private") return filteredPrivateQuestions;
    return [];
  }, [tab, filteredCertifiedQuestions, filteredPrivateQuestions]);

  const visiblePrivateQuestionIds = useMemo(() => {
    if (tab !== "private") return [];
    return filteredPrivateQuestions.map((question) => question.id);
  }, [filteredPrivateQuestions, tab]);

  const selectableQuestionIds = useMemo(() => {
    if (!examId || (tab !== "bank" && tab !== "private")) return [];

    return activeFilteredBankQuestions
      .filter(
        (question) =>
          !(
            targetExamSubjectId &&
            question.subject_id &&
            question.subject_id !== targetExamSubjectId
          ),
      )
      .map((question) => question.id);
  }, [activeFilteredBankQuestions, examId, tab, targetExamSubjectId]);

  const visibleSelectableQuestionIds = useMemo(() => {
    if (examId) return selectableQuestionIds;
    if (tab === "private") return visiblePrivateQuestionIds;
    return [];
  }, [examId, selectableQuestionIds, tab, visiblePrivateQuestionIds]);
  const allVisibleSelected = useMemo(() => {
    if (visibleSelectableQuestionIds.length === 0) return false;
    return visibleSelectableQuestionIds.every((id) =>
      selectedQuestionIds.includes(id),
    );
  }, [selectedQuestionIds, visibleSelectableQuestionIds]);

  function setStatusMessage(tone: MessageTone, nextMessage: string | null) {
    setMessageTone(tone);
    setMessage(nextMessage);
  }

  function toggleQuestionSelection(questionId: string) {
    setSelectedQuestionIds((prev) =>
      prev.includes(questionId)
        ? prev.filter((item) => item !== questionId)
        : [...prev, questionId],
    );
  }

  function toggleSelectAllVisibleQuestions() {
    setSelectedQuestionIds((prev) => {
      if (visibleSelectableQuestionIds.length === 0) return prev;

      const visibleSet = new Set(visibleSelectableQuestionIds);
      const areAllSelected = visibleSelectableQuestionIds.every((id) =>
        prev.includes(id),
      );

      if (areAllSelected) {
        return prev.filter((id) => !visibleSet.has(id));
      }

      const next = new Set(prev);
      for (const id of visibleSelectableQuestionIds) {
        next.add(id);
      }
      return Array.from(next);
    });
  }

  function clearSelectedQuestions() {
    setSelectedQuestionIds([]);
  }

  function handleImportQuestion(questionId: string) {
    if (!examId || pendingAction) return;

    setStatusMessage("neutral", null);
    setPendingAction("import-single");
    setPendingQuestionId(questionId);
    setPendingSampleId(null);
    startTransition(() => {
      void (async () => {
        try {
          const result = await importQuestionFromBank(examId, questionId);
          if (result?.error) {
            setStatusMessage("error", result.error);
            return;
          }

          setLastImportedQuestionId(questionId);
          setLastImportedSampleId(null);
          setStatusMessage(
            result?.warning ? "warning" : "success",
            result?.warning ?? "Асуулт шалгалтад амжилттай нэмэгдлээ.",
          );
          router.refresh();
        } finally {
          setPendingAction(null);
          setPendingQuestionId(null);
        }
      })();
    });
  }

  function handleImportSelectedQuestions() {
    if (!examId || selectedQuestionIds.length === 0 || pendingAction) return;

    const pendingIds = [...selectedQuestionIds];
    setStatusMessage("neutral", null);
    setPendingAction("import-bulk");
    setPendingQuestionId(null);
    setPendingSampleId(null);
    startTransition(() => {
      void (async () => {
        try {
          const result = await importQuestionsFromBank(examId, pendingIds);
          if (result?.error) {
            setStatusMessage("error", result.error);
            return;
          }

          setSelectedQuestionIds([]);
          setLastImportedQuestionId(null);
          setLastImportedSampleId(null);
          setStatusMessage(
            result?.warning ? "warning" : "success",
            result?.warning ??
              `${result.count ?? pendingIds.length} асуулт шалгалтад амжилттай нэмэгдлээ.`,
          );
          router.refresh();
        } finally {
          setPendingAction(null);
        }
      })();
    });
  }

  function handleDeleteSelectedPrivateQuestions() {
    if (tab !== "private" || selectedQuestionIds.length === 0 || pendingAction)
      return;

    const pendingIds = [...selectedQuestionIds];
    setStatusMessage("neutral", null);
    setPendingAction("delete-bulk");
    setPendingQuestionId(null);
    setPendingSampleId(null);
    startTransition(() => {
      void (async () => {
        try {
          const result = await bulkDeleteQuestionBankItems(pendingIds);
          if (result?.error) {
            setStatusMessage("error", result.error);
            return;
          }

          setSelectedQuestionIds([]);
          setLastImportedQuestionId(null);
          setLastImportedSampleId(null);
          setStatusMessage(
            "success",
            `${result.deletedCount ?? pendingIds.length} материал устгагдлаа.`,
          );
          router.refresh();
        } finally {
          setPendingAction(null);
        }
      })();
    });
  }

  function handleDeleteSinglePrivateQuestion(questionId: string) {
    if (pendingAction || singleDeletingId) return;

    setStatusMessage("neutral", null);
    setSingleDeletingId(questionId);
    startTransition(() => {
      void (async () => {
        try {
          const result = await deleteQuestionBankItem(questionId);
          if (result?.error) {
            setStatusMessage("error", result.error);
            return;
          }

          setSelectedQuestionIds((prev) => prev.filter((id) => id !== questionId));
          setPendingDeleteId(null);
          router.refresh();
        } finally {
          setSingleDeletingId(null);
        }
      })();
    });
  }

  function handleImportSampleExam(sampleExamId: string) {
    if (!examId || pendingAction) return;

    setStatusMessage("neutral", null);
    setPendingAction("import-sample");
    setPendingSampleId(sampleExamId);
    setPendingQuestionId(null);
    startTransition(() => {
      void (async () => {
        try {
          const result = await importSampleExamToExam(examId, sampleExamId);
          if (result?.error) {
            setStatusMessage("error", result.error);
            return;
          }

          setLastImportedSampleId(sampleExamId);
          setLastImportedQuestionId(null);
          setStatusMessage("success", "Жишиг шалгалт амжилттай импортлогдлоо.");
          router.refresh();
        } finally {
          setPendingAction(null);
          setPendingSampleId(null);
        }
      })();
    });
  }

  /** Radix Select trigger — нээлттэй жагсаалтыг SelectContent-оор дугуйруулна */
  const filterSelectTriggerClass =
    "box-border h-[39px] min-h-[39px] rounded-xl border-0 bg-[#EBEBEB] py-[10px] pl-[16px] pr-3 text-sm text-foreground shadow-none ring-0 focus:ring-2 focus:ring-[#3B6CB0]/25 focus-visible:ring-2 [&_svg]:size-[18px] [&_svg]:text-gray-500";

  /** «Бүх төрөл» / «Бүх хичээл» — w-220 h-39 */
  const typeFilterTriggerClass = cn(
    filterSelectTriggerClass,
    "w-[220px] min-w-[220px] max-w-[220px] shrink-0",
  );

  const subjectFilterTriggerClass = typeFilterTriggerClass;

  const questionBankSelectContentClass =
    "max-h-[min(320px,var(--radix-select-content-available-height))] rounded-xl border border-gray-200/80 bg-[#EBEBEB] p-1 shadow-lg ring-1 ring-black/5 data-[side=bottom]:slide-in-from-top-2";

  const isQuestionBankTab = tab === "bank" || tab === "private";
  const typeFilterPlaceholderClass =
    "invisible pointer-events-none box-border h-[39px] w-[220px] shrink-0 rounded-xl";
  const subjectFilterPlaceholderClass = typeFilterPlaceholderClass;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-5 rounded-2xl p-4 sm:p-6 md:p-8">
      {examId && examTitle ? (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium">Шалгалт руу оруулах горим</p>
              <p className="text-sm text-muted-foreground">{examTitle}</p>
            </div>
            <Button asChild variant="outline">
              <Link href={`/educator/exams/${examId}/questions`}>
                Шалгалт руу буцах
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-4">
        {!isSubjectFocused ? (
          <>
            <div
              className="flex h-[45px] w-full max-w-[531px] shrink-0 items-stretch rounded-full bg-[#EEEEEE] p-[5px] sm:w-[531px]"
              role="tablist"
              aria-label="Асуултын сангийн орон"
            >
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "h-[35px] min-h-0 min-w-0 flex-1 rounded-full border-0 px-2 text-center text-[13px] font-medium leading-tight shadow-none transition-colors sm:px-3 sm:text-sm",
                  tab === "sample"
                    ? "bg-white text-black shadow-sm hover:bg-white"
                    : "bg-transparent text-gray-600 hover:bg-black/[0.04]",
                )}
                onClick={() => changeTab("sample")}
              >
                Жишиг даалгаврууд
              </Button>

              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "h-[35px] min-h-0 min-w-0 flex-1 rounded-full border-0 px-2 text-center text-[13px] font-medium leading-tight shadow-none transition-colors sm:px-3 sm:text-sm",
                  tab === "bank"
                    ? "bg-white text-black shadow-sm hover:bg-white"
                    : "bg-transparent text-gray-600 hover:bg-black/[0.04]",
                )}
                onClick={() => changeTab("bank")}
              >
                Баталгаажсан сан
              </Button>

              <Button
                type="button"
                variant="ghost"
                className={cn(
                  "h-[35px] min-h-0 min-w-0 flex-1 rounded-full border-0 px-2 text-center text-[13px] font-medium leading-tight shadow-none transition-colors sm:px-3 sm:text-sm",
                  tab === "private"
                    ? "bg-white text-black shadow-sm hover:bg-white"
                    : "bg-transparent text-gray-600 hover:bg-black/[0.04]",
                )}
                onClick={() => changeTab("private")}
              >
                Хувийн сан
              </Button>
            </div>
            {tab === "private" ? (
              <PrivateBankAddMaterial
                subjects={subjects}
                viewerIsAdmin={viewerIsAdmin}
              />
            ) : null}
          </>
        ) : null}
      </div>

      {!isSubjectFocused ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative w-full max-w-[229px] shrink-0">
            <Search
              className="pointer-events-none absolute left-[16px] top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Хайх"
              className="box-border h-[39px] w-full rounded-xl border-0 bg-[#EBEBEB] py-[10px] pl-[40px] pr-[16px] text-sm shadow-none ring-0 placeholder:text-muted-foreground/80 focus-visible:ring-2 focus-visible:ring-[#3B6CB0]/25"
              aria-label="Хайх"
            />
          </div>

          {isQuestionBankTab ? (
            <div className="relative h-[39px] w-[220px] shrink-0">
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger
                  className={typeFilterTriggerClass}
                  aria-label="Төрлөөр шүүх"
                >
                  <SelectValue placeholder="Бүх төрөл" />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  align="start"
                  sideOffset={6}
                  className={questionBankSelectContentClass}
                >
                  <SelectItem value="all" className="rounded-lg">
                    Бүх төрөл
                  </SelectItem>
                  <SelectItem value="multiple_choice" className="rounded-lg">
                    {typeLabels.multiple_choice}
                  </SelectItem>
                  <SelectItem value="multiple_response" className="rounded-lg">
                    {typeLabels.multiple_response}
                  </SelectItem>
                  <SelectItem value="essay" className="rounded-lg">
                    {typeLabels.essay}
                  </SelectItem>
                  <SelectItem value="fill_blank" className="rounded-lg">
                    {typeLabels.fill_blank}
                  </SelectItem>
                  <SelectItem value="matching" className="rounded-lg">
                    {typeLabels.matching}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="relative h-[39px] w-[220px] shrink-0">
              <div className={typeFilterPlaceholderClass} aria-hidden />
            </div>
          )}

          {isQuestionBankTab ? (
            <div className="relative h-[39px] w-[220px] shrink-0">
              <Select
                value={subjectFilter}
                onValueChange={setSubjectFilterFromUi}
              >
                <SelectTrigger
                  className={subjectFilterTriggerClass}
                  aria-label="Хичээлээр шүүх"
                >
                  <SelectValue placeholder="Бүх хичээл" />
                </SelectTrigger>
                <SelectContent
                  position="popper"
                  align="start"
                  sideOffset={6}
                  className={questionBankSelectContentClass}
                >
                  <SelectItem value="all" className="rounded-lg">
                    Бүх хичээл
                  </SelectItem>
                  {subjects.map((subject) => (
                    <SelectItem
                      key={subject.id}
                      value={subject.id}
                      className="rounded-lg"
                    >
                      {subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="relative h-[39px] w-[220px] shrink-0">
              <div className={subjectFilterPlaceholderClass} aria-hidden />
            </div>
          )}
        </div>
      ) : null}

      {message ? (
        <div
          className={`rounded-lg border p-3 text-sm ${
            messageTone === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : messageTone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : messageTone === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "bg-muted/30"
          }`}
        >
          {message}
        </div>
      ) : null}

      {tab === "sample" ? (
        groupedSampleExams.length === 0 ? (
          <div className="rounded-lg border border-dashed text-center text-sm text-muted-foreground">
            Жишиг даалгаврууд олдсонгүй.
          </div>
        ) : (
          <div className="space-y-10">
            {groupedSampleExams.map((group) => (
              <section
                key={group.subjectId ?? `unknown:${group.subjectName}`}
                className="space-y-4"
              >
                <div className="flex items-center justify-between ">
                  <h2 className="text-xl font-bold text-gray-900">
                    {group.subjectName}
                  </h2>
                  {group.subjectId && !isSubjectFocused ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!group.subjectId) return;
                        setSubjectFilter(group.subjectId);
                        pushSubjectFilter(group.subjectId);
                      }}
                      className="text-sm font-medium text-[#030217] hover:underline cursor-pointer"
                    >
                      <div className="flex gap-1 items-center">
                        <p> Бүгд</p>
                        <ArrowRight size={16} />
                      </div>
                    </button>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {group.exams.map((sampleExam) => {
                    const hasSubjectMismatch = Boolean(
                      targetExamSubjectId &&
                      sampleExam.subject_id &&
                      sampleExam.subject_id !== targetExamSubjectId,
                    );

                    const subtitle = [
                      sampleExam.subtopic,
                      `${sampleExam.grade_level}-р анги`,
                    ]
                      .filter(Boolean)
                      .join(" · ");

                    return (
                      <Card
                        key={sampleExam.id}
                        className="flex h-full flex-col overflow-hidden border-gray-200 transition-shadow hover:shadow-md"
                      >
                        <CardContent className="flex flex-1 flex-col gap-4 p-5">
                          <div className="flex items-start gap-3">
                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-black/5">
                              <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                                IMG
                              </div>
                            </div>
                            <div className="min-w-0">
                              <p> {group.subjectName}</p>
                              <h3 className="line-clamp-1 text-base font-bold leading-tight">
                                {sampleExam.title}
                              </h3>
                              <p className="mt-1 text-xs font-medium text-muted-foreground">
                                {subtitle}
                              </p>
                            </div>
                          </div>

                          <p className="line-clamp-2 text-sm leading-relaxed text-gray-500">
                            {sampleExam.description || "Тайлбар байхгүй..."}
                          </p>

                          <div className="mt-auto space-y-3">
                            <div className="flex flex-wrap gap-2">
                              <Badge
                                variant="outline"
                                className="bg-white px-2 py-0.5 text-xs font-normal"
                              >
                                {sampleExam.question_count} асуулт
                              </Badge>
                              <Badge
                                className={`border-none px-2 py-0.5 text-xs text-white ${getDifficultyBadgeClass(
                                  sampleExam.difficulty_level,
                                )}`}
                              >
                                {
                                  difficultyLabels[
                                    sampleExam.difficulty_level ?? 1
                                  ]
                                }
                              </Badge>
                            </div>

                            <div className="flex flex-wrap gap-1.5">
                              {[
                                "Олон сонголттой",
                                "Эссэ",
                                "Богино хариулт",
                              ].map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded-full border border-gray-200 px-3 py-1 text-[11px] text-gray-600"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>

                            {sampleExam.sample_exam_items &&
                            sampleExam.sample_exam_items.length > 0 ? (
                              <details className="mt-2">
                                <summary className="flex w-full cursor-pointer list-none items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-100 [&::-webkit-details-marker]:hidden">
                                  <Eye className="h-4 w-4" />
                                  Үзэх
                                </summary>
                                <div className="mt-3 space-y-3 rounded-lg bg-muted/10 p-3">
                                  {sampleExam.sample_exam_items
                                    .sort(
                                      (left, right) =>
                                        left.order_index - right.order_index,
                                    )
                                    .map((item, index) => (
                                      <div key={item.id} className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-2 text-sm">
                                          <span className="font-medium">
                                            {index + 1}.
                                          </span>
                                          {item.question_bank?.type ? (
                                            <Badge variant="outline">
                                              {typeLabels[
                                                item.question_bank.type
                                              ] ?? item.question_bank.type}
                                            </Badge>
                                          ) : null}
                                          {item.question_bank?.points ? (
                                            <Badge
                                              variant="outline"
                                              className="bg-gray-100"
                                            >
                                              {item.question_bank.points} оноо
                                            </Badge>
                                          ) : null}
                                        </div>
                                        {item.question_bank ? (
                                          <MathContent
                                            html={
                                              item.question_bank.content_html
                                            }
                                            text={item.question_bank.content}
                                            className="prose prose-sm max-w-none text-foreground"
                                          />
                                        ) : null}
                                      </div>
                                    ))}
                                </div>
                              </details>
                            ) : (
                              <Button
                                type="button"
                                variant="outline"
                                className="flex w-full items-center justify-center gap-2 rounded-xl border-gray-200 bg-gray-50 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-100"
                                disabled
                              >
                                <Eye className="h-4 w-4" />
                                Үзэх
                              </Button>
                            )}

                            {examId ? (
                              <Button
                                type="button"
                                onClick={() =>
                                  handleImportSampleExam(sampleExam.id)
                                }
                                disabled={isBusy || hasSubjectMismatch}
                                variant={
                                  hasSubjectMismatch ? "outline" : "default"
                                }
                              >
                                {lastImportedSampleId === sampleExam.id
                                  ? "Оруулсан"
                                  : hasSubjectMismatch
                                    ? "Хичээл таарахгүй"
                                    : pendingAction === "import-sample" &&
                                        pendingSampleId === sampleExam.id
                                      ? "Оруулж байна..."
                                      : "Шалгалтад оруулах"}
                              </Button>
                            ) : null}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )
      ) : activeFilteredBankQuestions.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
          {tab === "private"
            ? "Хувийн бодлого олдсонгүй."
            : "Баталгаажсан бодлого олдсонгүй."}
        </div>
      ) : (
        <div className="space-y-3">
          {examId && (tab === "bank" || tab === "private") ? (
            <Card
              className={
                tab === "private"
                  ? "sticky top-3 z-10 border border-muted/60 bg-gradient-to-r from-muted/40 via-background/90 to-muted/20 shadow-sm ring-1 ring-primary/10 backdrop-blur supports-[backdrop-filter]:bg-background/70"
                  : "border border-dashed"
              }
            >
              <CardContent
                className={
                  tab === "private"
                    ? "flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between md:gap-4"
                    : "flex flex-col gap-2 py-3 md:flex-row md:items-center md:justify-between"
                }
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {tab === "private"
                      ? "Сонгосон материалууд"
                      : "Сонгосон асуултууд"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selectedQuestionIds.length > 0
                      ? tab === "private"
                        ? `${selectedQuestionIds.length} материал сонгосон байна.`
                        : `${selectedQuestionIds.length} асуулт шалгалтад нэмэхэд бэлэн байна.`
                      : tab === "private"
                        ? "Устгах материалуудаа чеклээд нэг дор устгана."
                        : "Шалгалтдаа нэмэх асуултуудаа чеклээд нэг дор импортлоно."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={toggleSelectAllVisibleQuestions}
                    disabled={
                      isBusy || visibleSelectableQuestionIds.length === 0
                    }
                    aria-pressed={allVisibleSelected}
                    className={
                      tab === "private"
                        ? [
                            "h-9 min-w-[190px] justify-center rounded-full border-muted-foreground/30 bg-background/70 px-4 text-sm font-medium shadow-sm transition hover:border-muted-foreground/50 hover:bg-muted/60",
                            allVisibleSelected
                              ? "border-primary/40 bg-primary/10 text-primary shadow-inner"
                              : "",
                          ].join(" ")
                        : undefined
                    }
                  >
                    {allVisibleSelected
                      ? "Сонголтыг цуцлах"
                      : "Харагдаж буйг сонгох"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearSelectedQuestions}
                    disabled={isBusy || selectedQuestionIds.length === 0}
                    className={
                      tab === "private"
                        ? "h-9 rounded-full border-muted-foreground/30 bg-background/70 px-4 text-sm font-medium shadow-sm transition hover:border-muted-foreground/50 hover:bg-muted/60"
                        : undefined
                    }
                  >
                    Цэвэрлэх
                  </Button>
                  {tab === "private" ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={isBusy || selectedQuestionIds.length === 0}
                          className={
                            tab === "private"
                              ? "h-9 rounded-full px-4 text-sm font-semibold shadow-sm transition hover:shadow"
                              : undefined
                          }
                        >
                          {pendingAction === "delete-bulk"
                            ? "Устгаж байна..."
                            : `Сонгосныг устгах (${selectedQuestionIds.length})`}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Сонгосон материалуудыг устгах уу?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            Сонгосон {selectedQuestionIds.length} материалыг
                            хувийн сангаас бүр мөсөн устгана.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Болих</AlertDialogCancel>
                          <AlertDialogAction
                            variant="destructive"
                            onClick={handleDeleteSelectedPrivateQuestions}
                            disabled={pendingAction === "delete-bulk"}
                          >
                            Устгах
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                  {examId ? (
                    <Button
                      type="button"
                      onClick={handleImportSelectedQuestions}
                      disabled={isBusy || selectedQuestionIds.length === 0}
                    >
                      {pendingAction === "import-bulk"
                        ? "Нэмж байна..."
                        : `Сонгосныг шалгалтад нэмэх (${selectedQuestionIds.length})`}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {activeFilteredBankQuestions.map((question) => {
            const hasSubjectMismatch = Boolean(
              targetExamSubjectId &&
              question.subject_id &&
              question.subject_id !== targetExamSubjectId,
            );
            const displayText =
              tab === "private" && !question.content_html
                ? formatInlineChoicesAsList(question.content)
                : question.content;

            const difficultyLevel = question.difficulty_level ?? 2;

            return (
              <Card key={question.id} className="pt-2 pb-4">
                <CardContent className="space-y-5 pt-0">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex flex-wrap gap-2">
                      {question.subjects?.name ? (
                        <span
                          className={certifiedBankMetaPillClass}
                          title={question.subjects.name}
                        >
                          {question.subjects.name}
                        </span>
                      ) : null}
                      {question.grade_level ? (
                        <span
                          className={certifiedBankMetaPillClass}
                          title={`${question.grade_level}-р анги`}
                        >
                          {question.grade_level}-р анги
                        </span>
                      ) : null}
                      {question.subtopic ? (
                        <span
                          className={certifiedBankMetaPillClass}
                          title={question.subtopic}
                        >
                          {question.subtopic}
                        </span>
                      ) : null}
                      <span
                        className={certifiedBankMetaPillClass}
                        title={
                          typeLabels[question.type] ?? question.type ?? undefined
                        }
                      >
                        {typeLabels[question.type] ?? question.type}
                      </span>
                      <span
                        className={cn(
                          certifiedBankMetaPillClass,
                          getDifficultyBadgeClass(difficultyLevel),
                          "border-transparent text-white",
                        )}
                        title={
                          difficultyLabels[difficultyLevel] ??
                          difficultyLabels[2]
                        }
                      >
                        {difficultyLabels[difficultyLevel] ??
                          difficultyLabels[2]}
                      </span>
                      <span
                        className={cn(
                          certifiedBankMetaPillClass,
                          "bg-gray-100",
                        )}
                        title={`${question.points} оноо`}
                      >
                        {question.points} оноо
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {examId && (tab === "bank" || tab === "private") ? (
                        <label className="inline-flex items-center gap-2 rounded-full border border-muted-foreground/30 bg-background/80 px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-muted-foreground/50 hover:bg-muted/60">
                          <input
                            type="checkbox"
                            checked={selectedQuestionIds.includes(question.id)}
                            onChange={() =>
                              toggleQuestionSelection(question.id)
                            }
                            disabled={
                              isBusy || (examId ? hasSubjectMismatch : false)
                            }
                            className="peer h-4 w-4 rounded border-muted-foreground/40 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
                          />
                          <span className="transition-colors peer-checked:text-primary">
                            Сонгох
                          </span>
                        </label>
                      ) : null}
                      {examId ? (
                        <Button
                          type="button"
                          onClick={() => handleImportQuestion(question.id)}
                          disabled={isBusy || hasSubjectMismatch}
                          variant={hasSubjectMismatch ? "outline" : "default"}
                        >
                          {lastImportedQuestionId === question.id
                            ? "Оруулсан"
                            : hasSubjectMismatch
                              ? "Хичээл таарахгүй"
                              : pendingAction === "import-single" &&
                                  pendingQuestionId === question.id
                                ? "Оруулж байна..."
                                : "Шалгалтад нэмэх"}
                        </Button>
                      ) : null}
                      {tab === "private" ? (
                        <>
                          <EditQuestionBankDialog
                            question={question}
                            subjects={subjects}
                            canAdminCurate={viewerIsAdmin}
                            trigger={
                              <button
                                type="button"
                                className="rounded-full p-2 text-gray-600 transition hover:bg-black/[0.04]"
                                aria-label="Засах"
                              >
                                <Pencil
                                  className="h-4 w-4"
                                  strokeWidth={2}
                                />
                              </button>
                            }
                          />
                          <button
                            type="button"
                            className="rounded-full p-2 text-[#e85b5b] transition hover:bg-red-50"
                            aria-label="Устгах"
                            onClick={() => setPendingDeleteId(question.id)}
                            disabled={
                              singleDeletingId === question.id || isBusy
                            }
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={2} />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <MathContent
                      html={question.content_html}
                      text={displayText}
                      className="prose prose-sm max-w-none text-foreground"
                    />
                  </div>

                  {question.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={question.image_url}
                      alt="Асуултын зураг"
                      className="max-h-56 rounded-lg border"
                    />
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Материалыг устгах уу?</AlertDialogTitle>
            <AlertDialogDescription>
              Энэ бичлэгийг хувийн сангаас бүрмөсөн устгана. Дахин сэргээх боломжгүй.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Болих</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingDeleteId) {
                  handleDeleteSinglePrivateQuestion(pendingDeleteId);
                }
              }}
              disabled={singleDeletingId !== null}
            >
              {singleDeletingId ? "Устгаж байна..." : "Устгах"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
