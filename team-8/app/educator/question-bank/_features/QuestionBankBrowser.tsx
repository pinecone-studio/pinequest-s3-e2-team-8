"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, Search } from "lucide-react";
import {
  bulkDeleteQuestionBankItems,
  importQuestionFromBank,
  importQuestionsFromBank,
  importSampleExamToExam,
} from "@/lib/question/actions";
import { suggestSubjectIdFromPrivateBank } from "@/lib/question/utils";
import type { QuestionBank, SampleExam, Subject } from "@/types";
import MathContent from "@/components/math/MathContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  multiple_choice: "Сонголттой",
  multiple_response: "Олон зөв",
  essay: "Нээлттэй",
  fill_blank: "Нөхөх",
  matching: "Холбох",
};

const difficultyLabels: Record<number, string> = {
  1: "Хөнгөн",
  2: "Дунд",
  3: "Хүнд",
};

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

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)),
  ).sort(stableStringCompare);
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
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<TabKey>(defaultTab);
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [gradeFilter, setGradeFilter] = useState("all");
  const [subtopicFilter, setSubtopicFilter] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [batchFilter, setBatchFilter] = useState("all");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [expandedQuestionIds, setExpandedQuestionIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(
    importUnavailableMessage ?? null,
  );
  const [messageTone, setMessageTone] = useState<MessageTone>(
    importUnavailableMessage ? "error" : "neutral",
  );
  const [lastImportedQuestionId, setLastImportedQuestionId] = useState<string | null>(null);
  const [lastImportedSampleId, setLastImportedSampleId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    "import-sample" | "import-single" | "import-bulk" | "delete-bulk" | null
  >(null);
  const [pendingQuestionId, setPendingQuestionId] = useState<string | null>(null);
  const [pendingSampleId, setPendingSampleId] = useState<string | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const isBusy = pendingAction !== null;

  const teacherSubjectIds = useMemo(
    () => subjects.map((s) => s.id),
    [subjects],
  );
  const suggestedPrivateSubjectId = useMemo(
    () => suggestSubjectIdFromPrivateBank(teacherSubjectIds, privateQuestions),
    [privateQuestions, teacherSubjectIds],
  );

  function changeTab(next: TabKey) {
    setSelectedQuestionIds([]);
    setExpandedQuestionIds([]);
    setBatchFilter("all");
    setTab(next);

    if (
      next === "private" &&
      subjectFilter === "all" &&
      suggestedPrivateSubjectId
    ) {
      setSubjectFilter(suggestedPrivateSubjectId);
    }
  }

  const batchOptions = useMemo(() => {
    const byId = new Map<string, { id: string; label: string }>();
    let hasNone = false;

    for (const q of privateQuestions) {
      const tags = Array.isArray(q.tags) ? q.tags : [];
      const batchIdTag = tags.find((t) => t.startsWith("batch:")) ?? "";
      const batchId = batchIdTag.replace(/^batch:/, "").trim();
      if (!batchId) {
        hasNone = true;
        continue;
      }
      const batchNameTag = tags.find((t) => t.startsWith("batchName:")) ?? "";
      const batchName = batchNameTag.replace(/^batchName:/, "").trim();
      byId.set(batchId, {
        id: batchId,
        label: batchName || `Багц ${batchId.slice(0, 6)}`,
      });
    }

    const items = Array.from(byId.values()).sort((a, b) =>
      stableStringCompare(a.label, b.label),
    );
    return { hasNone, items };
  }, [privateQuestions]);

  const subjectOptions = useMemo(
    () =>
      Array.from(
        new Map(
          subjects.map((subject) => [subject.id, subject.name]),
        ).entries(),
      ).sort((left, right) => stableStringCompare(left[1], right[1])),
    [subjects],
  );

  const gradeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...certifiedQuestions.map((question) => question.grade_level),
            ...privateQuestions.map((question) => question.grade_level),
            ...sampleExams.map((sampleExam) => sampleExam.grade_level),
          ].filter((grade): grade is number => Boolean(grade)),
        ),
      ).sort((left, right) => left - right),
    [certifiedQuestions, privateQuestions, sampleExams],
  );

  const subtopicOptions = useMemo(
    () =>
      uniqueValues([
        ...certifiedQuestions.map((question) => question.subtopic),
        ...privateQuestions.map((question) => question.subtopic),
        ...sampleExams.map((sampleExam) => sampleExam.subtopic),
      ]),
    [certifiedQuestions, privateQuestions, sampleExams],
  );

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
      const matchesBatch = (() => {
        if (tab !== "private") return true;
        if (batchFilter === "all") return true;
        const batchIdTag = tags.find((t) => t.startsWith("batch:")) ?? "";
        const batchId = batchIdTag.replace(/^batch:/, "").trim();
        if (batchFilter === "__none") return !batchId;
        return batchId === batchFilter;
      })();

      return (
        matchesQuery &&
        matchesSubject &&
        matchesGrade &&
        matchesSubtopic &&
        matchesDifficulty &&
        matchesType &&
        matchesBatch
      );
    });
  }, [
    privateQuestions,
    batchFilter,
    difficultyFilter,
    gradeFilter,
    normalizedQuery,
    subjectFilter,
    subtopicFilter,
    tab,
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
    return visibleSelectableQuestionIds.every((id) => selectedQuestionIds.includes(id));
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

  function toggleQuestionExpanded(questionId: string) {
    setExpandedQuestionIds((prev) =>
      prev.includes(questionId)
        ? prev.filter((item) => item !== questionId)
        : [...prev, questionId],
    );
  }

  function toggleSelectAllVisibleQuestions() {
    setSelectedQuestionIds((prev) => {
      if (visibleSelectableQuestionIds.length === 0) return prev;

      const visibleSet = new Set(visibleSelectableQuestionIds);
      const areAllSelected = visibleSelectableQuestionIds.every((id) => prev.includes(id));

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
    if (tab !== "private" || selectedQuestionIds.length === 0 || pendingAction) return;

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

  return (
    <div className="space-y-5">
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

      <div className="flex min-w-0 w-full flex-nowrap items-center gap-3">
        <div
          className="flex min-h-10 min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Асуултын сангийн орон"
        >
          <Button
            type="button"
            variant={tab === "sample" ? "default" : "outline"}
            className="shrink-0"
            onClick={() => changeTab("sample")}
          >
            Жишиг шалгалт
          </Button>
          <Button
            type="button"
            variant={tab === "bank" ? "default" : "outline"}
            className="shrink-0"
            onClick={() => changeTab("bank")}
          >
            Баталгаажсан сан
          </Button>
          <Button
            type="button"
            variant={tab === "private" ? "default" : "outline"}
            className="shrink-0"
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
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <label className="relative block xl:col-span-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Хайх"
            className="pl-10"
          />
        </label>

        <select
          value={subjectFilter}
          onChange={(event) => setSubjectFilter(event.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="all">Бүх хичээл</option>
          {subjectOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>

        {tab === "private" ? (
          <select
            value={batchFilter}
            onChange={(event) => setBatchFilter(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">Бүх багц</option>
            {batchOptions.hasNone ? (
              <option value="__none">Багцгүй</option>
            ) : null}
            {batchOptions.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        ) : null}

        <select
          value={gradeFilter}
          onChange={(event) => setGradeFilter(event.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="all">Бүх анги</option>
          {gradeOptions.map((grade) => (
            <option key={grade} value={String(grade)}>
              {grade}-р анги
            </option>
          ))}
        </select>

        <select
          value={subtopicFilter}
          onChange={(event) => setSubtopicFilter(event.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="all">Бүх дэд сэдэв</option>
          {subtopicOptions.map((subtopic) => (
            <option key={subtopic} value={subtopic}>
              {subtopic}
            </option>
          ))}
        </select>

        <select
          value={difficultyFilter}
          onChange={(event) => setDifficultyFilter(event.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="all">Бүх түвшин</option>
          <option value="1">1 · Хөнгөн</option>
          <option value="2">2 · Дунд</option>
          <option value="3">3 · Хүнд</option>
        </select>

        {tab === "bank" || tab === "private" ? (
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="all">Бүх төрөл</option>
            <option value="multiple_choice">Сонголттой</option>
            <option value="multiple_response">Олон зөв</option>
            <option value="essay">Нээлттэй</option>
            <option value="fill_blank">Нөхөх</option>
            <option value="matching">Холбох</option>
          </select>
        ) : null}
      </div>

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
        filteredSampleExams.length === 0 ? (
          <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
            Жишиг шалгалт олдсонгүй.
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-4">
            {filteredSampleExams.map((sampleExam) => {
              const hasSubjectMismatch = Boolean(
                targetExamSubjectId &&
                sampleExam.subject_id &&
                sampleExam.subject_id !== targetExamSubjectId,
              );

              return (
                <Card
                  key={sampleExam.id}
                  className="w-full self-start sm:w-[360px] shadow-sm"
                >
                  <CardContent className="space-y-4 pt-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-0">
                        <h3 className="mb-1 font-semibold">{sampleExam.title}</h3>
                        {sampleExam.description ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {sampleExam.description}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {sampleExam.subjects?.name ? (
                            <Badge variant="outline">
                              {sampleExam.subjects.name}
                            </Badge>
                          ) : null}
                          <Badge variant="outline">
                            {sampleExam.grade_level}-р анги
                          </Badge>
                          {sampleExam.subtopic ? (
                            <Badge variant="outline">
                              {sampleExam.subtopic}
                            </Badge>
                          ) : null}
                          <Badge variant="secondary">
                            {difficultyLabels[sampleExam.difficulty_level]}
                          </Badge>
                          <Badge variant="outline">
                            {sampleExam.duration_minutes} минут
                          </Badge>
                          <Badge variant="outline">
                            {sampleExam.question_count} асуулт
                          </Badge>
                        </div>
                      </div>

                      {examId ? (
                        <Button
                          type="button"
                          onClick={() => handleImportSampleExam(sampleExam.id)}
                          disabled={isBusy || hasSubjectMismatch}
                          variant={hasSubjectMismatch ? "outline" : "default"}
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

                    {sampleExam.sample_exam_items &&
                    sampleExam.sample_exam_items.length > 0 ? (
                      <details className="rounded-lg  bg-muted/10 p-3">
                        <summary className="flex h-[40px] w-[306px] cursor-pointer list-none items-center justify-center gap-[10px] rounded-xl border border-gray-300 bg-gray-50 px-[10px] py-[8px] text-sm font-semibold text-gray-900 transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
                          <Eye className="h-4 w-4" />
                          Үзэх
                        </summary>
                        <div className="mt-3 space-y-3">
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
                                      {typeLabels[item.question_bank.type] ??
                                        item.question_bank.type}
                                    </Badge>
                                  ) : null}
                                  {item.question_bank?.points ? (
                                    <Badge variant="outline">
                                      {item.question_bank.points} оноо
                                    </Badge>
                                  ) : null}
                                </div>
                                {item.question_bank ? (
                                  <MathContent
                                    html={item.question_bank.content_html}
                                    text={item.question_bank.content}
                                    className="prose prose-sm max-w-none text-foreground"
                                  />
                                ) : null}
                              </div>
                            ))}
                        </div>
                      </details>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
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
          {examId || tab === "private" ? (
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
                    disabled={isBusy || visibleSelectableQuestionIds.length === 0}
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
                    {allVisibleSelected ? "Сонголтыг цуцлах" : "Харагдаж буйг сонгох"}
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
            const isExpanded = expandedQuestionIds.includes(question.id);
            const isLong =
              (question.content_html ?? "").length > 240 ||
              question.content.length > 240;
            const displayText =
              tab === "private" && !question.content_html
                ? formatInlineChoicesAsList(question.content)
                : question.content;

            return (
              <Card key={question.id}>
                <CardContent
                  className={
                    tab === "private" ? "space-y-2 py-3" : "space-y-3 pt-4"
                  }
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    {tab === "private" ? (
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                          <span className="font-medium text-foreground">
                            {question.subjects?.name ?? "Хичээл сонгоогүй"}
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">
                            {typeLabels[question.type] ?? question.type}
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">
                            {difficultyLabels[question.difficulty_level]}
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">
                            {question.points} оноо
                          </span>
                          {question.grade_level ? (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-muted-foreground">
                                {question.grade_level}-р анги
                              </span>
                            </>
                          ) : null}
                          {question.subtopic ? (
                            <>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-muted-foreground">
                                {question.subtopic}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {question.subjects?.name ? (
                          <Badge variant="outline">
                            {question.subjects.name}
                          </Badge>
                        ) : null}
                        {question.grade_level ? (
                          <Badge variant="outline">
                            {question.grade_level}-р анги
                          </Badge>
                        ) : null}
                        {question.subtopic ? (
                          <Badge variant="outline">{question.subtopic}</Badge>
                        ) : null}
                        <Badge variant="outline">
                          {typeLabels[question.type] ?? question.type}
                        </Badge>
                        <Badge variant="secondary">
                          {difficultyLabels[question.difficulty_level]}
                        </Badge>
                        <Badge variant="outline">{question.points} оноо</Badge>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {examId || tab === "private" ? (
                        <>
                          <label className="inline-flex items-center gap-2 rounded-full border border-muted-foreground/30 bg-background/80 px-3 py-2 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-muted-foreground/50 hover:bg-muted/60">
                            <input
                              type="checkbox"
                              checked={selectedQuestionIds.includes(question.id)}
                              onChange={() => toggleQuestionSelection(question.id)}
                              disabled={isBusy || (examId ? hasSubjectMismatch : false)}
                              className="peer h-4 w-4 rounded border-muted-foreground/40 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
                            />
                            <span className="transition-colors peer-checked:text-primary">
                              Сонгох
                            </span>
                          </label>
                        </>
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
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div
                      className={
                        tab === "private" && !isExpanded
                          ? "max-h-24 overflow-hidden"
                          : undefined
                      }
                    >
                      <MathContent
                        html={question.content_html}
                        text={displayText}
                        className={
                          tab === "private"
                            ? "prose prose-sm max-w-none text-foreground [&_*]:leading-snug"
                            : "prose prose-sm max-w-none text-foreground"
                        }
                      />
                    </div>
                    {tab === "private" && isLong ? (
                      <button
                        type="button"
                        onClick={() => toggleQuestionExpanded(question.id)}
                        className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
                      >
                        {isExpanded ? "Хураах" : "Дэлгэрэнгүй"}
                      </button>
                    ) : null}
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
    </div>
  );
}
