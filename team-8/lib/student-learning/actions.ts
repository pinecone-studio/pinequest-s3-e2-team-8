"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getModel } from "@/lib/ai/config";
import { pickBestAttempt } from "@/lib/exam-attempt-utils";
import type {
  QuestionType,
  StudentLearningSubjectSummary,
  StudentLearningTopicSummary,
  StudentPracticeAnswer,
  StudentPracticeAttempt,
  StudentPracticeQuestion,
  StudentPracticeQuestionForTake,
  StudentSubjectStudyPlan,
  StudentTopicMastery,
} from "@/types";
import {
  DEFAULT_PRACTICE_QUESTION_COUNT,
  SUBJECT_SUMMARY_TOPIC_KEY,
  getBlendedMasteryScore,
  getPercentage,
  normalizeTopicKey,
  pickTopItems,
  roundToTwo,
  shouldIncludeTopicInProjection,
} from "@/lib/student-learning/utils";

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

type SubjectRow = {
  id: string;
  name: string;
};

type TopicAggregate = {
  student_id: string;
  subject_id: string;
  topic_key: string;
  topic_label: string;
  official_correct_points: number;
  official_total_points: number;
  practice_correct_points: number;
  practice_total_points: number;
  official_question_count: number;
  practice_question_count: number;
  mastery_score: number;
  updated_at: string;
};

type OfficialSessionRow = {
  id: string;
  exam_id: string;
  status: string;
  total_score: number | null;
  max_score: number | null;
  attempt_number: number;
  submitted_at: string | null;
  started_at: string | null;
  exams:
    | {
        subject_id: string | null;
        title: string;
      }
    | {
        subject_id: string | null;
        title: string;
      }[]
    | null;
};

type OfficialQuestionRow = {
  id: string;
  exam_id: string;
  subject_id: string | null;
  subtopic: string | null;
  points: number | null;
  topic_label_source: string | null;
  topic_label_confidence: number | null;
};

type OfficialAnswerRow = {
  session_id: string;
  question_id: string;
  score: number | null;
};

type PracticeQuestionSourceRow = {
  id: string;
  subject_id: string | null;
  subtopic: string | null;
  type: QuestionType;
  content: string;
  content_html: string | null;
  image_url: string | null;
  options: string[] | null;
  correct_answer: string | null;
  points: number | null;
  explanation: string | null;
  visibility?: string | null;
  grade_level?: number | null;
};

type PracticeAttemptRow = {
  id: string;
  practice_exam_id: string;
  student_id: string;
  status: "in_progress" | "graded";
  started_at: string;
  submitted_at: string | null;
  total_score: number | null;
  max_score: number | null;
  attempt_number: number;
  student_practice_exams:
    | {
        id: string;
        subject_id: string;
        title: string;
      }
    | {
        id: string;
        subject_id: string;
        title: string;
      }[]
    | null;
};

type PracticeAnswerRow = {
  practice_attempt_id: string;
  practice_question_id: string;
  score: number | null;
  answer: string | null;
  is_correct: boolean | null;
};

type GeneratedStudyPlan = {
  summary: string;
  priorities: string[];
  steps: string[];
  next_practice_focus: string[];
};

type GeneratedPracticeQuestion = {
  subtopic?: unknown;
  type?: unknown;
  content?: unknown;
  options?: unknown;
  correct_answer?: unknown;
  points?: unknown;
  explanation?: unknown;
};

type PracticeExamCreationResult =
  | { error: string }
  | { success: true; redirectTo: string };

type PracticeHistoryItem = {
  id: string;
  title: string;
  question_count: number;
  created_at: string;
  status: "in_progress" | "graded";
  submitted_at: string | null;
  percentage: number | null;
};

type MasteryRefreshQueueRow = {
  id: string;
  student_id: string;
  subject_id: string | null;
  scope_key: string;
  status: "pending" | "processing";
  attempts: number;
  next_run_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

const FULL_MASTERY_REFRESH_SCOPE_KEY = "__all__";
const DEFAULT_MASTERY_REFRESH_BATCH_SIZE = 10;
const MAX_MASTERY_REFRESH_BACKOFF_MINUTES = 30;

type LearningOverviewData = {
  subjects: StudentLearningSubjectSummary[];
  topics: StudentLearningTopicSummary[];
  isRefreshing: boolean;
  selectedSubjectId: string | null;
  subjectUpdatedAtById: Map<string, string>;
};

type LearningPageData =
  | { error: string }
  | {
      overview: Pick<
        LearningOverviewData,
        "subjects" | "topics" | "isRefreshing" | "selectedSubjectId"
      >;
      selectedSubject: {
        subject: StudentLearningSubjectSummary;
        topics: StudentLearningTopicSummary[];
        practiceHistory: PracticeHistoryItem[];
        isRefreshing: boolean;
      } | null;
      studyPlan:
        | { error: string }
        | {
            plan: StudentSubjectStudyPlan | null;
            isStale: boolean;
            isRefreshing: boolean;
          }
        | null;
    };

function getRelationObject<T>(value: T | T[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function parseStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "").trim()).filter(Boolean);
  }

  try {
    const parsed = JSON.parse(String(value ?? "[]")) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
  } catch {
    return String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function normalizeTextAnswer(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("mn-MN");
}

function areArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function parseMatchingPairs(options: unknown) {
  if (!Array.isArray(options)) return [];

  return options
    .map((option) => {
      const [left, ...rightParts] = String(option).split("|||");
      const right = rightParts.join("|||").trim();
      if (!left || !right) return null;
      return { left: left.trim(), right };
    })
    .filter(
      (item): item is { left: string; right: string } => Boolean(item)
    );
}

function extractJsonObject(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("AI хариултын JSON объектыг задлах боломжгүй байна.");
  }

  return JSON.parse(match[0]) as GeneratedStudyPlan;
}

function extractJsonArray(text: string) {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error("AI хариултын JSON массивыг задлах боломжгүй байна.");
  }

  return JSON.parse(match[0]) as GeneratedPracticeQuestion[];
}

async function getAuthenticatedStudentContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Нэвтрээгүй байна" } as const;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "student") {
    return { error: "Зөвхөн сурагч энэ үйлдлийг ашиглана." } as const;
  }

  return {
    userId: profile.id,
    fullName: profile.full_name ?? null,
  } as const;
}

async function assertAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Нэвтрээгүй байна" } as const;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin") {
    return { error: "Зөвхөн админ энэ үйлдлийг ашиглана." } as const;
  }

  return { userId: user.id } as const;
}

async function getStudentGradeLevel(admin: SupabaseAdminClient, studentId: string) {
  const { data, error } = await admin
    .from("student_group_members")
    .select("student_groups(grade)")
    .eq("student_id", studentId);

  if (error) {
    throw new Error(error.message);
  }

  const frequency = new Map<number, number>();
  for (const row of data ?? []) {
    const group = getRelationObject(row.student_groups as { grade: number | null } | { grade: number | null }[] | null);
    const grade = Number(group?.grade ?? 0);
    if (!Number.isFinite(grade) || grade <= 0) continue;
    frequency.set(grade, (frequency.get(grade) ?? 0) + 1);
  }

  if (frequency.size === 0) return null;

  return Array.from(frequency.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return right[0] - left[0];
    })[0]?.[0] ?? null;
}

async function getSubjectsByIds(admin: SupabaseAdminClient, subjectIds: string[]) {
  if (subjectIds.length === 0) return new Map<string, SubjectRow>();

  const { data, error } = await admin
    .from("subjects")
    .select("id, name")
    .in("id", subjectIds);

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data ?? []).map((subject) => [subject.id, subject as SubjectRow]));
}

