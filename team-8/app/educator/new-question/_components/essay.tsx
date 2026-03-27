import { Info, BookOpen, Hash, Star, FileText, AlignLeft } from "lucide-react";

export default function Essay() {
  return (
    <div className="p-3 space-y-6">
      {/* Row 1: Subject, Word Count, Points */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Subject */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-widest">
            <BookOpen className="w-3.5 h-3.5 text-[#4F9DF7]" />
            Хичээл
          </label>
          <div className="relative">
            <select className="w-full pl-4 pr-9 py-3 rounded-xl border-2 border-[#EEF2FF] bg-[#F8FAFF] text-slate-700 font-semibold text-sm outline-none focus:border-[#4F9DF7] focus:bg-white transition-all appearance-none cursor-pointer">
              <option>Уран зохиол</option>
              <option>Математик</option>
              <option>Англи хэл</option>
            </select>
            <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M3 5l4 4 4-4"
                  stroke="#94A3B8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Word Count */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-widest">
            <Hash className="w-3.5 h-3.5 text-[#4F9DF7]" />
            Үгийн тоо
          </label>
          <input
            type="text"
            placeholder="600–700"
            className="w-full px-4 py-3 rounded-xl border-2 border-[#EEF2FF] bg-[#F8FAFF] text-slate-700 font-semibold text-sm outline-none focus:border-[#4F9DF7] focus:bg-white transition-all placeholder:text-slate-300"
          />
        </div>

        {/* Points */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-widest">
            <Star className="w-3.5 h-3.5 text-[#4F9DF7]" />
            Оноо
          </label>
          <input
            type="number"
            defaultValue={10}
            className="w-full px-4 py-3 rounded-xl border-2 border-[#EEF2FF] bg-[#F8FAFF] text-slate-700 font-semibold text-sm outline-none focus:border-[#4F9DF7] focus:bg-white transition-all"
          />
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-[#F1F5F9]" />

      {/* Row 2: Question */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-widest">
          <AlignLeft className="w-3.5 h-3.5 text-[#4F9DF7]" />
          Асуулт
        </label>
        <textarea
          placeholder="Асуулт эсвэл даалгаврын тайлбарыг оруулна уу..."
          className="w-full px-4 py-3.5 min-h-[108px] rounded-xl border-2 border-[#EEF2FF] bg-[#F8FAFF] text-slate-700 font-medium text-sm outline-none focus:border-[#4F9DF7] focus:bg-white transition-all placeholder:text-slate-300 resize-none leading-relaxed"
        />
      </div>

      {/* Row 3: Explanation */}
      <div className="space-y-1.5">
        <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-widest">
          <FileText className="w-3.5 h-3.5 text-[#4F9DF7]" />
          Тайлбар
        </label>
        <textarea
          placeholder="Нэмэлт тайлбар эсвэл зөвлөмж..."
          className="w-full px-4 py-3.5 min-h-[108px] rounded-xl border-2 border-[#EEF2FF] bg-[#F8FAFF] text-slate-700 font-medium text-sm outline-none focus:border-[#4F9DF7] focus:bg-white transition-all placeholder:text-slate-300 resize-none leading-relaxed"
        />
      </div>

      {/* Row 4: Assessment Criteria */}
      <div className="rounded-2xl bg-[#FFF5F5] border border-[#FFE0E0] p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#EF4444] flex items-center justify-center shadow-sm flex-shrink-0">
            <Info className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-bold text-[#EF4444] text-sm tracking-wide">
            Үнэлгээний шалгуур
          </span>
        </div>

        <ul className="space-y-2.5">
          {[
            {
              label: "Агуулга",
              desc: "Сэдвээ зөв, ойлгомжтой бичсэн эсэх",
            },
            { label: "Бүтэц", desc: "Оршил, гол хэсэг, дүгнэлттэй эсэх" },
            { label: "Хэл найруулга", desc: "Үг, өгүүлбэрийн уялдаа" },
            { label: "Дүрэм", desc: "Үг үсэг, цэг таслалын алдаа" },
            {
              label: "Бүтээлч байдал",
              desc: "Өөрийн санаа, сонирхолтой байдал",
            },
          ].map((item, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-0.5 w-5 h-5 rounded-full bg-[#FCA5A5] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                {i + 1}
              </span>
              <span className="text-sm text-slate-600 leading-snug">
                <span className="font-bold text-slate-700">{item.label}</span>
                {" – "}
                {item.desc}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
