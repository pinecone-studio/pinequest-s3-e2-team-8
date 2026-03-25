import { createClient } from "@/lib/supabase/server";
import type { QuestionPassage } from "@/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

function getPassageIds(items: Array<{ passage_id?: string | null }>) {
  return Array.from(
    new Set(
      items
        .map((item) => item.passage_id)
        .filter((value): value is string => Boolean(value))
    )
  );
}

async function getPassageMap(
  supabase: SupabaseServerClient,
  passageIds: string[]
) {
  if (passageIds.length === 0) {
    return new Map<string, QuestionPassage>();
  }

  const { data, error } = await supabase
    .from("question_passages")
    .select("id, exam_id, title, content, content_html, image_url, order_index, created_by, created_at")
    .in("id", passageIds);

  if (error?.code === "42P01") {
    return new Map<string, QuestionPassage>();
  }

  return new Map(
    (data ?? []).map((passage) => [passage.id, passage as QuestionPassage])
  );
}

export async function getQuestionPassagesByExam(
  supabase: SupabaseServerClient,
  examId: string
) {
  const { data, error } = await supabase
    .from("question_passages")
    .select("id, exam_id, title, content, content_html, image_url, order_index, created_by, created_at")
    .eq("exam_id", examId)
    .order("order_index", { ascending: true });

  if (error?.code === "42P01") {
    return [] as QuestionPassage[];
  }

  return (data ?? []) as QuestionPassage[];
}

export async function attachPassagesToQuestions<
  T extends { passage_id?: string | null }
>(supabase: SupabaseServerClient, questions: T[]) {
  const passageMap = await getPassageMap(supabase, getPassageIds(questions));

  return questions.map((question) => ({
    ...question,
    question_passages:
      question.passage_id ? passageMap.get(question.passage_id) ?? null : null,
  }));
}

export async function attachPassagesToAnswers<
  T extends {
    questions?: ({ passage_id?: string | null } & Record<string, unknown>) | null;
  }
>(supabase: SupabaseServerClient, answers: T[]) {
  const questionItems = answers
    .map((answer) => answer.questions)
    .filter(
      (
        question
      ): question is { passage_id?: string | null } & Record<string, unknown> =>
        Boolean(question)
    );

  const attachedQuestions = await attachPassagesToQuestions(
    supabase,
    questionItems
  );
  const questionMap = new Map(
    attachedQuestions.map((question) => [String(question.id), question])
  );

  return answers.map((answer) => {
    if (!answer.questions) return answer;

    const questionId = String(answer.questions.id);
    return {
      ...answer,
      questions: questionMap.get(questionId) ?? answer.questions,
    };
  });
}
