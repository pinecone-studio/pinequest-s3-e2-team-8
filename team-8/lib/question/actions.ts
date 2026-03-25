"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  attachPassagesToQuestions,
  getQuestionPassagesByExam as loadQuestionPassagesByExam,
} from "@/lib/question-passages";

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
  const difficulty = (formData.get("difficulty") as string) || "medium";
  const tags = ((formData.get("tags") as string) || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

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
  };

  if (passageResolution.passageId) {
    insertPayload.passage_id = passageResolution.passageId;
  }

  const { error } = await supabase.from("questions").insert(insertPayload);

  if (error) return { error: error.message };

  const { data: existingBankEntries } = await supabase
    .from("question_bank")
    .select("id, usage_count, correct_answer, image_url")
    .eq("created_by", user.id)
    .eq("type", type)
    .eq("content", content);

  const matchingBankEntry = (existingBankEntries ?? []).find(
    (entry) =>
      (entry.correct_answer ?? null) === questionPayload.correctAnswer &&
      (entry.image_url ?? null) === image_url
  );

  if (matchingBankEntry) {
    await supabase
      .from("question_bank")
      .update({
        usage_count: Number(matchingBankEntry.usage_count ?? 0) + 1,
        points,
        explanation,
        content_html,
        options: questionPayload.options,
        correct_answer: questionPayload.correctAnswer,
        image_url,
        difficulty,
        tags,
      })
      .eq("id", matchingBankEntry.id);
  } else {
    await supabase.from("question_bank").insert({
      subject_id: exam.subject_id,
      created_by: user.id,
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
      usage_count: 1,
    });
  }

  revalidatePath(`/educator/exams/${examId}/questions`);
  revalidatePath("/educator/question-bank");
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

  if (!content && !content_html) {
    return { error: "Passage-ийн агуулгыг оруулна уу." };
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
    content: content || title || "Passage",
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

  if (!content && !content_html) {
    return { error: "Passage-ийн агуулгыг оруулна уу." };
  }

  const { error } = await supabase
    .from("question_passages")
    .update({
      title,
      content: content || title || "Passage",
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

  const { error } = await supabase
    .from("questions")
    .update({
      passage_id: passageResolution.passageId,
      type,
      content,
      content_html,
      image_url,
      options: questionPayload.options,
      correct_answer: questionPayload.correctAnswer,
      points,
      explanation,
    })
    .eq("id", questionId)
    .eq("exam_id", examId)
    .eq("created_by", user.id);

  if (error) return { error: error.message };

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

export async function getQuestionBank() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("question_bank")
    .select("*, subjects(name)")
    .eq("created_by", user.id)
    .order("updated_at", { ascending: false });

  return data ?? [];
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

  const { data: bankQuestion } = await supabase
    .from("question_bank")
    .select(
      "id, type, content, content_html, image_url, options, correct_answer, points, explanation, usage_count"
    )
    .eq("id", bankQuestionId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (!bankQuestion) return { error: "Асуултын сангийн бичлэг олдсонгүй" };

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
  });

  if (insertError) return { error: insertError.message };

  await supabase
    .from("question_bank")
    .update({
      usage_count: Number(bankQuestion.usage_count ?? 0) + 1,
    })
    .eq("id", bankQuestionId);

  revalidatePath(`/educator/exams/${examId}/questions`);
  revalidatePath("/educator/question-bank");
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

  const { data: existing } = await supabase
    .from("question_bank")
    .select("id")
    .eq("id", bankQuestionId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (!existing) return { error: "Асуултын сангийн бичлэг олдсонгүй" };

  const type = String(formData.get("type") || "multiple_choice");
  const subject_id = String(formData.get("subject_id") || "").trim() || null;
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
    .eq("id", bankQuestionId)
    .eq("created_by", user.id);

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

  const { error } = await supabase
    .from("question_bank")
    .delete()
    .eq("id", bankQuestionId)
    .eq("created_by", user.id);

  if (error) return { error: error.message };

  revalidatePath("/educator/question-bank");
  return { success: true };
}
