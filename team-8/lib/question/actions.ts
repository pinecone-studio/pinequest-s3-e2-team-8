"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isQuestionVariantSchemaMissing } from "@/lib/question-variants";
import { getAllowedSubjectIds } from "@/lib/teacher/permissions";
import {
  buildQuestionImportDrafts,
  draftToQuestionFormShape,
  validateQuestionImportDraft,
} from "@/lib/question/import";
import { buildQuestionImportDraftsFromWord } from "@/lib/question/word-import";
import {
  attachPassagesToQuestions,
  getQuestionPassagesByExam as loadQuestionPassagesByExam,
} from "@/lib/question-passages";
import type {
  Difficulty,
  DifficultyLevel,
  QuestionBank,
  QuestionImportDraft,
  QuestionBankSummary,
  QuestionBankVisibility,
  SampleExam,
} from "@/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
type QuestionBankRow = Pick<
  QuestionBank,
  "id" | "created_by" | "subject_id" | "visibility"
>;

type QuestionBankAccessContext = {
  userId: string;
  isAdmin: boolean;
  allowedSubjectIds: string[];
  allowedSubjectSet: Set<string>;
};

const QUESTION_BANK_VISIBILITIES: QuestionBankVisibility[] = [
  "private",
  "shared_subject",
  "admin_curated",
  "archived",
];
const QUESTION_VARIANT_MIGRATION_ERROR =
  "AI хувилбар feature ашиглахын өмнө `024_ai_question_variants.sql` migration-аа apply хийж, schema cache-аа refresh хийнэ үү.";
const QUESTION_BANK_GOVERNANCE_ERROR =
  "Question bank governance feature ашиглахын өмнө хамгийн сүүлийн DB migration-аа apply хийнэ үү.";
const QUESTION_BANK_USAGE_TRACKING_WARNING =
  "Асуулт шалгалт руу амжилттай орлоо, гэхдээ ашиглалтын тоо шинэчлэгдсэнгүй. Usage tracking migration-аа apply хийгээд schema cache-аа refresh хийнэ үү.";

function isQuestionBankVisibility(
  value: string
): value is QuestionBankVisibility {
  return QUESTION_BANK_VISIBILITIES.includes(value as QuestionBankVisibility);
}

async function getQuestionBankAccessContext(
  supabase: SupabaseServerClient,
  userId: string
): Promise<QuestionBankAccessContext> {
  const allowedSubjectIds = await getAllowedSubjectIds(supabase, userId);

  return {
    userId,
    isAdmin: allowedSubjectIds === null,
    allowedSubjectIds: allowedSubjectIds ?? [],
    allowedSubjectSet: new Set(allowedSubjectIds ?? []),
  };
}

function buildQuestionBankScopeQuery(
  supabase: SupabaseServerClient,
  context: QuestionBankAccessContext
) {
  const baseQuery = supabase
    .from("question_bank")
    .select("*, subjects(name)")
    .order("updated_at", { ascending: false });

  if (context.isAdmin) {
    return baseQuery;
  }

  if (context.allowedSubjectIds.length === 0) {
    return baseQuery.eq("created_by", context.userId);
  }

  return baseQuery.or(
    [
      `created_by.eq.${context.userId}`,
      `and(visibility.eq.shared_subject,subject_id.in.(${context.allowedSubjectIds.join(",")}))`,
      `and(visibility.eq.admin_curated,subject_id.in.(${context.allowedSubjectIds.join(",")}))`,
    ].join(",")
  );
}

function canViewQuestionBankItem(
  question: QuestionBankRow,
  context: QuestionBankAccessContext
) {
  if (context.isAdmin || question.created_by === context.userId) {
    return true;
  }

  if (!question.subject_id) {
    return false;
  }

  return (
    (question.visibility === "shared_subject" ||
      question.visibility === "admin_curated") &&
    context.allowedSubjectSet.has(question.subject_id)
  );
}

function canManageQuestionBankItem(
  question: QuestionBankRow,
  context: QuestionBankAccessContext
) {
  if (question.visibility === "admin_curated") {
    return context.isAdmin;
  }

  return context.isAdmin || question.created_by === context.userId;
}

function buildQuestionBankSummary(
  questions: QuestionBank[],
  context: QuestionBankAccessContext
): QuestionBankSummary {
  const now = Date.now();

  return questions.reduce<QuestionBankSummary>(
    (summary, question) => {
      summary.total += 1;
      summary.total_usage_count += Number(question.usage_count ?? 0);

      if (canManageQuestionBankItem(question, context)) {
        summary.manageable += 1;
      }

      if (
        question.last_used_at &&
        now - new Date(question.last_used_at).getTime() <=
          1000 * 60 * 60 * 24 * 30
      ) {
        summary.recently_used_count += 1;
      }

      if (question.visibility === "private") summary.private_count += 1;
      if (question.visibility === "shared_subject") {
        summary.shared_subject_count += 1;
      }
      if (question.visibility === "admin_curated") {
        summary.admin_curated_count += 1;
      }
      if (question.visibility === "archived") summary.archived_count += 1;

      return summary;
    },
    {
      total: 0,
      manageable: 0,
      private_count: 0,
      shared_subject_count: 0,
      admin_curated_count: 0,
      archived_count: 0,
      total_usage_count: 0,
      recently_used_count: 0,
    }
  );
}

function normalizeQuestionBankRecord(
  question: Partial<QuestionBank>
): QuestionBank {
  const fallbackDifficultyLevel =
    question.difficulty === "easy" ? 1 : question.difficulty === "hard" ? 3 : 2;
  const parsedDifficultyLevel = Number(question.difficulty_level ?? fallbackDifficultyLevel);

  return {
    ...question,
    visibility:
      isQuestionBankVisibility(String(question.visibility ?? ""))
        ? (question.visibility as QuestionBankVisibility)
        : "private",
    difficulty_level:
      parsedDifficultyLevel === 1 || parsedDifficultyLevel === 2 || parsedDifficultyLevel === 3
        ? (parsedDifficultyLevel as DifficultyLevel)
        : 2,
    grade_level:
      typeof question.grade_level === "number"
        ? question.grade_level
        : question.grade_level
          ? Number(question.grade_level)
          : null,
    subtopic: question.subtopic ? String(question.subtopic) : null,
    last_used_at: question.last_used_at ?? null,
  } as QuestionBank;
}

