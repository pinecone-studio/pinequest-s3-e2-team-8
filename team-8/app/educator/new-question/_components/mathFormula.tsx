export default function MathFormula() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Хичээл</label>
          <select className="w-full rounded-xl border-2 border-[#E5E7EB] bg-white p-3 font-medium outline-none focus:border-[#4F9DF7]">
            <option>Математик</option>
            <option>Физик</option>
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Сэдэв</label>
          <input
            type="text"
            placeholder="Жишээ: Квадрат тэгшитгэл"
            className="w-full rounded-xl border-2 border-[#E5E7EB] p-3 font-medium outline-none focus:border-[#4F9DF7]"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-700">Оноо</label>
          <input
            type="number"
            defaultValue={5}
            className="w-full rounded-xl border-2 border-[#E5E7EB] p-3 font-medium outline-none focus:border-[#4F9DF7]"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-700">Бодлого</label>
        <textarea
          placeholder="Жишээ: x² - 5x + 6 = 0 тэгшитгэлийг бод."
          className="min-h-[100px] w-full resize-none rounded-xl border-2 border-[#E5E7EB] bg-[#F9FAFB] p-4 font-medium outline-none focus:border-[#4F9DF7]"
        />
      </div>

      <div className="rounded-2xl border-2 border-[#E5E7EB] bg-[#F8FAFC] p-5">
        <p className="text-sm font-bold text-slate-700">Томьёоны хэсэг</p>
        <div className="mt-3 rounded-xl bg-white p-4 font-mono text-lg text-slate-800">
          x^2 - 5x + 6 = 0
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-bold text-slate-700">Зөв хариу</label>
        <input
          type="text"
          placeholder="x = 2, x = 3"
          className="w-full rounded-xl border-2 border-[#E5E7EB] bg-white p-4 font-medium outline-none focus:border-[#4F9DF7]"
        />
      </div>
    </div>
  );
}
