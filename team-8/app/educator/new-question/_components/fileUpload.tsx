import { FileUp } from "lucide-react";

export default function FileUpload() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Хичээл</label>
          <select className="w-full rounded-xl border-2 border-[#E5E7EB] bg-white p-3 font-medium outline-none focus:border-[#4F9DF7]">
            <option>Дизайн</option>
            <option>Мэдээлэл зүй</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Даалгавар</label>
          <input
            type="text"
            placeholder="Жишээ: Тайлан илгээх"
            className="w-full rounded-xl border-2 border-[#E5E7EB] p-3 font-medium outline-none focus:border-[#4F9DF7]"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Оноо</label>
          <input
            type="number"
            defaultValue={10}
            className="w-full rounded-xl border-2 border-[#E5E7EB] p-3 font-medium outline-none focus:border-[#4F9DF7]"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-700">Заавар</label>
        <textarea
          placeholder="Суралцагч ямар файл ямар хэлбэрээр өгөхийг тайлбарлана уу."
          className="min-h-[100px] w-full resize-none rounded-xl border-2 border-[#E5E7EB] bg-[#F9FAFB] p-4 font-medium outline-none focus:border-[#4F9DF7]"
        />
      </div>

      <div className="rounded-2xl border-2 border-dashed border-[#CBD5E1] bg-white p-10">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="mb-4 rounded-full bg-slate-100 p-4 text-slate-500">
            <FileUp className="h-7 w-7" />
          </div>
          <p className="font-semibold text-slate-700">
            Суралцагчийн оруулах файлын жишээ
          </p>
          <p className="mt-1 text-sm text-slate-400">
            PDF, DOCX, PPTX, ZIP зэргийг зөвшөөрч болно
          </p>
        </div>
      </div>
    </div>
  );
}