function normalizeSampleExamRecord(sampleExam: Partial<SampleExam>): SampleExam {
  return {
    ...sampleExam,
    grade_level:
      typeof sampleExam.grade_level === "number"
        ? sampleExam.grade_level
        : Number(sampleExam.grade_level ?? 0),
    difficulty_level:
      Number(sampleExam.difficulty_level) === 1 ||
      Number(sampleExam.difficulty_level) === 2 ||
      Number(sampleExam.difficulty_level) === 3
        ? (Number(sampleExam.difficulty_level) as DifficultyLevel)
        : 2,
    duration_minutes:
      typeof sampleExam.duration_minutes === "number"
        ? sampleExam.duration_minutes
        : Number(sampleExam.duration_minutes ?? 0),
    question_count:
      typeof sampleExam.question_count === "number"
        ? sampleExam.question_count
        : Number(sampleExam.question_count ?? 0),
    total_points:
      typeof sampleExam.total_points === "number"
        ? sampleExam.total_points
        : Number(sampleExam.total_points ?? 0),
    subtopic: sampleExam.subtopic ? String(sampleExam.subtopic) : null,
    sample_exam_items: (sampleExam.sample_exam_items ?? []).map((item) => ({
      ...item,
      question_bank: item?.question_bank
        ? normalizeQuestionBankRecord(item.question_bank)
        : null,
    })),
  } as SampleExam;
}

function getQuestionTypeMigrationHint(error: { code?: string; message?: string } | null) {
  if (!error) return null;
  if (error.code !== "23514") return null;

  return (
    "Асуултын төрөл хадгалахад DB constraint алдаа гарлаа. " +
    "Та хамгийн сүүлийн migration-уудаа (ялангуяа `013_expand_question_types.sql`) apply хийсэн эсэхээ шалгаарай."
  );
}

function parseStringArray(rawValue: string) {
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item).trim()).filter(Boolean)
      : [];
  } catch {
    return null;
  }
}

function parseMatchingPairs(rawValue: string) {
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return null;

    return parsed
      .map((item) => {
        const left = String(item?.left ?? "").trim();
        const right = String(item?.right ?? "").trim();

        if (!left || !right) return null;
        return `${left}|||${right}`;
      })
      .filter((item): item is string => Boolean(item));
  } catch {
    return null;
  }
}

function buildManualQuestionTopicPayload(subjectId: string | null) {
  return {
    subject_id: subjectId,
    topic_label_source: "manual",
  };
}

function buildBankQuestionTopicPayload(
  examSubjectId: string | null,
  question: {
    id: string;
    subject_id: string | null;
    subtopic?: string | null;
  }
) {
  return {
    subject_id: question.subject_id ?? examSubjectId,
    subtopic: question.subtopic ? String(question.subtopic).trim() : null,
    source_question_bank_id: question.id,
    topic_label_source: "bank_import",
    topic_label_confidence: 1,
  };
}

function buildSampleQuestionTopicPayload(
  examSubjectId: string | null,
  question: {
    id: string;
    subject_id: string | null;
    subtopic?: string | null;
  }
) {
  return {
    subject_id: question.subject_id ?? examSubjectId,
    subtopic: question.subtopic ? String(question.subtopic).trim() : null,
    source_question_bank_id: question.id,
    topic_label_source: "sample_import",
    topic_label_confidence: 1,
  };
}

function buildQuestionPayload(
  type: string,
  rawOptions: string,
  rawCorrectAnswer: string | null
) {
  const normalizedCorrectAnswer = rawCorrectAnswer?.trim() || null;
  let options: string[] | null = null;
  let correctAnswer: string | null = normalizedCorrectAnswer;

  if (type === "multiple_choice") {
    const validOptions = parseStringArray(rawOptions);
    if (!validOptions) {
      return { error: "Сонголтуудын өгөгдөл буруу байна." };
    }

    if (validOptions.length < 2) {
      return { error: "Дор хаяж 2 сонголт хэрэгтэй." };
    }

    if (!correctAnswer || !validOptions.includes(correctAnswer)) {
      return { error: "Зөв хариулт нь сонголтуудын нэг байх ёстой." };
    }

    options = validOptions;
  } else if (type === "multiple_response") {
    const validOptions = parseStringArray(rawOptions);
    const correctAnswers = parseStringArray(rawCorrectAnswer ?? "[]");

    if (!validOptions || !correctAnswers) {
      return { error: "Сонголтуудын өгөгдөл буруу байна." };
    }

    if (validOptions.length < 2) {
      return { error: "Дор хаяж 2 сонголт хэрэгтэй." };
    }

    if (correctAnswers.length < 1) {
      return { error: "Дор хаяж 1 зөв хариулт сонгоно уу." };
    }

    if (correctAnswers.some((answer) => !validOptions.includes(answer))) {
      return { error: "Зөв хариултууд нь сонголтуудын дотор байх ёстой." };
    }

    options = validOptions;
    correctAnswer = JSON.stringify(correctAnswers);
  } else if (type === "fill_blank") {
    if (!correctAnswer) {
      return { error: "Нөхөх асуултын зөв хариултыг оруулна уу." };
    }
  } else if (type === "matching") {
    const pairs = parseMatchingPairs(rawOptions);
    if (!pairs || pairs.length < 2) {
      return { error: "Холбох асуултад дор хаяж 2 мөр хэрэгтэй." };
    }

    options = pairs;
    correctAnswer = JSON.stringify(
      pairs.map((pair) => {
        const [left, right] = pair.split("|||");
        return { left, right };
      })
    );
  } else if (type === "essay") {
    correctAnswer = null;
  } else {
    return { error: "Дэмжигдээгүй асуултын төрөл байна." };
  }

  return { options, correctAnswer };
}

async function getOwnedExam(
  examId: string,
  userId: string
) {
  const supabase = await createClient();
  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, subject_id, is_published")
    .eq("id", examId)
    .eq("created_by", userId)
    .maybeSingle();

  return { supabase, exam };
}