function appendTopicContribution(
  aggregateMap: Map<string, TopicAggregate>,
  {
    studentId,
    subjectId,
    topicKey,
    topicLabel,
    source,
    score,
    points,
  }: {
    studentId: string;
    subjectId: string;
    topicKey: string;
    topicLabel: string;
    source: "official" | "practice";
    score: number;
    points: number;
  }
) {
  const existing = aggregateMap.get(topicKey) ?? {
    student_id: studentId,
    subject_id: subjectId,
    topic_key: topicKey,
    topic_label: topicLabel,
    official_correct_points: 0,
    official_total_points: 0,
    practice_correct_points: 0,
    practice_total_points: 0,
    official_question_count: 0,
    practice_question_count: 0,
    mastery_score: 0,
    updated_at: new Date().toISOString(),
  };

  if (source === "official") {
    existing.official_correct_points += score;
    existing.official_total_points += points;
    existing.official_question_count += 1;
  } else {
    existing.practice_correct_points += score;
    existing.practice_total_points += points;
    existing.practice_question_count += 1;
  }

  existing.mastery_score = getBlendedMasteryScore({
    officialCorrect: existing.official_correct_points,
    officialTotal: existing.official_total_points,
    practiceCorrect: existing.practice_correct_points,
    practiceTotal: existing.practice_total_points,
  });

  aggregateMap.set(topicKey, existing);
}

function finalizeTopicAggregateRows(
  nowIso: string,
  perSubject = new Map<string, Map<string, TopicAggregate>>()
) {
  const rows: TopicAggregate[] = [];

  for (const subjectTopics of perSubject.values()) {
    for (const row of subjectTopics.values()) {
      rows.push({
        ...row,
        official_correct_points: roundToTwo(row.official_correct_points),
        official_total_points: roundToTwo(row.official_total_points),
        practice_correct_points: roundToTwo(row.practice_correct_points),
        practice_total_points: roundToTwo(row.practice_total_points),
        mastery_score: roundToTwo(row.mastery_score),
        updated_at: nowIso,
      });
    }
  }

  return rows;
}

function getMasteryRefreshScopeKey(subjectId?: string | null) {
  return subjectId ?? FULL_MASTERY_REFRESH_SCOPE_KEY;
}

function getMasteryRefreshBackoffMinutes(attempts: number) {
  return Math.min(
    MAX_MASTERY_REFRESH_BACKOFF_MINUTES,
    2 ** Math.max(1, Number(attempts ?? 1))
  );
}

async function hasPendingMasteryRefresh(
  admin: SupabaseAdminClient,
  studentId: string,
  subjectId?: string
) {
  let query = admin
    .from("student_mastery_refresh_queue")
    .select("id")
    .eq("student_id", studentId)
    .in("status", ["pending", "processing"])
    .limit(1);

  if (subjectId) {
    query = query.in("scope_key", [
      FULL_MASTERY_REFRESH_SCOPE_KEY,
      getMasteryRefreshScopeKey(subjectId),
    ]);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data?.length ?? 0) > 0;
}

async function enqueueStudentTopicMasteryRefreshInternal(
  admin: SupabaseAdminClient,
  studentId: string,
  subjectId?: string | null
) {
  const scopeKey = getMasteryRefreshScopeKey(subjectId);
  const nowIso = new Date().toISOString();
  const { data: existingRows, error: existingError } = await admin
    .from("student_mastery_refresh_queue")
    .select("id, subject_id, scope_key, status")
    .eq("student_id", studentId);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const rows = (existingRows ?? []) as Array<{
    id: string;
    subject_id: string | null;
    scope_key: string;
    status: "pending" | "processing" | "failed";
  }>;
  const existingFull = rows.find(
    (row) => row.scope_key === FULL_MASTERY_REFRESH_SCOPE_KEY
  );

  if (subjectId && existingFull) {
    return { success: true, skipped: true as const };
  }

  if (!subjectId) {
    const pendingScopedIds = rows
      .filter(
        (row) =>
          row.scope_key !== FULL_MASTERY_REFRESH_SCOPE_KEY &&
          row.status !== "processing"
      )
      .map((row) => row.id);

    if (pendingScopedIds.length > 0) {
      const { error: deleteError } = await admin
        .from("student_mastery_refresh_queue")
        .delete()
        .in("id", pendingScopedIds);

      if (deleteError) {
        throw new Error(deleteError.message);
      }
    }
  }

  const existingScope = rows.find((row) => row.scope_key === scopeKey);
  if (existingScope) {
    if (existingScope.status === "processing") {
      return { success: true, skipped: true as const };
    }

    const { error: updateError } = await admin
      .from("student_mastery_refresh_queue")
      .update({
        status: "pending",
        attempts: 0,
        next_run_at: nowIso,
        last_error: null,
        subject_id: subjectId ?? null,
      })
      .eq("id", existingScope.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return { success: true };
  }

  const { error: insertError } = await admin
    .from("student_mastery_refresh_queue")
    .insert({
      student_id: studentId,
      subject_id: subjectId ?? null,
      scope_key: scopeKey,
      status: "pending",
      attempts: 0,
      next_run_at: nowIso,
      last_error: null,
    });

  if (insertError) {
    throw new Error(insertError.message);
  }

  return { success: true };
}

export async function enqueueStudentTopicMasteryRefresh(
  studentId: string,
  subjectId?: string | null
) {
  const admin = createAdminClient();
  return enqueueStudentTopicMasteryRefreshInternal(admin, studentId, subjectId);
}

export async function processPendingStudentMasteryRefreshJobs(
  batchSize = DEFAULT_MASTERY_REFRESH_BATCH_SIZE
) {
  const admin = createAdminClient();
  const safeBatchSize = Math.max(1, Math.min(Number(batchSize || 0), 25));
  const { data, error } = await admin.rpc("claim_student_mastery_refresh_jobs", {
    p_limit: safeBatchSize,
  });

  if (error) {
    throw new Error(error.message);
  }

  const jobs = (data ?? []) as MasteryRefreshQueueRow[];
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const job of jobs) {
    processed += 1;

    try {
      await recomputeStudentTopicMastery(job.student_id, job.subject_id ?? undefined);

      const { error: deleteError } = await admin
        .from("student_mastery_refresh_queue")
        .delete()
        .eq("id", job.id);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      succeeded += 1;
    } catch (queueError) {
      failed += 1;
      const nextRunAt = new Date(
        Date.now() + getMasteryRefreshBackoffMinutes(job.attempts) * 60 * 1000
      ).toISOString();
      const { error: updateError } = await admin
        .from("student_mastery_refresh_queue")
        .update({
          status: "pending",
          next_run_at: nextRunAt,
          last_error:
            queueError instanceof Error ? queueError.message : "unknown_error",
        })
        .eq("id", job.id);

      if (updateError) {
        throw new Error(updateError.message);
      }
    }
  }

  return {
    processed,
    succeeded,
    failed,
    claimed: jobs.length,
  };
}

