import { Info } from "lucide-react";

export default function Essay() {
  return (
    <div className="space-y-6">
      {/* Row 1: Subject, Word Count, Points */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Хичээл</label>
          <select className="w-full p-3 rounded-xl border-2 border-[#E5E7EB] outline-none focus:border-[#4F9DF7] bg-white font-medium">
            <option>Уран зохиол</option>
            <option>Математик</option>
            <option>Англи хэл</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Үгийн тоо</label>
          <input
            type="text"
            placeholder="600-700"
            className="w-full p-3 rounded-xl border-2 border-[#E5E7EB] outline-none focus:border-[#4F9DF7] font-medium"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Оноо</label>
          <input
            type="number"
            defaultValue={10}
            className="w-full p-3 rounded-xl border-2 border-[#E5E7EB] outline-none focus:border-[#4F9DF7] font-medium"
          />
        </div>
      </div>

      {/* Row 2: Question Description */}
      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-700">Асуулт</label>
        <textarea
          placeholder="Write your message, description"
          className="w-full p-4 min-h-[100px] rounded-xl border-2 border-[#E5E7EB] bg-[#F9FAFB] outline-none focus:border-[#4F9DF7] font-medium resize-none"
        />
      </div>

      {/* Row 3: Explanation */}
      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-700">Тайлбар</label>
        <textarea
          placeholder="Write your message, description"
          className="w-full p-4 min-h-[100px] rounded-xl border-2 border-[#E5E7EB] bg-[#F9FAFB] outline-none focus:border-[#4F9DF7] font-medium resize-none"
        />
      </div>

      {/* Row 4: Assessment Criteria (Red Box) */}
      <div className="p-6 rounded-2xl bg-[#FEF2F2] border border-[#FEE2E2] space-y-4">
        <div className="flex items-center gap-2 text-[#EF4444]">
          <div className="bg-[#FCA5A5] rounded-full p-1">
            <Info className="h-4 w-4 text-white" />
          </div>
          <span className="font-bold">Үнэлгээний шалгуур</span>
        </div>
        <ul className="space-y-3 text-sm font-medium text-slate-700 ml-1">
          <li>Агуулга – сэдвээ зөв, ойлгомжтой бичсэн эсэх</li>
          <li>Бүтэц – оршил, гол хэсэг, дүгнэлттэй эсэх</li>
          <li>Хэл найруулга – үг, өгүүлбэрийн уялдаа</li>
          <li>Дүрэм – Үг үсэг, цэг таслалын алдаа</li>
          <li>Бүтээлч байдал – өөрийн санаа, сонирхолтой байдал</li>
        </ul>
      </div>
    </div>
  );
}