async function resolvePassageId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  examId: string,
  userId: string,
  rawPassageId: FormDataEntryValue | null
) {
  const passageId = String(rawPassageId ?? "").trim();
  if (!passageId) return { passageId: null };

  const { data: passage, error } = await supabase
    .from("question_passages")
    .select("id")
    .eq("id", passageId)
    .eq("exam_id", examId)
    .eq("created_by", userId)
    .maybeSingle();

  if (error?.code === "42P01") {
    return {
      error:
        "Passage block feature ашиглахын өмнө хамгийн сүүлийн DB migration-аа apply хийнэ үү.",
    };
  }

  if (!passage) {
    return { error: "Холбох passage block олдсонгүй." };
  }

  return { passageId: passage.id };
}

export async function addQuestion(examId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { exam } = await getOwnedExam(examId, user.id);
  if (!exam) return { error: "Шалгалт олдсонгүй" };
  if (exam.is_published) {
    return { error: "Нийтлэгдсэн шалгалтын асуултыг өөрчлөх боломжгүй" };
  }

  const type = formData.get("type") as string;
  const content = formData.get("content") as string;
  const content_html =
    (formData.get("content_html") as string)?.trim() || null;
  const points = parseFloat(formData.get("points") as string) || 1;
  const correct_answer = (formData.get("correct_answer") as string) || null;
  const explanation = (formData.get("explanation") as string) || null;
  const image_url = (formData.get("image_url") as string)?.trim() || null;
  const ai_variant_enabled = formData.get("ai_variant_enabled") === "on";

  const passageResolution = await resolvePassageId(
    supabase,
    examId,
    user.id,
    formData.get("passage_id")
  );
  if ("error" in passageResolution) {
    return { error: passageResolution.error };
  }

  const questionPayload = buildQuestionPayload(
    type,
    String(formData.get("options") || "[]"),
    correct_answer
  );
  if ("error" in questionPayload) {
    return { error: questionPayload.error };
  }

  const { data: existing } = await supabase
    .from("questions")
    .select("order_index")
    .eq("exam_id", examId)
    .order("order_index", { ascending: false })
    .limit(1);

  const order_index =
    existing && existing.length > 0 ? existing[0].order_index + 1 : 0;

  const insertPayload: Record<string, unknown> = {
    exam_id: examId,
    type,
    content,
    content_html,
    image_url,
    options: questionPayload.options,
    correct_answer: questionPayload.correctAnswer,
    points,
    order_index,
    explanation,
    created_by: user.id,
    ...buildManualQuestionTopicPayload(exam.subject_id ?? null),
  };

  if (ai_variant_enabled) {
    insertPayload.ai_variant_enabled = true;
  }

  if (passageResolution.passageId) {
    insertPayload.passage_id = passageResolution.passageId;
  }

  const { error } = await supabase.from("questions").insert(insertPayload);

  if (error) {
    if (isQuestionVariantSchemaMissing(error.code, error.message)) {
      return { error: QUESTION_VARIANT_MIGRATION_ERROR };
    }
    return { error: getQuestionTypeMigrationHint(error) ?? error.message };
  }

  revalidatePath(`/educator/exams/${examId}/questions`);
  return { success: true };
}

