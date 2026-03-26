export default function FillBlank() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Хичээл</label>
          <select className="w-full rounded-xl border-2 border-[#E5E7EB] bg-white p-3 font-medium outline-none focus:border-[#4F9DF7]">
            <option>Монгол хэл</option>
            <option>Хими</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Сэдэв</label>
          <input
            type="text"
            placeholder="Жишээ: Өгүүлбэр гүйцээх"
            className="w-full rounded-xl border-2 border-[#E5E7EB] p-3 font-medium outline-none focus:border-[#4F9DF7]"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Оноо</label>
          <input
            type="number"
            defaultValue={1}
            className="w-full rounded-xl border-2 border-[#E5E7EB] p-3 font-medium outline-none focus:border-[#4F9DF7]"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-700">
          Хоосон зайтай өгүүлбэр
        </label>
        <textarea
          placeholder="Жишээ: Монгол улсын нийслэл _____ хот."
          className="min-h-[100px] w-full resize-none rounded-xl border-2 border-[#E5E7EB] bg-[#F9FAFB] p-4 font-medium outline-none focus:border-[#4F9DF7]"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-700">
          Зөв бөглөх үг
        </label>
        <input
          type="text"
          placeholder="Улаанбаатар"
          className="w-full rounded-xl border-2 border-[#E5E7EB] bg-white p-4 font-medium outline-none focus:border-[#4F9DF7]"
        />
      </div>
    </div>
  );
}
