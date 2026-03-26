export default function TrueFalse() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Хичээл</label>
          <select className="w-full rounded-xl border-2 border-[#E5E7EB] bg-white p-3 font-medium outline-none focus:border-[#4F9DF7]">
            <option>Байгалийн ухаан</option>
            <option>Түүх</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Сэдэв</label>
          <input
            type="text"
            placeholder="Жишээ: Нарны аймаг"
            className="w-full rounded-xl border-2 border-[#E5E7EB] p-3 font-medium outline-none focus:border-[#4F9DF7]"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Оноо</label>
          <select className="w-full rounded-xl border-2 border-[#E5E7EB] bg-white p-3 font-medium outline-none focus:border-[#4F9DF7]">
            <option>1</option>
            <option>2</option>
            <option>3</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-700">Мэдэгдэл</label>
        <textarea
          placeholder="Үнэн эсвэл худлыг шийдэх өгүүлбэрээ бичнэ үү."
          className="min-h-[100px] w-full resize-none rounded-xl border-2 border-[#E5E7EB] bg-[#F9FAFB] p-4 font-medium outline-none focus:border-[#4F9DF7]"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <button
          type="button"
          className="rounded-2xl border-2 border-[#22C55E] bg-[#DCFCE7] px-6 py-5 text-left font-bold text-[#166534]"
        >
          Үнэн
        </button>
        <button
          type="button"
          className="rounded-2xl border-2 border-[#EF4444] bg-[#FEE2E2] px-6 py-5 text-left font-bold text-[#991B1B]"
        >
          Худал
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-700">Тайлбар</label>
        <textarea
          placeholder="Зөв хариултын тайлбар"
          className="min-h-[90px] w-full resize-none rounded-xl border-2 border-[#E5E7EB] bg-[#F9FAFB] p-4 font-medium outline-none focus:border-[#4F9DF7]"
        />
      </div>
    </div>
  );
}