export async function addQuestionPassage(examId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { exam } = await getOwnedExam(examId, user.id);
  if (!exam) return { error: "Шалгалт олдсонгүй" };
  if (exam.is_published) {
    return { error: "Нийтлэгдсэн шалгалтад passage block нэмэх боломжгүй" };
  }

  const title = (formData.get("title") as string)?.trim() || null;
  const content = (formData.get("content") as string)?.trim() || "";
  const content_html =
    (formData.get("content_html") as string)?.trim() || null;
  const image_url = (formData.get("image_url") as string)?.trim() || null;

  if (!content && !content_html && !image_url) {
    return {
      error: "Эх материалын текст, HTML эсвэл зургийн аль нэгийг оруулна уу.",
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("question_passages")
    .select("order_index")
    .eq("exam_id", examId)
    .order("order_index", { ascending: false })
    .limit(1);

  if (existingError?.code === "42P01") {
    return {
      error:
        "Passage block feature ашиглахын өмнө хамгийн сүүлийн DB migration-аа apply хийнэ үү.",
    };
  }

  const order_index =
    existing && existing.length > 0 ? existing[0].order_index + 1 : 0;

  const { error } = await supabase.from("question_passages").insert({
    exam_id: examId,
    title,
    content: content || title || "Материал",
    content_html,
    image_url,
    order_index,
    created_by: user.id,
  });

  if (error) return { error: error.message };

  revalidatePath(`/educator/exams/${examId}/questions`);
  return { success: true };
}

export async function deleteQuestionPassage(examId: string, passageId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { exam } = await getOwnedExam(examId, user.id);
  if (!exam) return { error: "Шалгалт олдсонгүй" };
  if (exam.is_published) {
    return { error: "Нийтлэгдсэн шалгалтын passage block-ийг устгах боломжгүй" };
  }

  const { count, error: countError } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId)
    .eq("passage_id", passageId);

  if (countError?.code === "42703") {
    return {
      error:
        "Passage block feature ашиглахын өмнө хамгийн сүүлийн DB migration-аа apply хийнэ үү.",
    };
  }

  if ((count ?? 0) > 0) {
    return {
      error:
        "Энэ passage block-д асуулт холбогдсон байна. Эхлээд асуултуудаа салгана уу.",
    };
  }

  const { error } = await supabase
    .from("question_passages")
    .delete()
    .eq("id", passageId)
    .eq("exam_id", examId)
    .eq("created_by", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/educator/exams/${examId}/questions`);
  return { success: true };
}

export async function updateQuestionPassage(
  examId: string,
  passageId: string,
  formData: FormData
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { exam } = await getOwnedExam(examId, user.id);
  if (!exam) return { error: "Шалгалт олдсонгүй" };
  if (exam.is_published) {
    return { error: "Нийтлэгдсэн шалгалтын passage block-ийг өөрчлөх боломжгүй" };
  }

  const { data: existing } = await supabase
    .from("question_passages")
    .select("id")
    .eq("id", passageId)
    .eq("exam_id", examId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (!existing) return { error: "Passage block олдсонгүй" };

  const title = String(formData.get("title") || "").trim() || null;
  const content = String(formData.get("content") || "").trim();
  const content_html =
    String(formData.get("content_html") || "").trim() || null;
  const image_url = String(formData.get("image_url") || "").trim() || null;

  if (!content && !content_html && !image_url) {
    return {
      error: "Эх материалын текст, HTML эсвэл зургийн аль нэгийг оруулна уу.",
    };
  }

  const { error } = await supabase
    .from("question_passages")
    .update({
      title,
      content: content || title || "Материал",
      content_html,
      image_url,
    })
    .eq("id", passageId)
    .eq("exam_id", examId)
    .eq("created_by", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/educator/exams/${examId}/questions`);
  return { success: true };
}

export async function deleteQuestion(questionId: string, examId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { exam } = await getOwnedExam(examId, user.id);
  if (!exam) return { error: "Шалгалт олдсонгүй" };
  if (exam.is_published) {
    return { error: "Нийтлэгдсэн шалгалтын асуултыг устгах боломжгүй" };
  }

  const { error } = await supabase
    .from("questions")
    .delete()
    .eq("id", questionId)
    .eq("created_by", user.id);

  if (error) return { error: error.message };

  revalidatePath(`/educator/exams/${examId}/questions`);
  return { success: true };
}

export async function updateQuestion(
  questionId: string,
  examId: string,
  formData: FormData
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { exam } = await getOwnedExam(examId, user.id);
  if (!exam) return { error: "Шалгалт олдсонгүй" };
  if (exam.is_published) {
    return { error: "Нийтлэгдсэн шалгалтын асуултыг өөрчлөх боломжгүй" };
  }

  const { data: existingQuestion } = await supabase
    .from("questions")
    .select("id")
    .eq("id", questionId)
    .eq("exam_id", examId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (!existingQuestion) return { error: "Асуулт олдсонгүй" };

  const type = formData.get("type") as string;
  const content = String(formData.get("content") || "").trim();
  const content_html =
    String(formData.get("content_html") || "").trim() || null;
  const points = parseFloat(String(formData.get("points") || "1")) || 1;
  const correct_answer =
    String(formData.get("correct_answer") || "").trim() || null;
  const explanation = String(formData.get("explanation") || "").trim() || null;
  const image_url = String(formData.get("image_url") || "").trim() || null;
  const ai_variant_enabled = formData.get("ai_variant_enabled") === "on";

  if (!content && !content_html) {
    return { error: "Асуултын агуулгыг оруулна уу." };
  }

  const passageResolution = await resolvePassageId(
    supabase,
    examId,
    user.id,
    formData.get("passage_id")
  );
  if ("error" in passageResolution) {
    return { error: passageResolution.error };
  }

  const questionPayload = buildQuestionPayload(
    type,
    String(formData.get("options") || "[]"),
    correct_answer
  );
  if ("error" in questionPayload) {
    return { error: questionPayload.error };
  }

  const updatePayload: Record<string, unknown> = {
    passage_id: passageResolution.passageId,
    type,
    content,
    content_html,
    image_url,
    options: questionPayload.options,
    correct_answer: questionPayload.correctAnswer,
    points,
    explanation,
    ai_variant_enabled,
    subject_id: exam.subject_id ?? null,
  };

  let { error } = await supabase
    .from("questions")
    .update(updatePayload)
    .eq("id", questionId)
    .eq("exam_id", examId)
    .eq("created_by", user.id);

  if (error && isQuestionVariantSchemaMissing(error.code, error.message)) {
    if (ai_variant_enabled) {
      return { error: QUESTION_VARIANT_MIGRATION_ERROR };
    }

    const fallbackPayload = { ...updatePayload };
    delete fallbackPayload.ai_variant_enabled;
    const fallbackResult = await supabase
      .from("questions")
      .update(fallbackPayload)
      .eq("id", questionId)
      .eq("exam_id", examId)
      .eq("created_by", user.id);
    error = fallbackResult.error ?? null;
  }

  if (error) {
    return { error: getQuestionTypeMigrationHint(error) ?? error.message };
  }

  revalidatePath(`/educator/exams/${examId}/questions`);
  return { success: true };
}

export async function getQuestionsByExam(examId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { exam } = await getOwnedExam(examId, user.id);
  if (!exam) return [];

  const { data } = await supabase
    .from("questions")
    .select("*")
    .eq("exam_id", examId)
    .order("order_index", { ascending: true });

  return attachPassagesToQuestions(supabase, data ?? []);
}

export async function getQuestionPassagesByExam(examId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { exam } = await getOwnedExam(examId, user.id);
  if (!exam) return [];

  return loadQuestionPassagesByExam(supabase, examId);
}

export async function getQuestionBankCatalogData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      certifiedQuestions: [] as QuestionBank[],
      sampleExams: [] as SampleExam[],
    };
  }

  const context = await getQuestionBankAccessContext(supabase, user.id);

  if (!context.isAdmin && context.allowedSubjectIds.length === 0) {
    return {
      certifiedQuestions: [] as QuestionBank[],
      sampleExams: [] as SampleExam[],
    };
  }

  const certifiedQuery = context.isAdmin
    ? supabase
        .from("question_bank")
        .select("*, subjects(name)")
        .eq("visibility", "admin_curated")
        .order("updated_at", { ascending: false })
    : supabase
        .from("question_bank")
        .select("*, subjects(name)")
        .eq("visibility", "admin_curated")
        .in("subject_id", context.allowedSubjectIds)
        .order("updated_at", { ascending: false });

  const sampleExamQuery = context.isAdmin
    ? supabase
        .from("sample_exams")
        .select(
          "*, subjects(name), sample_exam_items(id, sample_exam_id, question_bank_id, order_index, created_at, question_bank:question_bank_id(*, subjects(name)))"
        )
        .order("updated_at", { ascending: false })
    : supabase
        .from("sample_exams")
        .select(
          "*, subjects(name), sample_exam_items(id, sample_exam_id, question_bank_id, order_index, created_at, question_bank:question_bank_id(*, subjects(name)))"
        )
        .in("subject_id", context.allowedSubjectIds)
        .order("updated_at", { ascending: false });

  const [{ data: certifiedRows }, sampleExamResult] = await Promise.all([
    certifiedQuery,
    sampleExamQuery,
  ]);

  return {
    certifiedQuestions: (certifiedRows as Partial<QuestionBank>[]).map(
      normalizeQuestionBankRecord
    ),
    sampleExams:
      sampleExamResult.error?.code === "42P01"
        ? []
        : ((sampleExamResult.data as Partial<SampleExam>[] | null) ?? []).map(
            normalizeSampleExamRecord
          ),
  };
}

