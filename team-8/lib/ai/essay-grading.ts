import { getModel } from "@/lib/ai/config";

export interface AIEssayGradeResult {
  score: number;
  feedback: string;
}

function parseGradeResult(text: string, maxPoints: number) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI хариултыг задлах боломжгүй байна");
  }

  const parsed = JSON.parse(jsonMatch[0]) as AIEssayGradeResult;
  const boundedScore = Math.max(
    0,
    Math.min(maxPoints, Number(parsed.score ?? 0) || 0),
  );

  return {
    score: boundedScore,
    feedback: String(parsed.feedback ?? "").trim(),
  };
}

export async function gradeEssayWithAIResult(input: {
  questionContent: string;
  studentAnswer: string;
  maxPoints: number;
}): Promise<AIEssayGradeResult> {
  if (!input.studentAnswer.trim()) {
    return {
      score: 0,
      feedback: "Хариулт бичээгүй тул 0 оноо авлаа.",
    };
  }

  const model = getModel();
  const prompt = `Чи шалгалтын эссэ хариултыг шалгаж дүгнэх AI багш юм.

Асуулт: ${input.questionContent}

Сурагчийн хариулт: ${input.studentAnswer}

Дээд оноо: ${input.maxPoints}

Дараах шалгуурын дагуу үнэл:
1. Агуулгын зөв байдал (40%)
2. Тайлбарын гүнзгийрэл (30%)
3. Логик дараалал (20%)
4. Бичгийн чадвар (10%)

Заавал дараах JSON форматаар хариул (өөр текст бүү бич):
{"score": <оноо (0-${input.maxPoints} хоорондох тоо, 0.5 нарийвчлалтай)>, "feedback": "<Монгол хэлээр товч тайлбар, юу сайн байсан, юуг сайжруулах>"}`;

  const result = await model.generateContent(prompt);
  return parseGradeResult(result.response.text().trim(), input.maxPoints);
}
