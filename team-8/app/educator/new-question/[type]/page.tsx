import { notFound } from "next/navigation";
import MultipleChoice from "../_components/multipleChoice";
import Essay from "../_components/essay";
import ImageBased from "../_components/imageBased";
import TrueFalse from "../_components/trueFalse";
import ShortAnswer from "../_components/shortAnswer";
import Matching from "../_components/matching";
import FillBlank from "../_components/fillBlank";
import FileUpload from "../_components/fileUpload";
import MathFormula from "../_components/mathFormula";

const questionTypeMap = {
  essay: {
    title: "Эссэ / зохион бичлэг",
    component: Essay,
  },
  "multiple-choice": {
    title: "Олон сонголттой",
    component: MultipleChoice,
  },
  "image-based": {
    title: "Зураг ашигласан асуулт",
    component: ImageBased,
  },
  "true-false": {
    title: "Үнэн / Худал",
    component: TrueFalse,
  },
  "short-answer": {
    title: "Богино хариулт",
    component: ShortAnswer,
  },
  matching: {
    title: "Тааруулах",
    component: Matching,
  },
  "fill-blank": {
    title: "Хоосон зай бөглөх",
    component: FillBlank,
  },
  "file-upload": {
    title: "Файл илгээх",
    component: FileUpload,
  },
  math: {
    title: "Математик томьёо",
    component: MathFormula,
  },
} as const;

export default async function NewQuestionEditor({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;
  const selectedType =
    questionTypeMap[type as keyof typeof questionTypeMap] ?? null;

  if (!selectedType) {
    notFound();
  }

  const SelectedComponent = selectedType.component;

  return (
    <div className="w-full max-w-5xl mx-auto p-6 space-y-6 bg-gray-50/30">
      <div className="space-y-1">
        <div className="flex gap-1">
          {" "}
          <p className="text-xl font-bold text-slate-900">
            {selectedType.title}
          </p>
          <h1 className="text-xl font-bold text-slate-900"> асуулт үүсгэх</h1>
        </div>

        <p className="text-sm text-slate-500">Асуултын мэдээлэл бөглөнө үү.</p>
      </div>

      <div className="bg-white p-6 rounded-3xl border-2 border-[#E5E7EB]/50 shadow-sm">
        <SelectedComponent />
      </div>

      <div className="flex justify-end gap-4">
        <button className="px-7 py-2 rounded-xl bg-white border-2 text-[16px] border-[#E5E7EB] active:translate-y-[2px] cursor-pointer font-medium text-black">
          Цуцлах
        </button>
        <button className="px-7 py-2 rounded-xl bg-[#4F9DF7] text-[16px] text-white font-medium active:translate-y-[2px] cursor-pointer transition-all">
          Хадгалах
        </button>
      </div>
    </div>
  );
}