export async function getQuestionBankDashboardData() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      questions: [] as QuestionBank[],
      summary: {
        total: 0,
        manageable: 0,
        private_count: 0,
        shared_subject_count: 0,
        admin_curated_count: 0,
        archived_count: 0,
        total_usage_count: 0,
        recently_used_count: 0,
      } satisfies QuestionBankSummary,
      viewerId: null,
      isAdmin: false,
    };
  }

  const context = await getQuestionBankAccessContext(supabase, user.id);
  const { data, error } = await buildQuestionBankScopeQuery(supabase, context);
  const fallbackQuery = context.isAdmin
    ? supabase
        .from("question_bank")
        .select("*, subjects(name)")
        .order("updated_at", { ascending: false })
    : supabase
        .from("question_bank")
        .select("*, subjects(name)")
        .eq("created_by", user.id)
        .order("updated_at", { ascending: false });
  const scopedRows =
    error?.code === "42703"
      ? (await fallbackQuery).data ?? []
      : data ?? [];
  const questions = (scopedRows as Partial<QuestionBank>[]).map(
    normalizeQuestionBankRecord
  );

  return {
    questions,
    summary: buildQuestionBankSummary(questions, context),
    viewerId: user.id,
    isAdmin: context.isAdmin,
  };
}

export async function getQuestionBank() {
  const data = await getQuestionBankDashboardData();
  return data.questions;
}

export async function importQuestionsFromBank(
  examId: string,
  bankQuestionIds: string[]
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { exam } = await getOwnedExam(examId, user.id);
  if (!exam) return { error: "Шалгалт олдсонгүй" };
  if (exam.is_published) {
    return { error: "Нийтлэгдсэн шалгалтад сангаас асуулт нэмэх боломжгүй" };
  }

  const uniqueQuestionIds = Array.from(
    new Set(bankQuestionIds.map((item) => item.trim()).filter(Boolean))
  );

  if (uniqueQuestionIds.length === 0) {
    return { error: "Оруулах асуултаа сонгоно уу." };
  }

  const context = await getQuestionBankAccessContext(supabase, user.id);
  const { data: bankQuestionRows, error: bankQuestionError } = await supabase
    .from("question_bank")
    .select(
      "id, subject_id, created_by, visibility, type, content, content_html, image_url, options, correct_answer, points, explanation, usage_count, last_used_at"
    )
    .in("id", uniqueQuestionIds);

  if (bankQuestionError?.code === "42703") {
    return { error: QUESTION_BANK_GOVERNANCE_ERROR };
  }
  if (!bankQuestionRows || bankQuestionRows.length === 0) {
    return { error: "Асуултын сангийн бичлэг олдсонгүй" };
  }

  const bankQuestionById = new Map(
    bankQuestionRows.map((question) => [question.id, question])
  );
  const orderedQuestions = uniqueQuestionIds
    .map((id) => bankQuestionById.get(id))
    .filter(
      (
        question
      ): question is (typeof bankQuestionRows)[number] => Boolean(question)
    );

  if (orderedQuestions.length !== uniqueQuestionIds.length) {
    return {
      error:
        uniqueQuestionIds.length === 1
          ? "Асуултын сангийн бичлэг олдсонгүй"
          : "Зарим сонгосон асуулт олдсонгүй тул дахин сонгоод үзнэ үү.",
    };
  }

  for (const bankQuestion of orderedQuestions) {
    if (!canViewQuestionBankItem(bankQuestion, context)) {
      return { error: "Зарим сонгосон асуултыг оруулах эрх байхгүй байна." };
    }

    if (bankQuestion.visibility !== "admin_curated") {
      return {
        error:
          "Зөвхөн баталгаажсан сангийн асуултуудыг шалгалт руу оруулж болно.",
      };
    }

    if (
      exam.subject_id &&
      bankQuestion.subject_id &&
      exam.subject_id !== bankQuestion.subject_id
    ) {
      return {
        error: "Өөр хичээлийн асуултыг энэ шалгалт руу оруулах боломжгүй",
      };
    }
  }

  const { data: existing } = await supabase
    .from("questions")
    .select("order_index")
    .eq("exam_id", examId)
    .order("order_index", { ascending: false })
    .limit(1);

  const startOrderIndex =
    existing && existing.length > 0 ? existing[0].order_index + 1 : 0;

  const insertPayload = orderedQuestions.map((bankQuestion, index) => ({
    exam_id: examId,
    type: bankQuestion.type,
    content: bankQuestion.content,
    content_html: bankQuestion.content_html,
    image_url: bankQuestion.image_url,
    options: bankQuestion.options,
    correct_answer: bankQuestion.correct_answer,
    points: bankQuestion.points,
    order_index: startOrderIndex + index,
    explanation: bankQuestion.explanation,
    created_by: user.id,
    ...buildBankQuestionTopicPayload(exam.subject_id ?? null, bankQuestion),
  }));

  const { error: insertError } = await supabase.from("questions").insert(insertPayload);
  if (insertError) return { error: insertError.message };

  const usageResults = await Promise.all(
    orderedQuestions.map((question) =>
      supabase.rpc("increment_bank_question_usage", {
        p_item_id: question.id,
      })
    )
  );
  const usageError = usageResults.find((result) => result.error)?.error ?? null;

  revalidatePath(`/educator/exams/${examId}/questions`);
  revalidatePath("/educator/question-bank");

  if (usageError) {
    return {
      success: true,
      count: insertPayload.length,
      warning:
        usageError.code === "PGRST202" || usageError.code === "42883"
          ? QUESTION_BANK_USAGE_TRACKING_WARNING
          : `Асуулт импортлогдлоо, гэхдээ ашиглалтын тоо шинэчлэгдэхэд алдаа гарлаа: ${usageError.message}`,
    };
  }

  return { success: true, count: insertPayload.length };
}

