"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

const SUBJECTS = [
  "Иргэний боловсрол",
  "Монгол хэл",
  "Математик",
  "Физик",
  "Хими",
  "Биологи",
  "Түүх",
  "Англи хэл",
] as const;

const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
type GradeOption = (typeof GRADES)[number] | "all";
const QUESTION_COUNT_OPTIONS = [5, 10, 15, 20, 30, 40, 50] as const;

const QUESTION_TYPES = [
  "Олон сонголттой",
  "Үнэн/Худал",
  "Богино хариулт",
  "Нөхөх",
  "Задгай хариулт",
] as const;

export default function AiCreate() {
  const [subject, setSubject] = useState<(typeof SUBJECTS)[number]>(SUBJECTS[0]);
  const [grade, setGrade] = useState<GradeOption>(10);
  const [questionCount, setQuestionCount] = useState("10");
  const [questionType, setQuestionType] = useState<(typeof QUESTION_TYPES)[number]>(
    "Олон сонголттой",
  );
  const [extraInstruction, setExtraInstruction] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");

  const normalizedCount = useMemo(() => {
    const parsed = Number.parseInt(questionCount, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return 10;
    if (parsed > 100) return 100;
    return parsed;
  }, [questionCount]);

  function buildPrompt() {
    const extra = extraInstruction.trim();

    const gradeInstruction =
      grade === "all" ? "бүх ангийн" : `${grade}-р ангийн`;

    return [
      `${gradeInstruction} ${subject} хичээлийн  ${normalizedCount} ширхэг ${questionType.toLowerCase()} асуулт үүсгэ.`,
      "Асуулт бүр тодорхой, ойлгомжтой, давхардалгүй байх ёстой.",
      questionType === "Олон сонголттой"
        ? "Асуулт бүрт 4 сонголт, зөв хариулт болон товч тайлбар хавсарга."
        : "Хариултын загвар болон үнэлгээний товч шалгуур хавсарга.",
      "Гаралтыг JSON биш, уншихад хялбар жагсаалтаар өг.",
      extra.length > 0 ? `Нэмэлт заавар: ${extra}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  function handleGeneratePrompt() {
    setGeneratedPrompt(buildPrompt());
  }

  return (
    <div className="min-h-screen">
      <h1 className="mb-7 text-[20px] font-medium">AI асуулт үүсгэх</h1>

      <div className="flex gap-4 rounded-lg bg-white p-4">
        <div className="flex flex-col gap-4">
          <div className="space-y-6 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        

            <div>
              <label className="mb-2 block text-[14px] font-medium">Хичээлийн нэр</label>
              <div className="relative">
                <select
                  value={subject}
                  onChange={(event) =>
                    setSubject(event.target.value as (typeof SUBJECTS)[number])
                  }
                  className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  {SUBJECTS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-gray-400" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-[14px] font-medium">Асуултын тоо</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  list="question-count-options"
                  value={questionCount}
                  onChange={(event) => setQuestionCount(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <datalist id="question-count-options">
                  {QUESTION_COUNT_OPTIONS.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>

              <div>
              <label className="mb-2 block text-[14px] font-medium">Анги</label>
              <div className="relative">
                <select
                  value={grade}
                  onChange={(event) =>
                    setGrade(
                      event.target.value === "all"
                        ? "all"
                        : (Number(event.target.value) as (typeof GRADES)[number]),
                    )
                  }
                  className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="all">Бүгд</option>
                  {GRADES.map((item) => (
                    <option key={item} value={item}>
                      {item}-р анги
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-gray-400" />
              </div>
            </div>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <div>
              <label className="mb-2 block text-[14px] font-medium">Төрөл</label>
              <div className="relative">
                <select
                  value={questionType}
                  onChange={(event) =>
                    setQuestionType(event.target.value as (typeof QUESTION_TYPES)[number])
                  }
                  className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 focus:outline-none"
                >
                  {QUESTION_TYPES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-gray-400" />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[14px] font-medium">
                Промт/ Нэмэлт заавар
              </label>
              <Textarea
                value={extraInstruction}
                onChange={(event) => setExtraInstruction(event.target.value)}
                placeholder="Мессежээ энд бичнэ үү."
                className="h-34.5 w-84.5 resize-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleGeneratePrompt}
            className="flex w-max items-center justify-center gap-2 rounded-lg bg-[#ECF1F9] px-6 py-2.5 font-semibold text-[#4891F1] transition-colors hover:bg-blue-100"
          >
            AI-аар үүсгэх
            <Sparkles className="h-4 w-4 fill-current" />
          </button>
        </div>

        <div className="relative min-h-178 flex-1 rounded-2xl border border-gray-100 bg-[#F1F5F980] px-10 py-8 shadow-sm">
          <div className="absolute right-8 top-8">
            <div className="flex items-center gap-2 rounded-full bg-black px-6 py-2 text-[13px] text-white">
              Тохиргоонд үндэслэн промт үүсгэнэ.
            </div>
          </div>

          <div className="mt-12">
            <h2 className="text-lg font-bold text-gray-800">SmartExam.v2.0</h2>
            <p className="mt-1 text-[14px] text-gray-400">
              Сонголтоо хийж, AI-аар үүсгэх товч дарна уу.
            </p>

            <div className="mt-5 rounded-xl border border-[#dbe4f2] bg-white p-4">
              <p className="mb-2 text-[14px] font-medium text-[#30415f]">Үүсгэсэн промт</p>
              <Textarea
                readOnly
                value={
                  generatedPrompt ||
                  "Энд таны сонгосон Анги, Хичээл, Асуултын тоо, Хүндийн зэрэг, Төрөл дээр тулгуурласан промт харагдана."
                }
                className="min-h-[180px] resize-none border border-[#dbe4f2] bg-[#f8fbff] text-[13px] leading-6"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
