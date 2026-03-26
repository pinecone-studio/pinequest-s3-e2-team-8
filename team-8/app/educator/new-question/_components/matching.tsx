const matchingPairs = [
  { left: "Нар", right: "Од" },
  { left: "Дэлхий", right: "Гараг" },
  { left: "Сар", right: "Дагуул" },
];

export default function Matching() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Хичээл</label>
          <select className="w-full rounded-xl border-2 border-[#E5E7EB] bg-white p-3 font-medium outline-none focus:border-[#4F9DF7]">
            <option>Байгалийн ухаан</option>
            <option>Англи хэл</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Сэдэв</label>
          <input
            type="text"
            placeholder="Жишээ: Нэр томьёо тааруулах"
            className="w-full rounded-xl border-2 border-[#E5E7EB] p-3 font-medium outline-none focus:border-[#4F9DF7]"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Оноо</label>
          <input
            type="number"
            defaultValue={3}
            className="w-full rounded-xl border-2 border-[#E5E7EB] p-3 font-medium outline-none focus:border-[#4F9DF7]"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-700">Заавар</label>
        <textarea
          placeholder="Юуг юутай тааруулахыг тайлбарлана уу."
          className="min-h-[90px] w-full resize-none rounded-xl border-2 border-[#E5E7EB] bg-[#F9FAFB] p-4 font-medium outline-none focus:border-[#4F9DF7]"
        />
      </div>

      <div className="space-y-3">
        <label className="text-sm font-bold text-slate-700">Хосууд</label>
        {matchingPairs.map((pair) => (
          <div key={pair.left} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr]">
            <input
              type="text"
              defaultValue={pair.left}
              className="rounded-xl border-2 border-[#E5E7EB] bg-white p-3 font-medium outline-none focus:border-[#4F9DF7]"
            />
            <div className="flex items-center justify-center text-sm font-bold text-slate-400">
              ↔
            </div>
            <input
              type="text"
              defaultValue={pair.right}
              className="rounded-xl border-2 border-[#E5E7EB] bg-white p-3 font-medium outline-none focus:border-[#4F9DF7]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