export async function importQuestionFromBank(
  examId: string,
  bankQuestionId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { exam } = await getOwnedExam(examId, user.id);

  if (!exam) return { error: "Шалгалт олдсонгүй" };
  if (exam.is_published) {
    return { error: "Нийтлэгдсэн шалгалтад сангаас асуулт нэмэх боломжгүй" };
  }

  const context = await getQuestionBankAccessContext(supabase, user.id);
  const { data: bankQuestion, error: bankQuestionError } = await supabase
    .from("question_bank")
    .select(
      "id, subject_id, created_by, visibility, type, content, content_html, image_url, options, correct_answer, points, explanation, usage_count, last_used_at, subtopic"
    )
    .eq("id", bankQuestionId)
    .maybeSingle();

  if (bankQuestionError?.code === "42703") {
    return { error: QUESTION_BANK_GOVERNANCE_ERROR };
  }
  if (!bankQuestion) return { error: "Асуултын сангийн бичлэг олдсонгүй" };
  if (!canViewQuestionBankItem(bankQuestion, context)) {
    return { error: "Энэ асуултыг импортлох эрх байхгүй байна" };
  }
  if (bankQuestion.visibility !== "admin_curated") {
    return { error: "Зөвхөн баталгаажсан сангийн асуултыг оруулах боломжтой" };
  }
  if (
    exam.subject_id &&
    bankQuestion.subject_id &&
    exam.subject_id !== bankQuestion.subject_id
  ) {
    return {
      error: "Өөр хичээлийн асуултыг энэ шалгалт руу оруулах боломжгүй",
    };
  }

  const { data: existing } = await supabase
    .from("questions")
    .select("order_index")
    .eq("exam_id", examId)
    .order("order_index", { ascending: false })
    .limit(1);

  const order_index =
    existing && existing.length > 0 ? existing[0].order_index + 1 : 0;

  const { error: insertError } = await supabase.from("questions").insert({
    exam_id: examId,
    type: bankQuestion.type,
    content: bankQuestion.content,
    content_html: bankQuestion.content_html,
    image_url: bankQuestion.image_url,
    options: bankQuestion.options,
    correct_answer: bankQuestion.correct_answer,
    points: bankQuestion.points,
    order_index,
    explanation: bankQuestion.explanation,
    created_by: user.id,
    ...buildBankQuestionTopicPayload(exam.subject_id ?? null, bankQuestion),
  });

  if (insertError) return { error: insertError.message };

  // Use SECURITY DEFINER RPC so non-owners importing shared questions can also increment.
  // Import itself should still succeed even if usage analytics cannot be updated yet.
  const { error: usageError } = await supabase.rpc(
    "increment_bank_question_usage",
    { p_item_id: bankQuestionId }
  );

  revalidatePath(`/educator/exams/${examId}/questions`);
  revalidatePath("/educator/question-bank");
  if (usageError) {
    return {
      success: true,
      warning:
        usageError.code === "PGRST202" || usageError.code === "42883"
          ? QUESTION_BANK_USAGE_TRACKING_WARNING
          : `Асуулт импортлогдлоо, гэхдээ ашиглалтын тоо шинэчлэгдэхэд алдаа гарлаа: ${usageError.message}`,
    };
  }

  return { success: true };
}

export async function importSampleExamToExam(
  examId: string,
  sampleExamId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { exam } = await getOwnedExam(examId, user.id);
  if (!exam) return { error: "Шалгалт олдсонгүй" };
  if (exam.is_published) {
    return { error: "Нийтлэгдсэн шалгалтад жишиг шалгалт оруулах боломжгүй" };
  }

  const { data: sampleExam, error: sampleExamError } = await supabase
    .from("sample_exams")
    .select(
      "id, subject_id, sample_exam_items(order_index, question_bank:question_bank_id(id, visibility, subject_id, subtopic, type, content, content_html, image_url, options, correct_answer, points, explanation))"
    )
    .eq("id", sampleExamId)
    .maybeSingle();

  if (sampleExamError?.code === "42P01") {
    return {
      error: "Sample exam feature ашиглахын өмнө шинэ DB migration-аа apply хийнэ үү.",
    };
  }
  if (!sampleExam) {
    return { error: "Жишиг шалгалт олдсонгүй" };
  }

  if (exam.subject_id && sampleExam.subject_id !== exam.subject_id) {
    return { error: "Өөр хичээлийн жишиг шалгалтыг энэ шалгалт руу оруулах боломжгүй" };
  }

  const sampleExamItems = (sampleExam.sample_exam_items ??
    []) as Array<{
    order_index: number;
    question_bank:
      | {
          id: string;
          visibility: string;
          subject_id: string | null;
          subtopic: string | null;
          type: string;
          content: string;
          content_html: string | null;
          image_url: string | null;
          options: string[] | null;
          correct_answer: string | null;
          points: number;
          explanation: string | null;
        }
      | null
      | {
          id: string;
          visibility: string;
          subject_id: string | null;
          subtopic: string | null;
          type: string;
          content: string;
          content_html: string | null;
          image_url: string | null;
          options: string[] | null;
          correct_answer: string | null;
          points: number;
          explanation: string | null;
        }[];
  }>;

  const bankQuestions = sampleExamItems
    .sort((left, right) => left.order_index - right.order_index)
    .map((item) =>
      Array.isArray(item.question_bank) ? item.question_bank[0] : item.question_bank
    )
    .filter(
      (
        item
      ): item is {
        id: string;
        visibility: string;
        subject_id: string | null;
        subtopic: string | null;
        type: string;
        content: string;
        content_html: string | null;
        image_url: string | null;
        options: string[] | null;
        correct_answer: string | null;
        points: number;
        explanation: string | null;
      } =>
        item != null && item.visibility === "admin_curated"
    );

  if (bankQuestions.length === 0) {
    return { error: "Жишиг шалгалтад ашиглах баталгаажсан бодлого алга" };
  }

  const { data: existing } = await supabase
    .from("questions")
    .select("order_index")
    .eq("exam_id", examId)
    .order("order_index", { ascending: false })
    .limit(1);

  const startOrderIndex =
    existing && existing.length > 0 ? existing[0].order_index + 1 : 0;

  const insertPayload = bankQuestions.map((question, index) => ({
    exam_id: examId,
    type: question.type,
    content: question.content,
    content_html: question.content_html,
    image_url: question.image_url,
    options: question.options,
    correct_answer: question.correct_answer,
    points: question.points,
    order_index: startOrderIndex + index,
    explanation: question.explanation,
    created_by: user.id,
    ...buildSampleQuestionTopicPayload(exam.subject_id ?? null, question),
  }));

  const { error: insertError } = await supabase.from("questions").insert(insertPayload);

  if (insertError) {
    return { error: insertError.message };
  }

  revalidatePath(`/educator/exams/${examId}/questions`);
  return { success: true };
}

