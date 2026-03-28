"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getModel } from "@/lib/ai/config";
import { notifyTeacherOfAIGrading } from "@/lib/notification/actions";
import type { QuestionType } from "@/types";

// ─── AI Essay Grading ────────────────────────────────────────────────

interface AIGradeResult {
  score: number;
  feedback: string;
}

async function callGeminiForGrading(
  questionContent: string,
  studentAnswer: string,
  maxPoints: number
): Promise<AIGradeResult> {
  const model = getModel();

  const prompt = `Чи шалгалтын эссэ хариултыг шалгаж дүгнэх AI багш юм.

Асуулт: ${questionContent}

Сурагчийн хариулт: ${studentAnswer}

Дээд оноо: ${maxPoints}

Дараах шалгуурын дагуу үнэл:
1. Агуулгын зөв байдал (40%)
2. Тайлбарын гүнзгийрэл (30%)
3. Логик дараалал (20%)
4. Бичгийн чадвар (10%)

Заавал дараах JSON форматаар хариул (өөр текст бүү бич):
{"score": <оноо (0-${maxPoints} хоорондох тоо, 0.5 нарийвчлалтай)>, "feedback": "<Монгол хэлээр товч тайлбар, юу сайн байсан, юуг сайжруулах>"}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI хариултыг задлах боломжгүй байна");
  }

  const parsed = JSON.parse(jsonMatch[0]) as AIGradeResult;
  parsed.score = Math.max(0, Math.min(maxPoints, Number(parsed.score) || 0));

  return parsed;
}

export async function gradeEssayWithAI(answerId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: answer } = await supabase
    .from("answers")
    .select("id, answer, question_id, session_id")
    .eq("id", answerId)
    .maybeSingle();

  if (!answer) return { error: "Хариулт олдсонгүй" };
  if (!answer.answer?.trim()) {
    return { error: "Хариулт хоосон байна, AI дүгнэх боломжгүй" };
  }

  const { data: question } = await supabase
    .from("questions")
    .select("content, points, type, exam_id")
    .eq("id", answer.question_id)
    .maybeSingle();

  if (!question) return { error: "Асуулт олдсонгүй" };
  if (question.type !== "essay") {
    return { error: "Зөвхөн эссэ төрлийн асуултыг AI-аар дүгнэнэ" };
  }

  try {
    const aiResult = await callGeminiForGrading(
      question.content,
      answer.answer,
      question.points
    );

    const { error: updateError } = await supabase
      .from("answers")
      .update({
        ai_score: aiResult.score,
        ai_feedback: aiResult.feedback,
        ai_graded_at: new Date().toISOString(),
        score: aiResult.score,
        feedback: `[AI] ${aiResult.feedback}`,
        graded_by: user.id,
        graded_at: new Date().toISOString(),
        is_correct: aiResult.score >= question.points * 0.5,
      })
      .eq("id", answerId);

    if (updateError) return { error: updateError.message };

    revalidatePath(`/educator/grading/${answer.session_id}`);
    return {
      success: true,
      score: aiResult.score,
      feedback: aiResult.feedback,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI дүгнэлт амжилтгүй";
    return { error: message };
  }
}

export async function autoGradeSessionEssays(sessionId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: answers } = await supabase
    .from("answers")
    .select("id, answer, question_id, score")
    .eq("session_id", sessionId);

  if (!answers || answers.length === 0) {
    return { error: "Хариулт олдсонгүй" };
  }

  const questionIds = [...new Set(answers.map((a) => a.question_id))];
  const { data: questions } = await supabase
    .from("questions")
    .select("id, content, points, type")
    .in("id", questionIds);

  if (!questions) return { error: "Асуултууд олдсонгүй" };

  const questionMap = new Map(questions.map((q) => [q.id, q]));
  let gradedCount = 0;
  const errors: string[] = [];

  for (const answer of answers) {
    const question = questionMap.get(answer.question_id);
    if (!question || question.type !== "essay") continue;
    if (!answer.answer?.trim()) continue;
    if (answer.score !== null) continue;

    try {
      const aiResult = await callGeminiForGrading(
        question.content,
        answer.answer,
        question.points
      );

      await supabase
        .from("answers")
        .update({
          ai_score: aiResult.score,
          ai_feedback: aiResult.feedback,
          ai_graded_at: new Date().toISOString(),
          score: aiResult.score,
          feedback: `[AI] ${aiResult.feedback}`,
          graded_by: user.id,
          graded_at: new Date().toISOString(),
          is_correct: aiResult.score >= question.points * 0.5,
        })
        .eq("id", answer.id);

      gradedCount++;
    } catch (err) {
      errors.push(
        `Асуулт ${answer.question_id}: ${err instanceof Error ? err.message : "Алдаа"}`
      );
    }
  }

  revalidatePath(`/educator/grading/${sessionId}`);

  // Notify teacher that AI grading is complete
  if (gradedCount > 0) {
    const { data: sessionRow } = await supabase
      .from("exam_sessions")
      .select("exam_id")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionRow) {
      const { data: examRow } = await supabase
        .from("exams")
        .select("title")
        .eq("id", sessionRow.exam_id)
        .maybeSingle();
      if (examRow) {
        notifyTeacherOfAIGrading(
          user.id,
          examRow.title,
          gradedCount,
          sessionId
        ).catch(() => {});
      }
    }
  }

  return {
    success: true,
    gradedCount,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ─── AI Question Generator ──────────────────────────────────────────

export interface AIGenerateQuestionsInput {
  examId: string;
  subjectName: string;
  gradeLevel: number;
  subtopic: string;
  difficultyLevel: number;
  questionCount: number;
  questionTypes: QuestionType[];
  sampleContext: string;
}

interface GeneratedQuestion {
  type: QuestionType;
  content: string;
  options: string[] | null;
  correct_answer: string | null;
  points: number;
  explanation: string | null;
}

async function callGeminiForQuestionGeneration(
  input: AIGenerateQuestionsInput
): Promise<GeneratedQuestion[]> {
  const model = getModel();

  const difficultyLabels: Record<number, string> = {
    1: "Хөнгөн (суурь мэдлэг шалгах)",
    2: "Дунд (хэрэглээ, задлан шинжлэх)",
    3: "Хүнд (нийлмэл бодлого, дүгнэлт хийх)",
  };

  const typeInstructions: Record<string, string> = {
    multiple_choice:
      'Сонгох: "options" дотор 4 сонголт, "correct_answer" нь options-ийн нэгтэй тэнцүү',
    multiple_response:
      'Олон зөв: "options" дотор 4-5 сонголт, "correct_answer" нь JSON array (жишээ: \'["A","C"]\')',
    fill_blank:
      'Нөхөх: "options" null, "correct_answer" нь зөв хариулт string',
    essay:
      'Задгай: "options" null, "correct_answer" null',
    matching:
      'Холбох: "options" нь ["зүүн1|||баруун1","зүүн2|||баруун2"] хэлбэртэй, "correct_answer" null',
  };

  const selectedTypeInstructions = input.questionTypes
    .map((t) => typeInstructions[t])
    .join("\n");

  const prompt = `Чи Монгол хэлээр шалгалтын асуулт боловсруулдаг AI багш юм.

Хичээл: ${input.subjectName}
Анги: ${input.gradeLevel}-р анги
${input.subtopic ? `Дэд сэдэв: ${input.subtopic}` : ""}
Түвшин: ${difficultyLabels[input.difficultyLevel] || "Дунд"}
Үүсгэх асуултын тоо: ${input.questionCount}

Дараах төрлүүдийг ашигла:
${selectedTypeInstructions}

${input.sampleContext ? `Жишиг шалгалтын агуулгаас суралц:\n${input.sampleContext}\n\nДээрх жишиг асуултуудтай ижил хэв маяг, агуулга, хүндрэлийн түвшинг баримтлан ШИНЭ асуултууд үүсгэ. Жишиг асуултуудыг шууд хуулахгүй.` : ""}

Заавал дараах JSON array форматаар хариул (өөр текст бүү бич):
[
  {
    "type": "question_type",
    "content": "Асуултын текст (Монгол хэлээр)",
    "options": ["сонголт1", "сонголт2", "сонголт3", "сонголт4"] эсвэл null,
    "correct_answer": "зөв хариулт" эсвэл null,
    "points": ${input.difficultyLevel === 3 ? 3 : input.difficultyLevel === 2 ? 2 : 1},
    "explanation": "Хариултын тайлбар"
  }
]`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error("AI хариултыг задлах боломжгүй байна");
  }

  const parsed = JSON.parse(jsonMatch[0]) as GeneratedQuestion[];
  return parsed.filter(
    (q) => q.content && q.type && input.questionTypes.includes(q.type)
  );
}

export async function generateQuestionsWithAI(input: AIGenerateQuestionsInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, subject_id, is_published, created_by")
    .eq("id", input.examId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (!exam) return { error: "Шалгалт олдсонгүй" };
  if (exam.is_published) {
    return { error: "Нийтлэгдсэн шалгалтад асуулт нэмэх боломжгүй" };
  }

  try {
    const generated = await callGeminiForQuestionGeneration(input);

    if (generated.length === 0) {
      return { error: "AI асуулт үүсгэж чадсангүй. Дахин оролдоно уу." };
    }

    const { data: existing } = await supabase
      .from("questions")
      .select("order_index")
      .eq("exam_id", input.examId)
      .order("order_index", { ascending: false })
      .limit(1);

    let orderIndex =
      existing && existing.length > 0 ? existing[0].order_index + 1 : 0;

    const insertRows = generated.map((q) => {
      const row = {
        exam_id: input.examId,
        type: q.type,
        content: q.content,
        content_html: null,
        image_url: null,
        options: q.options,
        correct_answer: q.correct_answer,
        points: q.points || 1,
        order_index: orderIndex++,
        explanation: q.explanation,
        created_by: user.id,
      };
      return row;
    });

    const { error: insertError } = await supabase
      .from("questions")
      .insert(insertRows);

    if (insertError) return { error: insertError.message };

    revalidatePath(`/educator/exams/${input.examId}/questions`);
    return { success: true, count: generated.length };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "AI асуулт үүсгэхэд алдаа гарлаа";
    return { error: message };
  }
}

export async function getSampleExamContext(
  examId: string
): Promise<{ subjectName: string; sampleContext: string } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: exam } = await supabase
    .from("exams")
    .select("subject_id, subjects(name)")
    .eq("id", examId)
    .maybeSingle();

  if (!exam?.subject_id) return null;

  const subjectName = Array.isArray(exam.subjects)
    ? exam.subjects[0]?.name
    : (exam.subjects as { name: string } | null)?.name;

  const { data: sampleExams } = await supabase
    .from("sample_exams")
    .select(
      "title, grade_level, difficulty_level, sample_exam_items(question_bank:question_bank_id(content, type, options, correct_answer, points))"
    )
    .eq("subject_id", exam.subject_id)
    .limit(3);

  if (!sampleExams || sampleExams.length === 0) {
    return { subjectName: subjectName || "", sampleContext: "" };
  }

  const contextParts: string[] = [];

  for (const se of sampleExams) {
    const items = (se.sample_exam_items ?? []) as Array<{
      question_bank:
        | {
            content: string;
            type: string;
            options: string[] | null;
            correct_answer: string | null;
            points: number;
          }
        | {
            content: string;
            type: string;
            options: string[] | null;
            correct_answer: string | null;
            points: number;
          }[]
        | null;
    }>;

    const questions = items
      .map((item) =>
        Array.isArray(item.question_bank)
          ? item.question_bank[0]
          : item.question_bank
      )
      .filter(Boolean);

    if (questions.length === 0) continue;

    const sampleLines = questions.slice(0, 5).map((q, i) => {
      const qData = q!;
      let line = `${i + 1}. [${qData.type}] ${qData.content}`;
      if (qData.options) {
        line += ` | Сонголтууд: ${JSON.stringify(qData.options)}`;
      }
      if (qData.correct_answer) {
        line += ` | Хариулт: ${qData.correct_answer}`;
      }
      return line;
    });

    contextParts.push(
      `--- ${se.title} (${se.grade_level}-р анги, түвшин ${se.difficulty_level}) ---\n${sampleLines.join("\n")}`
    );
  }

  return {
    subjectName: subjectName || "",
    sampleContext: contextParts.join("\n\n"),
  };
}
