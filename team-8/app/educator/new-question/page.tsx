import Link from "next/link";
import Cloud from "@/app/_icons/Cloud";

interface QuestionType {
  title: string;
  enTitle: string;
  description: string;
  slug: string;
}

const questionTypes: QuestionType[] = [
  {
    title: "Олон сонголттой",
    enTitle: "Multiple Choice",
    description: "Нэг эсвэл олон зөв хариулттай",
    slug: "multiple-choice",
  },
  {
    title: "Үнэн/Худал",
    enTitle: "True/False",
    description: "Үнэн эсвэл худал сонгох асуулт",
    slug: "true-false",
  },
  {
    title: "Богино хариулт",
    enTitle: "Short Answer",
    description: "Товч бичгээр хариулах асуулт",
    slug: "short-answer",
  },
  {
    title: "Эссэ",
    enTitle: "Essay",
    description: "Урт хариулт шаардсан асуулт",
    slug: "essay",
  },
  {
    title: "Тааруулах",
    enTitle: "Matching",
    description: "Хослол тааруулах асуулт",
    slug: "matching",
  },
  {
    title: "Хоосон зай бөглөх",
    enTitle: "Fill in the blank",
    description: "Өгүүлбэрийн хоосон зайг бөглөх",
    slug: "fill-blank",
  },
  {
    title: "Зураг дээр суурилсан",
    enTitle: "Image-based Question",
    description: "Зураг ашигласан асуулт",
    slug: "image-based",
  },
  {
    title: "Файл илгээх",
    enTitle: "File Upload",
    description: "Суралцагч файл илгээх асуулт",
    slug: "file-upload",
  },
  {
    title: "Математик томьёо",
    enTitle: "Math Formula",
    description: "Математик бодлого",
    slug: "math",
  },
];

export default function NewQuestionPage() {
  return (
    <div className="w-full mx-auto space-y-8 min-h-screen p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-slate-900">Шинэ асуулт үүсгэх</h1>
        <p className="text-sm text-slate-500">Асуултын мэдээлэл бөглөнө үү.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-8">
        {questionTypes.map((type, index) => (
          <Link
            key={index}
            // This now directs to /educator/new-question/[type]
            href={`/educator/new-question/${type.slug}`}
            className="group relative border-2 border-[#E5E7EB] rounded-xl p-6 min-h-45 transition-all hover:translate-y-[-4px] active:translate-y-[0px] cursor-pointer overflow-hidden flex flex-col justify-between bg-white"
            style={{ boxShadow: "0 6px 0 0 #E5E7EB" }}
          >
            {/* --- THE CLOUD EFFECT --- */}
            <div className="absolute -top-0 right-7 w-32 h-32 transition-transform group-hover:scale-110 duration-500 pointer-events-none">
              <Cloud />
            </div>

            <div className="relative z-10">
              <div className="space-y-1">
                <h3 className="text-[22px] font-bold text-slate-900 tracking-tight leading-tight">
                  {type.title}
                </h3>
                <p className="text-[15px] font-bold text-[#94A3B8]">
                  {type.enTitle}
                </p>
              </div>
            </div>

            <p className="relative z-10 text-[#7F7F7F] font-bold text-[16px] leading-snug mt-auto max-w-[85%]">
              {type.description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