export async function recomputeStudentTopicMastery(
  studentId: string,
  subjectId?: string
) {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const perSubject = new Map<string, Map<string, TopicAggregate>>();

  const { data: officialSessions, error: officialSessionsError } = await admin
    .from("exam_sessions")
    .select(
      "id, exam_id, status, total_score, max_score, attempt_number, submitted_at, started_at, exams(subject_id, title)"
    )
    .eq("user_id", studentId)
    .in("status", ["graded", "timed_out"]);

  if (officialSessionsError) {
    throw new Error(officialSessionsError.message);
  }

  const filteredOfficialSessions = ((officialSessions ?? []) as OfficialSessionRow[]).filter(
    (session) => {
      const exam = getRelationObject(session.exams);
      return !subjectId || exam?.subject_id === subjectId;
    }
  );

  const sessionsByExam = new Map<string, OfficialSessionRow[]>();
  for (const session of filteredOfficialSessions) {
    const examSessions = sessionsByExam.get(session.exam_id) ?? [];
    examSessions.push(session);
    sessionsByExam.set(session.exam_id, examSessions);
  }

  const bestOfficialSessions = Array.from(sessionsByExam.values())
    .map((sessions) => pickBestAttempt(sessions))
    .filter((session): session is OfficialSessionRow => Boolean(session));

  const officialExamIds = [...new Set(bestOfficialSessions.map((session) => session.exam_id))];
  const officialSessionIds = bestOfficialSessions.map((session) => session.id);

  const [{ data: officialQuestions }, { data: officialAnswers }] = await Promise.all([
    officialExamIds.length > 0
      ? admin
          .from("questions")
          .select(
            "id, exam_id, subject_id, subtopic, points, topic_label_source, topic_label_confidence"
          )
          .in("exam_id", officialExamIds)
      : Promise.resolve({ data: [], error: null }),
    officialSessionIds.length > 0
      ? admin
          .from("answers")
          .select("session_id, question_id, score")
          .in("session_id", officialSessionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const officialQuestionsByExam = new Map<string, OfficialQuestionRow[]>();
  for (const question of (officialQuestions ?? []) as OfficialQuestionRow[]) {
    const examQuestions = officialQuestionsByExam.get(question.exam_id) ?? [];
    examQuestions.push(question);
    officialQuestionsByExam.set(question.exam_id, examQuestions);
  }

  const officialAnswersBySession = new Map<string, Map<string, OfficialAnswerRow>>();
  for (const answer of (officialAnswers ?? []) as OfficialAnswerRow[]) {
    const sessionAnswers = officialAnswersBySession.get(answer.session_id) ?? new Map();
    sessionAnswers.set(answer.question_id, answer);
    officialAnswersBySession.set(answer.session_id, sessionAnswers);
  }

  for (const session of bestOfficialSessions) {
    const exam = getRelationObject(session.exams);
    const fallbackSubjectId = exam?.subject_id ?? null;
    const examQuestions = officialQuestionsByExam.get(session.exam_id) ?? [];
    const sessionAnswers = officialAnswersBySession.get(session.id) ?? new Map();

    for (const question of examQuestions) {
      const effectiveSubjectId = question.subject_id ?? fallbackSubjectId;
      if (!effectiveSubjectId) continue;

      const subjectTopics = perSubject.get(effectiveSubjectId) ?? new Map<string, TopicAggregate>();
      perSubject.set(effectiveSubjectId, subjectTopics);

      const questionPoints = Number(question.points ?? 0);
      const answerScore = Number(sessionAnswers.get(question.id)?.score ?? 0);

      appendTopicContribution(subjectTopics, {
        studentId,
        subjectId: effectiveSubjectId,
        topicKey: SUBJECT_SUMMARY_TOPIC_KEY,
        topicLabel: SUBJECT_SUMMARY_TOPIC_KEY,
        source: "official",
        score: answerScore,
        points: questionPoints,
      });

      if (
        shouldIncludeTopicInProjection({
          topicLabel: question.subtopic,
          topicSource: question.topic_label_source,
          topicConfidence: question.topic_label_confidence,
        })
      ) {
        const topicLabel = String(question.subtopic).trim();
        appendTopicContribution(subjectTopics, {
          studentId,
          subjectId: effectiveSubjectId,
          topicKey: normalizeTopicKey(topicLabel),
          topicLabel,
          source: "official",
          score: answerScore,
          points: questionPoints,
        });
      }
    }
  }

  const { data: practiceAttempts, error: practiceAttemptsError } = await admin
    .from("student_practice_attempts")
    .select(
      "id, practice_exam_id, student_id, status, started_at, submitted_at, total_score, max_score, attempt_number, student_practice_exams(id, subject_id, title)"
    )
    .eq("student_id", studentId)
    .eq("status", "graded");

  if (practiceAttemptsError) {
    throw new Error(practiceAttemptsError.message);
  }

  const filteredPracticeAttempts = ((practiceAttempts ?? []) as PracticeAttemptRow[]).filter(
    (attempt) => {
      const exam = getRelationObject(attempt.student_practice_exams);
      return !subjectId || exam?.subject_id === subjectId;
    }
  );

  const practiceExamIds = [...new Set(filteredPracticeAttempts.map((attempt) => attempt.practice_exam_id))];
  const practiceAttemptIds = filteredPracticeAttempts.map((attempt) => attempt.id);

  const [{ data: practiceQuestions }, { data: practiceAnswers }] = await Promise.all([
    practiceExamIds.length > 0
      ? admin
          .from("student_practice_questions")
          .select(
            "id, practice_exam_id, subject_id, source_type, source_question_bank_id, topic_key, subtopic, type, content, content_html, image_url, options, correct_answer, points, order_index, explanation"
          )
          .in("practice_exam_id", practiceExamIds)
      : Promise.resolve({ data: [], error: null }),
    practiceAttemptIds.length > 0
      ? admin
          .from("student_practice_answers")
          .select("practice_attempt_id, practice_question_id, score, answer, is_correct")
          .in("practice_attempt_id", practiceAttemptIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const practiceQuestionsByExam = new Map<string, StudentPracticeQuestion[]>();
  for (const question of (practiceQuestions ?? []) as StudentPracticeQuestion[]) {
    const examQuestions = practiceQuestionsByExam.get(question.practice_exam_id) ?? [];
    examQuestions.push(question);
    practiceQuestionsByExam.set(question.practice_exam_id, examQuestions);
  }

  const practiceAnswersByAttempt = new Map<string, Map<string, PracticeAnswerRow>>();
  for (const answer of (practiceAnswers ?? []) as PracticeAnswerRow[]) {
    const attemptAnswers =
      practiceAnswersByAttempt.get(answer.practice_attempt_id) ?? new Map();
    attemptAnswers.set(answer.practice_question_id, answer);
    practiceAnswersByAttempt.set(answer.practice_attempt_id, attemptAnswers);
  }

  for (const attempt of filteredPracticeAttempts) {
    const practiceExam = getRelationObject(attempt.student_practice_exams);
    const effectiveSubjectId = practiceExam?.subject_id;
    if (!effectiveSubjectId) continue;

    const subjectTopics = perSubject.get(effectiveSubjectId) ?? new Map<string, TopicAggregate>();
    perSubject.set(effectiveSubjectId, subjectTopics);

    const questions = practiceQuestionsByExam.get(attempt.practice_exam_id) ?? [];
    const answerMap = practiceAnswersByAttempt.get(attempt.id) ?? new Map();

    for (const question of questions) {
      const questionPoints = Number(question.points ?? 0);
      const answerScore = Number(answerMap.get(question.id)?.score ?? 0);

      appendTopicContribution(subjectTopics, {
        studentId,
        subjectId: effectiveSubjectId,
        topicKey: SUBJECT_SUMMARY_TOPIC_KEY,
        topicLabel: SUBJECT_SUMMARY_TOPIC_KEY,
        source: "practice",
        score: answerScore,
        points: questionPoints,
      });

      if (question.topic_key && question.subtopic) {
        appendTopicContribution(subjectTopics, {
          studentId,
          subjectId: effectiveSubjectId,
          topicKey: question.topic_key,
          topicLabel: question.subtopic,
          source: "practice",
          score: answerScore,
          points: questionPoints,
        });
      }
    }
  }

  const rows = finalizeTopicAggregateRows(nowIso, perSubject);
  const { error: replaceError } = await admin.rpc(
    "replace_student_topic_mastery_projection",
    {
      p_student_id: studentId,
      p_subject_id: subjectId ?? null,
      p_rows: rows,
    }
  );

  if (replaceError) {
    throw new Error(replaceError.message);
  }

  return rows.length;
}

async function ensureStudentTopicMasteryAvailable(
  admin: SupabaseAdminClient,
  studentId: string
) {
  const { data, error } = await admin
    .from("student_topic_mastery")
    .select("id")
    .eq("student_id", studentId)
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const isRefreshing = await hasPendingMasteryRefresh(admin, studentId);
  if ((data?.length ?? 0) === 0) {
    if (!isRefreshing) {
      await enqueueStudentTopicMasteryRefreshInternal(admin, studentId);
    }

    return {
      hasProjection: false,
      isRefreshing: true,
    };
  }

  return {
    hasProjection: true,
    isRefreshing,
  };
}

async function getLearningOverviewForStudent(studentId: string): Promise<LearningOverviewData> {
  const admin = createAdminClient();
  const availability = await ensureStudentTopicMasteryAvailable(admin, studentId);

  if (!availability.hasProjection) {
    return {
      subjects: [] as StudentLearningSubjectSummary[],
      topics: [] as StudentLearningTopicSummary[],
      isRefreshing: availability.isRefreshing,
      selectedSubjectId: null,
      subjectUpdatedAtById: new Map<string, string>(),
    };
  }

  const { data: rows, error } = await admin
    .from("student_topic_mastery")
    .select("*, subjects(name)")
    .eq("student_id", studentId);

  if (error) {
    throw new Error(error.message);
  }

  const subjectSummaries = new Map<string, StudentLearningSubjectSummary>();
  const topicRows: StudentLearningTopicSummary[] = [];
  const subjectUpdatedAtById = new Map<string, string>();

  for (const rawRow of (rows ?? []) as Array<
    StudentTopicMastery & {
      subjects?: { name: string } | { name: string }[] | null;
    }
  >) {
    const subject = getRelationObject(rawRow.subjects);
    const subjectName = subject?.name ?? "Хичээл";
    const currentUpdatedAt = String(rawRow.updated_at ?? "");
    const existingUpdatedAt = subjectUpdatedAtById.get(rawRow.subject_id);
    if (
      currentUpdatedAt &&
      (!existingUpdatedAt ||
        new Date(currentUpdatedAt).getTime() > new Date(existingUpdatedAt).getTime())
    ) {
      subjectUpdatedAtById.set(rawRow.subject_id, currentUpdatedAt);
    }
    const officialPercentage = getPercentage(
      Number(rawRow.official_correct_points ?? 0),
      Number(rawRow.official_total_points ?? 0)
    );
    const practicePercentage = getPercentage(
      Number(rawRow.practice_correct_points ?? 0),
      Number(rawRow.practice_total_points ?? 0)
    );

    if (rawRow.topic_key === SUBJECT_SUMMARY_TOPIC_KEY) {
      subjectSummaries.set(rawRow.subject_id, {
        subject_id: rawRow.subject_id,
        subject_name: subjectName,
        mastery_score: Number(rawRow.mastery_score ?? 0),
        official_question_count: Number(rawRow.official_question_count ?? 0),
        practice_question_count: Number(rawRow.practice_question_count ?? 0),
        weak_topic_count: 0,
        needs_topic_backfill: false,
      });
      continue;
    }

    topicRows.push({
      subject_id: rawRow.subject_id,
      subject_name: subjectName,
      topic_key: rawRow.topic_key,
      topic_label: rawRow.topic_label,
      mastery_score: Number(rawRow.mastery_score ?? 0),
      official_question_count: Number(rawRow.official_question_count ?? 0),
      practice_question_count: Number(rawRow.practice_question_count ?? 0),
      official_percentage: officialPercentage,
      practice_percentage: practicePercentage,
    });
  }

  for (const topic of topicRows) {
    const summary = subjectSummaries.get(topic.subject_id);
    if (!summary) continue;
    summary.weak_topic_count += 1;
  }

  for (const summary of subjectSummaries.values()) {
    if (summary.official_question_count > 0 && summary.weak_topic_count === 0) {
      summary.needs_topic_backfill = true;
    }
  }

  const sortedSubjects = Array.from(subjectSummaries.values()).sort(
    (left, right) => left.mastery_score - right.mastery_score
  );

  return {
    subjects: sortedSubjects,
    topics: topicRows.sort((left, right) => left.mastery_score - right.mastery_score),
    isRefreshing: availability.isRefreshing,
    selectedSubjectId: sortedSubjects[0]?.subject_id ?? null,
    subjectUpdatedAtById,
  };
}

function getSubjectLearningFromOverview(
  overview: LearningOverviewData,
  subjectId: string
) {
  const subjectSummary = overview.subjects.find((subject) => subject.subject_id === subjectId);
  if (!subjectSummary) {
    return null;
  }

  return {
    subject: subjectSummary,
    topics: overview.topics
      .filter((topic) => topic.subject_id === subjectId)
      .sort((left, right) => left.mastery_score - right.mastery_score),
  };
}

async function getPracticeHistoryForSubject(
  admin: SupabaseAdminClient,
  studentId: string,
  subjectId: string
): Promise<PracticeHistoryItem[]> {
  const { data: practiceExams, error: practiceError } = await admin
    .from("student_practice_exams")
    .select("id, title, question_count, created_at")
    .eq("student_id", studentId)
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (practiceError) {
    throw new Error(practiceError.message);
  }

  const exams = (practiceExams ?? []) as Array<{
    id: string;
    title: string;
    question_count: number | null;
    created_at: string;
  }>;
  if (exams.length === 0) return [];

  const examIds = exams.map((exam) => exam.id);
  const { data: attemptRows, error: attemptError } = await admin
    .from("student_practice_attempts")
    .select(
      "id, practice_exam_id, status, submitted_at, total_score, max_score, started_at, attempt_number"
    )
    .eq("student_id", studentId)
    .in("practice_exam_id", examIds);

  if (attemptError) {
    throw new Error(attemptError.message);
  }

  const attemptsByExamId = new Map<
    string,
    {
      id: string;
      status: "in_progress" | "graded";
      submitted_at: string | null;
      total_score: number | null;
      max_score: number | null;
      started_at: string;
      attempt_number: number;
    }
  >();

  for (const attempt of (attemptRows ?? []) as Array<{
    id: string;
    practice_exam_id: string;
    status: "in_progress" | "graded";
    submitted_at: string | null;
    total_score: number | null;
    max_score: number | null;
    started_at: string;
    attempt_number: number;
  }>) {
    const current = attemptsByExamId.get(attempt.practice_exam_id);
    if (!current) {
      attemptsByExamId.set(attempt.practice_exam_id, attempt);
      continue;
    }

    const currentStartedAt = new Date(current.started_at).getTime();
    const nextStartedAt = new Date(attempt.started_at).getTime();
    if (
      nextStartedAt > currentStartedAt ||
      (nextStartedAt === currentStartedAt &&
        (attempt.attempt_number > current.attempt_number ||
          (attempt.attempt_number === current.attempt_number &&
            attempt.id > current.id)))
    ) {
      attemptsByExamId.set(attempt.practice_exam_id, attempt);
    }
  }

  return exams.map((exam) => {
    const attempt = attemptsByExamId.get(exam.id);
    const percentage =
      attempt?.max_score && Number(attempt.max_score) > 0
        ? Math.round((Number(attempt.total_score ?? 0) / Number(attempt.max_score)) * 100)
        : null;

    return {
      id: exam.id,
      title: exam.title,
      question_count: Number(exam.question_count ?? 0),
      created_at: exam.created_at,
      status: attempt?.status ?? "in_progress",
      submitted_at: attempt?.submitted_at ?? null,
      percentage,
    };
  });
}

async function getStudentSubjectStudyPlanForContext(
  admin: SupabaseAdminClient,
  studentId: string,
  subjectId: string,
  masteryUpdatedAt: string | null,
  isRefreshing: boolean
) {
  if (!masteryUpdatedAt) {
    return { plan: null, isStale: false, isRefreshing };
  }

  const { data, error } = await admin
    .from("student_subject_study_plans")
    .select("student_id, subject_id, mastery_updated_at, plan_json, generated_at")
    .eq("student_id", studentId)
    .eq("subject_id", subjectId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return { plan: null, isStale: false, isRefreshing };
  }

  const isStale =
    new Date(String(data.mastery_updated_at)).getTime() <
    new Date(masteryUpdatedAt).getTime();
  const planJson = (data.plan_json ?? {}) as GeneratedStudyPlan;

  return {
    plan: {
      student_id: studentId,
      subject_id: subjectId,
      mastery_updated_at: String(data.mastery_updated_at),
      generated_at: String(data.generated_at),
      summary: String(planJson.summary ?? ""),
      priorities: Array.isArray(planJson.priorities)
        ? planJson.priorities.map((item) => String(item))
        : [],
      steps: Array.isArray(planJson.steps)
        ? planJson.steps.map((item) => String(item))
        : [],
      next_practice_focus: Array.isArray(planJson.next_practice_focus)
        ? planJson.next_practice_focus.map((item) => String(item))
        : [],
    } satisfies StudentSubjectStudyPlan,
    isStale,
    isRefreshing,
  };
}

export async function getStudentLearningOverview() {
  const context = await getAuthenticatedStudentContext();
  if ("error" in context) {
    return {
      subjects: [],
      topics: [],
      selectedSubjectId: null,
      isRefreshing: false,
    };
  }

  const overview = await getLearningOverviewForStudent(context.userId);
  return {
    subjects: overview.subjects,
    topics: overview.topics,
    selectedSubjectId: overview.selectedSubjectId,
    isRefreshing: overview.isRefreshing,
  };
}

export async function getStudentLearningDashboardSummary(studentId: string) {
  const overview = await getLearningOverviewForStudent(studentId);

  return {
    weakSubjects: overview.subjects.slice(0, 3),
    weakTopics: pickTopItems(overview.topics, (topic) => topic.mastery_score, 3),
    isRefreshing: overview.isRefreshing,
  };
}

export async function getStudentLearningPageData(
  requestedSubjectId?: string
): Promise<LearningPageData> {
  const context = await getAuthenticatedStudentContext();
  if ("error" in context) {
    return { error: context.error ?? "Нэвтрэх шаардлагатай." };
  }

  const overview = await getLearningOverviewForStudent(context.userId);
  const selectedSubjectId =
    overview.subjects.find((item) => item.subject_id === requestedSubjectId)?.subject_id ??
    overview.selectedSubjectId;

  if (!selectedSubjectId) {
    return {
      overview: {
        subjects: overview.subjects,
        topics: overview.topics,
        isRefreshing: overview.isRefreshing,
        selectedSubjectId: null,
      },
      selectedSubject: null,
      studyPlan: null,
    };
  }

  const subjectLearning = getSubjectLearningFromOverview(overview, selectedSubjectId);
  if (!subjectLearning) {
    return {
      overview: {
        subjects: overview.subjects,
        topics: overview.topics,
        isRefreshing: overview.isRefreshing,
        selectedSubjectId,
      },
      selectedSubject: null,
      studyPlan: null,
    };
  }

  const admin = createAdminClient();
  const isSubjectRefreshing = await hasPendingMasteryRefresh(
    admin,
    context.userId,
    selectedSubjectId
  );
  const masteryUpdatedAt = overview.subjectUpdatedAtById.get(selectedSubjectId) ?? null;

  const [practiceHistory, studyPlan] = await Promise.all([
    getPracticeHistoryForSubject(admin, context.userId, selectedSubjectId),
    getStudentSubjectStudyPlanForContext(
      admin,
      context.userId,
      selectedSubjectId,
      masteryUpdatedAt,
      isSubjectRefreshing
    ),
  ]);

  return {
    overview: {
      subjects: overview.subjects,
      topics: overview.topics,
      isRefreshing: overview.isRefreshing,
      selectedSubjectId,
    },
    selectedSubject: {
      subject: subjectLearning.subject,
      topics: subjectLearning.topics,
      practiceHistory,
      isRefreshing: isSubjectRefreshing,
    },
    studyPlan,
  };
}

export async function getStudentSubjectLearning(subjectId: string) {
  const context = await getAuthenticatedStudentContext();
  if ("error" in context) {
    return { error: context.error };
  }

  const overview = await getLearningOverviewForStudent(context.userId);
  const subjectLearning = getSubjectLearningFromOverview(overview, subjectId);

  if (!subjectLearning) {
    return { error: "Энэ хичээлийн learning data олдсонгүй." };
  }

  const admin = createAdminClient();
  const isRefreshing = await hasPendingMasteryRefresh(admin, context.userId, subjectId);
  const practiceHistory = await getPracticeHistoryForSubject(
    admin,
    context.userId,
    subjectId
  );

  return {
    subject: subjectLearning.subject,
    topics: subjectLearning.topics,
    practiceHistory,
    isRefreshing,
  };
}

async function generateStudyPlanWithAI(input: {
  subjectName: string;
  weakTopics: StudentLearningTopicSummary[];
  subjectSummary: StudentLearningSubjectSummary;
}) {
  const model = getModel();
  const weakTopicLines = input.weakTopics
    .slice(0, 5)
    .map(
      (topic, index) =>
        `${index + 1}. ${topic.topic_label} — mastery ${Math.round(topic.mastery_score)}%, official ${topic.official_percentage ?? "—"}%, practice ${topic.practice_percentage ?? "—"}%`
    )
    .join("\n");

  const prompt = `Чи сурагчид зориулсан хичээлийн хөгжлийн зөвлөх AI юм.

Хичээл: ${input.subjectName}
Нийт mastery: ${Math.round(input.subjectSummary.mastery_score)}%
Албан ёсны асуултын тоо: ${input.subjectSummary.official_question_count}
Practice асуултын тоо: ${input.subjectSummary.practice_question_count}

Сул сэдвүүд:
${weakTopicLines || "Тодорхой сул сэдэв одоогоор байхгүй"}

Сурагчид ойлгомжтой, урам өгсөн, богино бөгөөд тодорхой төлөвлөгөө гарга.
JSON форматаар л хариул:
{
  "summary": "2-3 өгүүлбэрийн ерөнхий тайлбар",
  "priorities": ["priority 1", "priority 2", "priority 3"],
  "steps": ["step 1", "step 2", "step 3"],
  "next_practice_focus": ["topic 1", "topic 2", "topic 3"]
}`;

  const result = await model.generateContent(prompt);
  const parsed = extractJsonObject(result.response.text().trim());

  return {
    summary: String(parsed.summary ?? "").trim(),
    priorities: Array.isArray(parsed.priorities)
      ? parsed.priorities.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
      : [],
    steps: Array.isArray(parsed.steps)
      ? parsed.steps.map((item) => String(item).trim()).filter(Boolean).slice(0, 3)
      : [],
    next_practice_focus: Array.isArray(parsed.next_practice_focus)
      ? parsed.next_practice_focus
          .map((item) => String(item).trim())
          .filter(Boolean)
          .slice(0, 3)
      : [],
  } satisfies GeneratedStudyPlan;
}

export async function getStudentSubjectStudyPlan(subjectId: string) {
  const context = await getAuthenticatedStudentContext();
  if ("error" in context) {
    return { error: context.error };
  }

  const overview = await getLearningOverviewForStudent(context.userId);
  const admin = createAdminClient();
  const isRefreshing = await hasPendingMasteryRefresh(admin, context.userId, subjectId);
  return getStudentSubjectStudyPlanForContext(
    admin,
    context.userId,
    subjectId,
    overview.subjectUpdatedAtById.get(subjectId) ?? null,
    isRefreshing
  );
}

export async function refreshStudentSubjectStudyPlan(subjectId: string) {
  const context = await getAuthenticatedStudentContext();
  if ("error" in context) {
    return { error: context.error };
  }

  const overview = await getLearningOverviewForStudent(context.userId);
  const subjectLearning = getSubjectLearningFromOverview(overview, subjectId);
  if (!subjectLearning) {
    return { error: "Энэ хичээлийн learning data олдсонгүй." };
  }

  const admin = createAdminClient();
  const masteryUpdatedAt = overview.subjectUpdatedAtById.get(subjectId) ?? null;
  if (!masteryUpdatedAt) {
    return { error: "Энэ хичээлд study plan үүсгэх mastery data алга." };
  }

  const plan = await generateStudyPlanWithAI({
    subjectName: subjectLearning.subject.subject_name,
    weakTopics: subjectLearning.topics,
    subjectSummary: subjectLearning.subject,
  });

  const { error } = await admin
    .from("student_subject_study_plans")
    .upsert(
      {
        student_id: context.userId,
        subject_id: subjectId,
        mastery_updated_at: masteryUpdatedAt,
        plan_json: plan,
        generated_at: new Date().toISOString(),
      },
      {
        onConflict: "student_id,subject_id",
      }
    );

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/student");
  revalidatePath("/student/learning");

  return { success: true };
}

function normalizeGeneratedPracticeQuestion(
  question: GeneratedPracticeQuestion,
  fallbackTopicLabel: string
) {
  const type = String(question.type ?? "").trim() as QuestionType;
  const content = String(question.content ?? "").trim();
  const subtopic = String(question.subtopic ?? fallbackTopicLabel).trim() || fallbackTopicLabel;
  const explanation = String(question.explanation ?? "").trim() || null;
  const points = Math.max(1, Number(question.points ?? 1) || 1);

  if (!content) return null;
  if (!["multiple_choice", "multiple_response", "fill_blank", "matching"].includes(type)) {
    return null;
  }

  let options: string[] | null = null;
  let correctAnswer: string | null = null;

  if (type === "multiple_choice") {
    options = parseStringArray(question.options);
    correctAnswer = String(question.correct_answer ?? "").trim() || null;
    if (!options || options.length < 2 || !correctAnswer || !options.includes(correctAnswer)) {
      return null;
    }
  } else if (type === "multiple_response") {
    options = parseStringArray(question.options);
    const answers = parseStringArray(question.correct_answer);
    if (!options || options.length < 2 || answers.length === 0) return null;
    if (answers.some((answer) => !options?.includes(answer))) return null;
    correctAnswer = JSON.stringify(answers);
  } else if (type === "fill_blank") {
    correctAnswer = String(question.correct_answer ?? "").trim() || null;
    if (!correctAnswer) return null;
  } else if (type === "matching") {
    options = parseStringArray(question.options);
    if (!options || options.length < 2) return null;
    const pairs = options.map((pair) => {
      const [left, ...rightParts] = String(pair).split("|||");
      const right = rightParts.join("|||").trim();
      return left?.trim() && right ? { left: left.trim(), right } : null;
    });
    if (pairs.some((pair) => !pair)) return null;
    correctAnswer = JSON.stringify((pairs as Array<{ left: string; right: string }>));
  }

  return {
    sourceType: "ai" as const,
    sourceQuestionBankId: null,
    topicKey: normalizeTopicKey(subtopic),
    subtopic,
    type,
    content,
    contentHtml: null,
    imageUrl: null,
    options,
    correctAnswer,
    points,
    explanation,
  };
}

async function generatePracticeQuestionsWithAI(input: {
  subjectName: string;
  gradeLevel: number | null;
  topics: StudentLearningTopicSummary[];
  questionCount: number;
}) {
  const model = getModel();
  const topicList = input.topics
    .map((topic) => `- ${topic.topic_label} (mastery ${Math.round(topic.mastery_score)}%)`)
    .join("\n");

  const prompt = `Чи сурагчид зориулсан practice асуулт бэлддэг AI багш юм.

Хичээл: ${input.subjectName}
${input.gradeLevel ? `Анги: ${input.gradeLevel}-р анги` : ""}
Сул сэдвүүд:
${topicList}

Дээрх сэдвүүдэд тэнцвэртэй хуваарилж ${input.questionCount} ширхэг AUTO-GRADABLE practice асуулт үүсгэ.
Зөвхөн дараах төрлүүдийг ашигла:
- multiple_choice
- multiple_response
- fill_blank
- matching

JSON array форматаар л хариул:
[
  {
    "subtopic": "Сэдвийн нэр",
    "type": "multiple_choice",
    "content": "Асуултын текст",
    "options": ["A", "B", "C", "D"],
    "correct_answer": "A",
    "points": 1,
    "explanation": "Товч тайлбар"
  }
]`;

  const result = await model.generateContent(prompt);
  const parsed = extractJsonArray(result.response.text().trim());

  const fallbackTopicLabel = input.topics[0]?.topic_label ?? "Practice";

  return parsed
    .map((question) => normalizeGeneratedPracticeQuestion(question, fallbackTopicLabel))
    .filter(
      (
        question
      ): question is {
        sourceType: "ai";
        sourceQuestionBankId: null;
        topicKey: string;
        subtopic: string;
        type: QuestionType;
        content: string;
        contentHtml: null;
        imageUrl: null;
        options: string[] | null;
        correctAnswer: string | null;
        points: number;
        explanation: string | null;
      } => Boolean(question)
    );
}

function pickBalancedBankQuestions(
  candidateRows: Array<{
    id: string;
    subject_id: string | null;
    subtopic: string | null;
    type: QuestionType;
    content: string;
    content_html: string | null;
    image_url: string | null;
    options: string[] | null;
    correct_answer: string | null;
    points: number | null;
    explanation: string | null;
  }>,
  selectedTopics: StudentLearningTopicSummary[],
  targetCount: number
) {
  const byTopic = new Map<string, Array<typeof candidateRows[number]>>();
  for (const topic of selectedTopics) {
    byTopic.set(topic.topic_key, []);
  }

  for (const candidate of candidateRows) {
    const topicKey = normalizeTopicKey(candidate.subtopic);
    const bucket = byTopic.get(topicKey);
    if (!bucket) continue;
    bucket.push(candidate);
  }

  const selected: Array<{
    sourceType: "bank";
    sourceQuestionBankId: string;
    topicKey: string;
    subtopic: string;
    type: QuestionType;
    content: string;
    contentHtml: string | null;
    imageUrl: string | null;
    options: string[] | null;
    correctAnswer: string | null;
    points: number;
    explanation: string | null;
  }> = [];
  const usedIds = new Set<string>();
  let madeProgress = true;

  while (selected.length < targetCount && madeProgress) {
    madeProgress = false;

    for (const topic of selectedTopics) {
      const bucket = byTopic.get(topic.topic_key) ?? [];
      const next = bucket.find((candidate) => !usedIds.has(candidate.id));
      if (!next) continue;

      selected.push({
        sourceType: "bank",
        sourceQuestionBankId: next.id,
        topicKey: topic.topic_key,
        subtopic: next.subtopic ?? topic.topic_label,
        type: next.type,
        content: next.content,
        contentHtml: next.content_html,
        imageUrl: next.image_url,
        options: next.options,
        correctAnswer: next.correct_answer,
        points: Number(next.points ?? 1),
        explanation: next.explanation,
      });
      usedIds.add(next.id);
      madeProgress = true;

      if (selected.length >= targetCount) break;
    }
  }

  return selected;
}

async function loadBankCandidates(
  admin: SupabaseAdminClient,
  {
    subjectId,
    gradeLevel,
    selectedTopics,
  }: {
    subjectId: string;
    gradeLevel: number | null;
    selectedTopics: StudentLearningTopicSummary[];
  }
) {
  const normalizedTopicSet = new Set(selectedTopics.map((topic) => topic.topic_key));
  const practiceTypes: QuestionType[] = [
    "multiple_choice",
    "multiple_response",
    "fill_blank",
    "matching",
  ];

  const [sampleExamRes, bankRes] = await Promise.all([
    admin
      .from("sample_exams")
      .select(
        "id, title, grade_level, subtopic, sample_exam_items(order_index, question_bank:question_bank_id(id, subject_id, subtopic, type, content, content_html, image_url, options, correct_answer, points, explanation, visibility, grade_level))"
      )
      .eq("subject_id", subjectId)
      .limit(20),
    admin
      .from("question_bank")
      .select(
        "id, subject_id, subtopic, type, content, content_html, image_url, options, correct_answer, points, explanation, visibility, grade_level"
      )
      .eq("subject_id", subjectId)
      .eq("visibility", "admin_curated")
      .limit(200),
  ]);

  if (sampleExamRes.error) {
    throw new Error(sampleExamRes.error.message);
  }
  if (bankRes.error) {
    throw new Error(bankRes.error.message);
  }

  const sampleCandidates: PracticeQuestionSourceRow[] = [];
  for (const sampleExam of sampleExamRes.data ?? []) {
    const sampleGrade = Number(sampleExam.grade_level ?? 0);
    if (gradeLevel && sampleGrade && sampleGrade !== gradeLevel) continue;

    for (const item of sampleExam.sample_exam_items ?? []) {
      const question = getRelationObject(item.question_bank as PracticeQuestionSourceRow | PracticeQuestionSourceRow[] | null);
      if (!question) continue;
      if (!practiceTypes.includes(question.type)) continue;
      const topicKey = normalizeTopicKey(question.subtopic);
      if (!normalizedTopicSet.has(topicKey)) continue;
      sampleCandidates.push(question);
    }
  }

  const directBankCandidates = ((bankRes.data ?? []) as PracticeQuestionSourceRow[])
    .filter((question) => {
      if (!practiceTypes.includes(question.type)) return false;
      if (gradeLevel && question.grade_level && Number(question.grade_level) !== gradeLevel) {
        return false;
      }
      return normalizedTopicSet.has(normalizeTopicKey(question.subtopic));
    });

  const merged = new Map<string, PracticeQuestionSourceRow>();
  for (const candidate of [...sampleCandidates, ...directBankCandidates]) {
    if (!candidate.id || merged.has(candidate.id)) continue;
    merged.set(candidate.id, candidate);
  }

  return Array.from(merged.values());
}

export async function createStudentPracticeExam(input: {
  subjectId: string;
  topicKeys: string[];
}): Promise<PracticeExamCreationResult> {
  const context = await getAuthenticatedStudentContext();
  if ("error" in context) {
    return { error: context.error ?? "Сурагчийн эрх шалгахад алдаа гарлаа." };
  }

  const overview = await getLearningOverviewForStudent(context.userId);
  const subjectLearning = getSubjectLearningFromOverview(overview, input.subjectId);
  if (!subjectLearning) {
    return { error: "Learning data ачаалахад алдаа гарлаа." };
  }

  const admin = createAdminClient();
  const selectedTopics =
    input.topicKeys.length > 0
      ? subjectLearning.topics.filter((topic) => input.topicKeys.includes(topic.topic_key))
      : subjectLearning.topics.slice(0, 3);

  if (selectedTopics.length === 0) {
    return {
      error:
        "Энэ хичээл дээр topic-level practice үүсгэхэд хангалттай өгөгдөл алга. Дараа дахин оролдоно уу.",
    };
  }

  const [subjectMap, gradeLevel] = await Promise.all([
    getSubjectsByIds(admin, [input.subjectId]),
    getStudentGradeLevel(admin, context.userId),
  ]);

  const subjectName = subjectMap.get(input.subjectId)?.name ?? subjectLearning.subject.subject_name;
  const bankCandidates = await loadBankCandidates(admin, {
    subjectId: input.subjectId,
    gradeLevel,
    selectedTopics,
  });

  const selectedBankQuestions = pickBalancedBankQuestions(
    bankCandidates,
    selectedTopics,
    DEFAULT_PRACTICE_QUESTION_COUNT
  );

  let aiQuestions: Array<{
    sourceType: "ai";
    sourceQuestionBankId: null;
    topicKey: string;
    subtopic: string;
    type: QuestionType;
    content: string;
    contentHtml: null;
    imageUrl: null;
    options: string[] | null;
    correctAnswer: string | null;
    points: number;
    explanation: string | null;
  }> = [];

  if (selectedBankQuestions.length < DEFAULT_PRACTICE_QUESTION_COUNT) {
    aiQuestions = await generatePracticeQuestionsWithAI({
      subjectName,
      gradeLevel,
      topics: selectedTopics,
      questionCount: DEFAULT_PRACTICE_QUESTION_COUNT - selectedBankQuestions.length,
    });
  }

  const finalQuestions = [...selectedBankQuestions, ...aiQuestions].slice(
    0,
    DEFAULT_PRACTICE_QUESTION_COUNT
  );

  if (finalQuestions.length === 0) {
    return { error: "Practice асуулт үүсгэж чадсангүй. Дараа дахин оролдоно уу." };
  }

  const questionRows = finalQuestions.map((question, index) => ({
    subject_id: input.subjectId,
    source_type: question.sourceType,
    source_question_bank_id: question.sourceQuestionBankId,
    topic_key: question.topicKey,
    subtopic: question.subtopic,
    type: question.type,
    content: question.content,
    content_html: question.contentHtml,
    image_url: question.imageUrl,
    options: question.options,
    correct_answer: question.correctAnswer,
    points: question.points,
    order_index: index,
    explanation: question.explanation,
  }));

  const { data: practiceExamId, error: practiceExamError } = await admin.rpc(
    "create_student_practice_exam_bundle",
    {
      p_student_id: context.userId,
      p_subject_id: input.subjectId,
      p_title: `${subjectName} - Хувийн дасгал`,
      p_description: "AI болон curated bank дээр суурилсан хувийн practice дасгал.",
      p_selected_topics: selectedTopics.map((topic) => ({
        topic_key: topic.topic_key,
        topic_label: topic.topic_label,
      })),
      p_generated_metadata: {
        bank_question_count: selectedBankQuestions.length,
        ai_question_count: Math.max(finalQuestions.length - selectedBankQuestions.length, 0),
        grade_level: gradeLevel,
      },
      p_questions: questionRows,
    }
  );

  if (practiceExamError || !practiceExamId) {
    return { error: practiceExamError?.message ?? "Practice exam үүсгэхэд алдаа гарлаа." };
  }

  revalidatePath("/student");
  revalidatePath("/student/learning");

  return {
    success: true,
    redirectTo: `/student/learning/practice/${String(practiceExamId)}`,
  };
}

async function getStudentPracticeExamBase(
  admin: SupabaseAdminClient,
  studentId: string,
  practiceExamId: string
) {
  const { data: exam, error: examError } = await admin
    .from("student_practice_exams")
    .select("id, student_id, subject_id, title, description, selected_topics, question_count, created_at, subjects(name)")
    .eq("id", practiceExamId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (examError || !exam) {
    return null;
  }

  const { data: attempt, error: attemptError } = await admin
    .from("student_practice_attempts")
    .select(
      "id, practice_exam_id, student_id, status, started_at, submitted_at, total_score, max_score, attempt_number"
    )
    .eq("practice_exam_id", practiceExamId)
    .eq("student_id", studentId)
    .order("started_at", { ascending: false })
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (attemptError) {
    throw new Error(attemptError.message);
  }

  const subject = getRelationObject(exam.subjects as { name: string } | { name: string }[] | null);

  return {
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      subject_id: exam.subject_id,
      subject_name: subject?.name ?? "Хичээл",
      selected_topics: Array.isArray(exam.selected_topics) ? exam.selected_topics : [],
      question_count: Number(exam.question_count ?? 0),
      created_at: exam.created_at,
    },
    attempt: attempt as StudentPracticeAttempt | null,
  };
}

async function getStudentPracticeQuestionsForTake(
  admin: SupabaseAdminClient,
  practiceExamId: string
) {
  const { data, error } = await admin
    .from("student_practice_questions")
    .select(
      "id, practice_exam_id, subject_id, topic_key, subtopic, type, content, content_html, image_url, options, points, order_index"
    )
    .eq("practice_exam_id", practiceExamId)
    .order("order_index", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as StudentPracticeQuestionForTake[];
}

async function getStudentPracticeQuestionsForGrading(
  admin: SupabaseAdminClient,
  practiceExamId: string
) {
  const { data, error } = await admin
    .from("student_practice_questions")
    .select(
      "id, practice_exam_id, subject_id, source_type, source_question_bank_id, topic_key, subtopic, type, content, content_html, image_url, options, correct_answer, points, order_index, explanation"
    )
    .eq("practice_exam_id", practiceExamId)
    .order("order_index", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as StudentPracticeQuestion[];
}

async function getStudentPracticeExamForGradingInternal(
  admin: SupabaseAdminClient,
  studentId: string,
  practiceExamId: string
) {
  const [base, questions] = await Promise.all([
    getStudentPracticeExamBase(admin, studentId, practiceExamId),
    getStudentPracticeQuestionsForGrading(admin, practiceExamId),
  ]);

  if (!base) return null;

  return {
    ...base,
    questions,
  };
}

export async function getStudentPracticeExamForTake(practiceExamId: string) {
  const context = await getAuthenticatedStudentContext();
  if ("error" in context) {
    return null;
  }

  const admin = createAdminClient();
  const [base, questions] = await Promise.all([
    getStudentPracticeExamBase(admin, context.userId, practiceExamId),
    getStudentPracticeQuestionsForTake(admin, practiceExamId),
  ]);

  if (!base) {
    return null;
  }

  return {
    ...base,
    questions,
  };
}

export async function getStudentPracticeResult(practiceExamId: string) {
  const context = await getAuthenticatedStudentContext();
  if ("error" in context) {
    return null;
  }

  const admin = createAdminClient();
  const practice = await getStudentPracticeExamForGradingInternal(
    admin,
    context.userId,
    practiceExamId
  );
  if (!practice?.attempt || practice.attempt.status !== "graded") {
    return null;
  }

  const { data: answers, error } = await admin
    .from("student_practice_answers")
    .select(
      "id, practice_attempt_id, practice_question_id, student_id, answer, is_correct, score, feedback, submitted_at"
    )
    .eq("practice_attempt_id", practice.attempt.id)
    .eq("student_id", context.userId);

  if (error) {
    throw new Error(error.message);
  }

  return {
    ...practice,
    answers: (answers ?? []) as StudentPracticeAnswer[],
  };
}

function gradePracticeQuestion(
  question: StudentPracticeQuestion,
  rawAnswer: string | null | undefined
) {
  if (question.type === "multiple_choice" || question.type === "fill_blank") {
    const isCorrect =
      normalizeTextAnswer(rawAnswer) === normalizeTextAnswer(question.correct_answer);
    return {
      is_correct: isCorrect,
      score: isCorrect ? Number(question.points ?? 0) : 0,
    };
  }

  if (question.type === "multiple_response") {
    const submitted = parseStringArray(rawAnswer)
      .map((item) => normalizeTextAnswer(item))
      .sort();
    const expected = parseStringArray(question.correct_answer)
      .map((item) => normalizeTextAnswer(item))
      .sort();
    const isCorrect =
      submitted.length > 0 && areArraysEqual(submitted, expected);
    return {
      is_correct: isCorrect,
      score: isCorrect ? Number(question.points ?? 0) : 0,
    };
  }

  if (question.type === "matching") {
    try {
      const parsed = JSON.parse(String(rawAnswer ?? "{}")) as Record<string, string>;
      const expectedPairs = parseMatchingPairs(question.options);
      const isCorrect =
        expectedPairs.length > 0 &&
        expectedPairs.every(
          (pair) => normalizeTextAnswer(parsed[pair.left]) === normalizeTextAnswer(pair.right)
        );
      return {
        is_correct: isCorrect,
        score: isCorrect ? Number(question.points ?? 0) : 0,
      };
    } catch {
      return { is_correct: false, score: 0 };
    }
  }

  return { is_correct: false, score: 0 };
}

export async function submitStudentPracticeExam(
  practiceExamId: string,
  answers: Record<string, string>
) {
  const context = await getAuthenticatedStudentContext();
  if ("error" in context) {
    return { error: context.error };
  }

  const admin = createAdminClient();
  const practice = await getStudentPracticeExamForGradingInternal(
    admin,
    context.userId,
    practiceExamId
  );
  if (!practice?.attempt) {
    return { error: "Practice attempt олдсонгүй." };
  }
  if (practice.questions.length === 0) {
    return { error: "Practice асуулт олдсонгүй." };
  }

  if (practice.attempt.status === "graded") {
    return { success: true, redirectTo: `/student/learning/practice/${practiceExamId}/result` };
  }

  let totalScore = 0;
  const answerRows = practice.questions.map((question) => {
    const answerValue = answers[question.id] ?? null;
    const graded = gradePracticeQuestion(question, answerValue);
    totalScore += graded.score;

    return {
      practice_attempt_id: practice.attempt!.id,
      practice_question_id: question.id,
      student_id: context.userId,
      answer: answerValue,
      is_correct: graded.is_correct,
      score: graded.score,
      feedback: question.explanation ?? null,
    };
  });

  const { error: answerError } = await admin
    .from("student_practice_answers")
    .upsert(answerRows, {
      onConflict: "practice_attempt_id,practice_question_id",
    });

  if (answerError) {
    return { error: answerError.message };
  }

  const maxScore = roundToTwo(
    practice.questions.reduce((sum, question) => sum + Number(question.points ?? 0), 0)
  );

  const { error: attemptError } = await admin
    .from("student_practice_attempts")
    .update({
      status: "graded",
      submitted_at: new Date().toISOString(),
      total_score: roundToTwo(totalScore),
      max_score: maxScore,
    })
    .eq("id", practice.attempt.id)
    .eq("student_id", context.userId);

  if (attemptError) {
    return { error: attemptError.message };
  }

  await enqueueStudentTopicMasteryRefresh(
    context.userId,
    practice.exam.subject_id
  ).catch(() => {});

  revalidatePath("/student");
  revalidatePath("/student/learning");
  revalidatePath(`/student/learning/practice/${practiceExamId}`);
  revalidatePath(`/student/learning/practice/${practiceExamId}/result`);

  return {
    success: true,
    redirectTo: `/student/learning/practice/${practiceExamId}/result`,
  };
}

export async function backfillHistoricalQuestionTopics(options?: {
  limit?: number;
  examId?: string;
}) {
  const adminUser = await assertAdminUser();
  if ("error" in adminUser) {
    return { error: adminUser.error };
  }

  const admin = createAdminClient();
  let query = admin
    .from("questions")
    .select("id, content, content_html, subject_id, exams(subject_id, subjects(name))")
    .is("subtopic", null)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(Number(options?.limit ?? 20), 50)));

  if (options?.examId) {
    query = query.eq("exam_id", options.examId);
  }

  const { data: rows, error } = await query;
  if (error) {
    return { error: error.message };
  }

  const model = getModel();
  let updated = 0;

  for (const row of rows ?? []) {
    const exam = getRelationObject(
      row.exams as
        | {
            subject_id: string | null;
            subjects?: { name: string } | { name: string }[] | null;
          }
        | {
            subject_id: string | null;
            subjects?: { name: string } | { name: string }[] | null;
          }[]
        | null
    );
    const subject = getRelationObject(
      exam?.subjects as { name: string } | { name: string }[] | null
    );
    const subjectName = subject?.name ?? "Хичээл";
    const prompt = `Чи шалгалтын асуултыг тухайн хичээлийн дэд сэдэвт ангилдаг AI юм.

Хичээл: ${subjectName}
Асуулт:
${row.content_html || row.content}

JSON форматаар л хариул:
{
  "subtopic": "товч дэд сэдэв",
  "confidence": 0.0
}`;

    try {
      const result = await model.generateContent(prompt);
      const parsed = extractJsonObject(result.response.text().trim()) as {
        subtopic?: unknown;
        confidence?: unknown;
      };
      const subtopic = String(parsed.subtopic ?? "").trim();
      const confidence = Math.max(0, Math.min(Number(parsed.confidence ?? 0), 1));

      if (!subtopic) continue;

      const { error: updateError } = await admin
        .from("questions")
        .update({
          subject_id: row.subject_id ?? exam?.subject_id ?? null,
          subtopic,
          topic_label_source: "ai_inferred",
          topic_label_confidence: confidence,
        })
        .eq("id", row.id);

      if (!updateError) {
        updated += 1;
      }
    } catch {
      continue;
    }
  }

  return { success: true, updated };
}
