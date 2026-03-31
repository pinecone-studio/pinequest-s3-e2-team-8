import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..", "..");

function applyEnvFile(fileName) {
  const filePath = resolve(APP_ROOT, fileName);
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

applyEnvFile(".env.local");
applyEnvFile(".env");

export const STRESS_USER_COUNT = 500;
export const STRESS_EMAIL_PREFIX = "stressstudent";
export const STRESS_PASSWORD =
  process.env.STRESS_STUDENT_PASSWORD || "PineExam123!";
export const STRESS_SUBJECT_ID = "71000000-0000-0000-0000-000000000001";
export const STRESS_GROUP_ID = "72000000-0000-0000-0000-000000000001";
export const STRESS_EXAM_ID = "73000000-0000-0000-0000-000000000001";
export const STRESS_OWNER_FALLBACK_ID =
  "10000000-0000-0000-0000-000000000001";
export const STRESS_SUBJECT_NAME = "Stress Test Subject";
export const STRESS_GROUP_NAME = "Stress Test Cohort";
export const STRESS_EXAM_TITLE = "STRESS: Problem 5 Full Flow";
export const STRESS_EXAM_DESCRIPTION =
  "Synthetic full-flow stress exam for Problem 5 local benchmarking.";

export function getStressEmail(index) {
  return `${STRESS_EMAIL_PREFIX}${String(index).padStart(3, "0")}@pineexam.test`;
}

export function getStressFullName(index) {
  return `Stress Student ${String(index).padStart(3, "0")}`;
}

export function getStressQuestionCacheKey() {
  return `exam:${STRESS_EXAM_ID}:questions`;
}

export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin client is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createSupabasePublicClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase public client is not configured.");
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createStressRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    throw new Error("Upstash Redis is not configured.");
  }

  return new Redis({ url, token });
}

export function chunk(array, size) {
  const chunks = [];
  for (let index = 0; index < array.length; index += size) {
    chunks.push(array.slice(index, index + size));
  }
  return chunks;
}

export function buildStressQuestions(subjectId, ownerId) {
  return Array.from({ length: 10 }, (_, index) => {
    const number = index + 1;
    const questionId = `73100000-0000-0000-0000-${String(number).padStart(12, "0")}`;
    const correctAnswer = String((number + 1) * 2);
    const wrongA = String((number + 1) * 2 + 1);
    const wrongB = String((number + 1) * 2 - 1);
    const wrongC = String((number + 1) * 2 + 2);

    return {
      id: questionId,
      exam_id: STRESS_EXAM_ID,
      subject_id: subjectId,
      type: "multiple_choice",
      content: `Stress question ${number}: What is ${number + 1} + ${number + 1}?`,
      content_html: null,
      image_url: null,
      options: [correctAnswer, wrongA, wrongB, wrongC],
      correct_answer: correctAnswer,
      points: 1,
      order_index: number - 1,
      explanation: null,
      created_by: ownerId,
      subtopic: `Stress Topic ${Math.ceil(number / 2)}`,
      source_question_bank_id: null,
      topic_label_source: "manual",
      topic_label_confidence: 1,
      ai_variant_enabled: false,
      passage_id: null,
      created_at: new Date().toISOString(),
    };
  });
}

export function buildStressExamWindow() {
  const now = Date.now();
  return {
    startTime: new Date(now - 60 * 60 * 1000).toISOString(),
    endTime: new Date(now + 6 * 60 * 60 * 1000).toISOString(),
    durationMinutes: 90,
  };
}

export function buildPublishedSnapshot({
  ownerId,
  subjectId,
  questions,
  assignedStudentCount,
  startTime,
  endTime,
  durationMinutes,
  publishedAt,
}) {
  return {
    version: 1,
    created_at: publishedAt,
    exam: {
      id: STRESS_EXAM_ID,
      title: STRESS_EXAM_TITLE,
      description: STRESS_EXAM_DESCRIPTION,
      subject_id: subjectId,
      start_time: startTime,
      end_time: endTime,
      duration_minutes: durationMinutes,
      max_attempts: 1,
      shuffle_questions: false,
      shuffle_options: false,
      passing_score: 60,
      proctoring_mode: "off",
      device_policy: "any",
      require_fullscreen: false,
      require_camera: false,
      identity_verification: false,
      evidence_mode: "metadata_only",
      post_exam_similarity_enabled: false,
      published_at: publishedAt,
      created_by: ownerId,
    },
    questions: questions.map((question) => ({
      id: question.id,
      exam_id: question.exam_id,
      subject_id: question.subject_id,
      passage_id: null,
      type: question.type,
      content: question.content,
      content_html: question.content_html,
      image_url: question.image_url,
      options: question.options,
      correct_answer: question.correct_answer,
      points: question.points,
      order_index: question.order_index,
      explanation: question.explanation,
      ai_variant_enabled: false,
      created_at: question.created_at,
      subtopic: question.subtopic,
      source_question_bank_id: null,
      topic_label_source: question.topic_label_source,
      topic_label_confidence: question.topic_label_confidence,
    })),
    passages: [],
    assigned_groups: [
      {
        id: STRESS_GROUP_ID,
        name: STRESS_GROUP_NAME,
        grade: 12,
        group_type: "class",
        member_count: assignedStudentCount,
      },
    ],
    stats: {
      question_count: questions.length,
      passage_count: 0,
      total_points: questions.reduce(
        (sum, question) => sum + Number(question.points ?? 0),
        0
      ),
      assignment_count: 1,
      assigned_student_count: assignedStudentCount,
      has_essay_questions: false,
    },
  };
}

export function getCachePayloadFromSnapshot(snapshot) {
  return {
    examBase: snapshot.exam,
    questions: snapshot.questions.map((question) => {
      const safeQuestion = { ...question };
      delete safeQuestion.correct_answer;
      delete safeQuestion.explanation;
      return safeQuestion;
    }),
  };
}

export function getCacheTtlSeconds(endTime, durationMinutes) {
  const closeTimeMs = new Date(endTime).getTime();
  const durationMs = Number(durationMinutes ?? 0) * 60 * 1000;
  const latestUsefulTimeMs =
    Number.isNaN(closeTimeMs) || !Number.isFinite(durationMs) || durationMs <= 0
      ? closeTimeMs
      : closeTimeMs + durationMs;

  return Math.max(Math.floor((latestUsefulTimeMs - Date.now()) / 1000), 60);
}

export async function findStressProfiles(supabase) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .ilike("email", `${STRESS_EMAIL_PREFIX}%@pineexam.test`)
    .order("email", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
