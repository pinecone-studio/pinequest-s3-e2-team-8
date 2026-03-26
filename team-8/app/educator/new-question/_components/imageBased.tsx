import { Upload } from "lucide-react";

export default function ImageBased() {
  return (
    <div className="space-y-6">
      {/* Row 1: Subject, Topic, Points */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Хичээл</label>
          <select className="w-full p-3 rounded-xl border-2 border-[#E5E7EB] outline-none focus:border-[#4F9DF7] bg-white font-medium">
            <option>Түүх</option>
            <option>Газар зүй</option>
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
            <option>5</option>
          </select>
        </div>
      </div>

      {/* Row 2: Image/File Upload Zone */}
      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-700">Зураг/ Файл</label>
        <div className="border-2 border-dashed border-[#CBD5E1] rounded-xl p-10 flex flex-col items-center justify-center bg-white hover:bg-slate-50 transition-colors cursor-pointer group">
          <div className="p-3 rounded-full bg-slate-100 text-slate-500 group-hover:text-[#4F9DF7] transition-colors mb-4">
            <Upload className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-slate-600">
            Click to upload or drag and drop
          </p>
          <p className="text-xs text-slate-400 mt-1 uppercase">
            PDF, DOC, XLS (max. 10MB)
          </p>
        </div>
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
      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-700">
          Хариултын тохиргоо
        </label>
        <div className="w-full p-5 rounded-xl border-2 border-[#E5E7EB] bg-[#F9FAFB]">
          <input
            type="text"
            placeholder="Хариулт 1"
            className="w-full bg-transparent border-none outline-none font-medium text-slate-700"
          />
        </div>
      </div>
    </div>
  );
}
