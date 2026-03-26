import { Check } from "lucide-react";

export default function MultipleChoice() {
  const options = [
    { id: 1, label: "Хариулт 1", isCorrect: false },
    { id: 2, label: "Хариулт 2", isCorrect: false },
    { id: 3, label: "Хариулт 3", isCorrect: true },
    { id: 4, label: "Хариулт 4", isCorrect: false },
  ];

  return (
    <div className="space-y-6">
      {/* Row 1: Subject, Topic, Points */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Хичээл</label>
          <select className="w-full p-3 rounded-xl border-2 border-[#E5E7EB] outline-none focus:border-[#4F9DF7] bg-white font-medium">
            <option>Үндэсний бичиг</option>
            <option>Монгол хэл</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Сэдэв</label>
          <input
            type="text"
            placeholder="Жишээ: Зугаатай таавар"
            className="w-full p-3 rounded-xl border-2 border-[#E5E7EB] outline-none focus:border-[#4F9DF7] font-medium"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Оноо</label>
          <select className="w-full p-3 rounded-xl border-2 border-[#E5E7EB] outline-none focus:border-[#4F9DF7] bg-white font-medium">
            <option>1</option>
            <option>2</option>
            <option>5</option>
          </select>
        </div>
      </div>

      {/* Row 2: Question Input */}
      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-700">Асуулт</label>
        <textarea
          placeholder="Асуултаа бичнэ үү?"
          className="w-full p-4 min-h-[100px] rounded-xl border-2 border-[#E5E7EB] bg-[#F9FAFB] outline-none focus:border-[#4F9DF7] font-medium resize-none"
        />
      </div>

      {/* Row 3: Additional Explanation */}
      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-700">Тайлбар</label>
        <textarea
          placeholder="Нэмэлт тайлбар (заавал биш)"
          className="w-full p-4 min-h-[100px] rounded-xl border-2 border-[#E5E7EB] bg-[#F9FAFB] outline-none focus:border-[#4F9DF7] font-medium resize-none"
        />
      </div>

      {/* Row 4: Answer Settings */}
      <div className="space-y-4">
        <label className="text-sm font-bold text-slate-700">
          Хариултын тохиргоо
        </label>
        <div className="p-6 rounded-2xl border-2 border-[#E5E7EB] space-y-4">
          {options.map((option) => (
            <div
              key={option.id}
              className="flex items-center gap-4 group cursor-pointer"
            >
              <div
                className={`h-6 w-6 rounded-full border-2 flex items-center justify-center transition-all ${
                  option.isCorrect
                    ? "bg-[#4ADE80] border-[#4ADE80]"
                    : "border-[#FCA5A5] bg-white"
                }`}
              >
                {option.isCorrect && (
                  <Check className="h-4 w-4 text-white stroke-[4px]" />
                )}
              </div>
              <span className="text-slate-600 font-medium">{option.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