export async function updateQuestionBankItem(
  bankQuestionId: string,
  formData: FormData
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const context = await getQuestionBankAccessContext(supabase, user.id);
  const { data: existing, error: existingError } = await supabase
    .from("question_bank")
    .select("id, created_by, subject_id, visibility")
    .eq("id", bankQuestionId)
    .maybeSingle();

  if (existingError?.code === "42703") {
    return { error: QUESTION_BANK_GOVERNANCE_ERROR };
  }
  if (!existing) return { error: "Асуултын сангийн бичлэг олдсонгүй" };
  if (!canManageQuestionBankItem(existing, context)) {
    return { error: "Энэ асуултын сангийн бичлэгийг засах эрх байхгүй байна" };
  }

  const newSubjectId = String(formData.get("subject_id") || "").trim() || null;
  if (newSubjectId && !context.isAdmin && !context.allowedSubjectSet.has(newSubjectId)) {
    return { error: "Энэ хичээлд асуулт оноох эрх байхгүй байна" };
  }

  const type = String(formData.get("type") || "multiple_choice");
  const subject_id = String(formData.get("subject_id") || "").trim() || null;
  const visibilityValue =
    String(formData.get("visibility") || existing.visibility).trim() ||
    existing.visibility;
  const content = String(formData.get("content") || "").trim();
  const content_html = String(formData.get("content_html") || "").trim() || null;
  const image_url = String(formData.get("image_url") || "").trim() || null;
  const explanation = String(formData.get("explanation") || "").trim() || null;
  const difficulty = String(formData.get("difficulty") || "medium");
  const points = parseFloat(String(formData.get("points") || "1")) || 1;
  const tags = String(formData.get("tags") || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  if (!content && !content_html) {
    return { error: "Асуултын агуулга хоосон байж болохгүй." };
  }
  if (!isQuestionBankVisibility(visibilityValue)) {
    return { error: "Хадгалах төлөв буруу байна." };
  }
  if (!context.isAdmin && visibilityValue === "admin_curated") {
    return { error: "Admin curated төлөвийг зөвхөн админ онооно." };
  }
  if (
    (visibilityValue === "shared_subject" || visibilityValue === "admin_curated") &&
    !subject_id
  ) {
    return {
      error: "Хуваалцах эсвэл curated болгохын тулд хичээл заавал сонгоно.",
    };
  }

  const questionPayload = buildQuestionPayload(
    type,
    String(formData.get("options") || "[]"),
    String(formData.get("correct_answer") || "").trim() || null
  );
  if ("error" in questionPayload) {
    return { error: questionPayload.error };
  }

  const { error } = await supabase
    .from("question_bank")
    .update({
      subject_id,
      visibility: visibilityValue,
      type,
      content,
      content_html,
      image_url,
      options: questionPayload.options,
      correct_answer: questionPayload.correctAnswer,
      points,
      difficulty,
      tags,
      explanation,
      updated_at: new Date().toISOString(),
    })
    .eq("id", bankQuestionId);

  if (error) return { error: error.message };

  revalidatePath("/educator/question-bank");
  return { success: true };
}

export async function deleteQuestionBankItem(bankQuestionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const context = await getQuestionBankAccessContext(supabase, user.id);
  const { data: existing, error: existingError } = await supabase
    .from("question_bank")
    .select("id, created_by, subject_id, visibility")
    .eq("id", bankQuestionId)
    .maybeSingle();

  if (existingError?.code === "42703") {
    return { error: QUESTION_BANK_GOVERNANCE_ERROR };
  }
  if (!existing) return { error: "Асуултын сангийн бичлэг олдсонгүй" };
  if (!canManageQuestionBankItem(existing, context)) {
    return { error: "Энэ асуултын сангийн бичлэгийг устгах эрх байхгүй байна" };
  }

  const { error } = await supabase
    .from("question_bank")
    .delete()
    .eq("id", bankQuestionId);

  if (error) return { error: error.message };

  revalidatePath("/educator/question-bank");
  return { success: true };
}

export async function bulkUpdateQuestionBankItems(
  bankQuestionIds: string[],
  updates: {
    visibility?: QuestionBankVisibility;
    difficulty?: Difficulty;
  }
) {
  const ids = Array.from(
    new Set(bankQuestionIds.map((id) => id.trim()).filter(Boolean))
  );
  if (ids.length === 0) {
    return { error: "Өөрчлөх асуултуудаа сонгоно уу." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const context = await getQuestionBankAccessContext(supabase, user.id);
  const { data: rows, error: rowsError } = await supabase
    .from("question_bank")
    .select("id, created_by, subject_id, visibility")
    .in("id", ids);

  if (rowsError?.code === "42703") {
    return { error: QUESTION_BANK_GOVERNANCE_ERROR };
  }
  const manageableRows = (rows ?? []).filter((row) =>
    canManageQuestionBankItem(row, context)
  );

  if (manageableRows.length === 0) {
    return { error: "Сонгосон асуултуудад өөрчлөлт хийх эрх байхгүй байна." };
  }

  const patch: {
    visibility?: QuestionBankVisibility;
    difficulty?: Difficulty;
    updated_at: string;
  } = {
    updated_at: new Date().toISOString(),
  };

  if (updates.visibility) {
    if (!isQuestionBankVisibility(updates.visibility)) {
      return { error: "Сонгосон төлөв буруу байна." };
    }

    if (!context.isAdmin && updates.visibility === "admin_curated") {
      return { error: "Admin curated төлөвийг зөвхөн админ онооно." };
    }

    if (
      (updates.visibility === "shared_subject" ||
        updates.visibility === "admin_curated") &&
      manageableRows.some((row) => !row.subject_id)
    ) {
      return {
        error:
          "Хуваалцах гэж буй бүх асуултад хичээл заавал оноосон байх ёстой.",
      };
    }

    if (
      !context.isAdmin &&
      updates.visibility === "shared_subject" &&
      manageableRows.some(
        (row) =>
          row.subject_id && !context.allowedSubjectSet.has(row.subject_id)
      )
    ) {
      return {
        error:
          "Хуваалцах гэж буй асуултуудын хичээлд одоогоор teaching эрх байхгүй байна.",
      };
    }

    patch.visibility = updates.visibility;
  }

  if (updates.difficulty) {
    patch.difficulty = updates.difficulty;
  }

  if (!patch.visibility && !patch.difficulty) {
    return { error: "Өөрчлөх мэдээллээ сонгоно уу." };
  }

  const { error } = await supabase
    .from("question_bank")
    .update(patch)
    .in(
      "id",
      manageableRows.map((row) => row.id)
    );

  if (error) return { error: error.message };

  revalidatePath("/educator/question-bank");
  return { success: true, updatedCount: manageableRows.length };
}

export async function parseImportedQuestionFile(
  examId: string,
  formData: FormData
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { exam } = await getOwnedExam(examId, user.id);
  if (!exam) return { error: "Шалгалт олдсонгүй" };
  if (exam.is_published) {
    return { error: "Нийтлэгдсэн шалгалтад file import хийх боломжгүй" };
  }

  const file = formData.get("file");
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return { error: "Импортлох файл олдсонгүй." };
  }

  const uploadedFile = file as File;
  const fileName = uploadedFile.name || "questions";

  if (!/\.(xlsx|xls|csv|docx)$/i.test(fileName)) {
    return {
      error:
        "Одоогоор зөвхөн Excel (.xlsx, .xls) болон CSV файл дэмжинэ.",
    };
  }

  try {
    const fileBuffer = await uploadedFile.arrayBuffer();
    const parsedResult = /\.docx$/i.test(fileName)
      ? await buildQuestionImportDraftsFromWord(fileBuffer, fileName)
      : {
          drafts: buildQuestionImportDrafts(fileBuffer, fileName),
          warnings: [] as string[],
        };

    return {
      success: true,
      fileName,
      drafts: parsedResult.drafts,
      warnings: parsedResult.warnings,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Файлыг задлан унших үед алдаа гарлаа.",
    };
  }
}

export async function importParsedQuestions(
  examId: string,
  rawDrafts: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { exam } = await getOwnedExam(examId, user.id);
  if (!exam) return { error: "Шалгалт олдсонгүй" };
  if (exam.is_published) {
    return { error: "Нийтлэгдсэн шалгалтад file import хийх боломжгүй" };
  }

  function coerceDraft(rawDraft: unknown, index: number): QuestionImportDraft {
    const draft = (rawDraft ?? {}) as Partial<QuestionImportDraft>;

    return {
      draftId: String(draft.draftId ?? `draft-${index + 1}`),
      sourceRow: Number(draft.sourceRow) || index + 2,
      type:
        draft.type === "multiple_choice" ||
        draft.type === "multiple_response" ||
        draft.type === "fill_blank" ||
        draft.type === "matching" ||
        draft.type === "essay"
          ? draft.type
          : "essay",
      content: String(draft.content ?? ""),
      contentHtml: String(draft.contentHtml ?? ""),
      imageUrl: String(draft.imageUrl ?? ""),
      explanation: String(draft.explanation ?? ""),
      points: Number(draft.points) || 1,
      options: Array.isArray(draft.options)
        ? draft.options.map((item) => String(item ?? ""))
        : [],
      correctAnswer: String(draft.correctAnswer ?? ""),
      multipleCorrectAnswers: Array.isArray(draft.multipleCorrectAnswers)
        ? draft.multipleCorrectAnswers.map((item) => String(item ?? ""))
        : [],
      matchingPairs: Array.isArray(draft.matchingPairs)
        ? draft.matchingPairs.map((pair) => ({
            left: String(pair?.left ?? ""),
            right: String(pair?.right ?? ""),
          }))
        : [],
      warnings: Array.isArray(draft.warnings)
        ? draft.warnings.map((item) => String(item ?? ""))
        : [],
      errors: [],
    };
  }

  let parsedDrafts: QuestionImportDraft[];
  try {
    const parsed = JSON.parse(rawDrafts);
    if (!Array.isArray(parsed)) {
      return { error: "Импортлох draft өгөгдөл буруу байна." };
    }

    parsedDrafts = parsed.map((draft, index) => coerceDraft(draft, index));
  } catch {
    return { error: "Импортлох draft өгөгдлийг уншиж чадсангүй." };
  }

  if (parsedDrafts.length === 0) {
    return { error: "Импортлох асуулт олдсонгүй." };
  }

  const validatedDrafts = parsedDrafts.map((draft) => ({
    ...draft,
    errors: validateQuestionImportDraft(draft),
  }));

  const invalidDrafts = validatedDrafts.filter(
    (draft) => draft.errors.length > 0
  );
  if (invalidDrafts.length > 0) {
    return {
      error:
        "Зарим асуултын бүтэц дутуу байна. Preview дээр засч дахин оролдоно уу.",
      drafts: validatedDrafts,
    };
  }

  const { data: existing } = await supabase
    .from("questions")
    .select("order_index")
    .eq("exam_id", examId)
    .order("order_index", { ascending: false })
    .limit(1);

  let nextOrderIndex =
    existing && existing.length > 0 ? existing[0].order_index + 1 : 0;

  const insertRows: Record<string, unknown>[] = [];
  const revalidatedDrafts = validatedDrafts.map((draft) => ({
    ...draft,
    errors: [],
  }));

  for (const draft of validatedDrafts) {
    const normalized = draftToQuestionFormShape(draft);
    const payload = buildQuestionPayload(
      normalized.type,
      normalized.options,
      normalized.correct_answer || null
    );

    if ("error" in payload) {
      const nextDrafts = revalidatedDrafts.map((item) =>
        item.draftId === draft.draftId
          ? { ...item, errors: [payload.error] }
          : item
      );

      return {
        error:
          "Асуултын төрлийг шалгаж, preview дээрх алдаануудыг засаад дахин оролдоно уу.",
        drafts: nextDrafts,
      };
    }

    insertRows.push({
      exam_id: examId,
      type: normalized.type,
      content: normalized.content,
      content_html: normalized.content_html || null,
      image_url: normalized.image_url || null,
      options: payload.options,
      correct_answer: payload.correctAnswer,
      points: parseFloat(normalized.points) || 1,
      order_index: nextOrderIndex++,
      explanation: normalized.explanation || null,
      created_by: user.id,
      ...buildManualQuestionTopicPayload(exam.subject_id ?? null),
    });
  }

  const { error } = await supabase.from("questions").insert(insertRows);
  if (error) {
    return { error: error.message, drafts: revalidatedDrafts };
  }

  revalidatePath(`/educator/exams/${examId}/questions`);
  return { success: true, count: insertRows.length };
}
