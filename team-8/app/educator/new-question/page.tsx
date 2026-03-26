import {
  CheckCircle2,
  Link2,
  AlignLeft,
  FileText,
  ListOrdered,
  Type,
  Image as ImageIcon,
  Upload,
  Variable,
} from "lucide-react";

interface QuestionType {
  title: string;
  enTitle: string;
  description: string;
  icon: React.ReactNode;
}

const questionTypes: QuestionType[] = [
  {
    title: "Олон сонголттой",
    enTitle: "Multiple Choice",
    description: "Нэг эсвэл олон зөв хариулттай",
    icon: <CheckCircle2 className="w-6 h-6" />,
  },
  {
    title: "Үнэн/Худал",
    enTitle: "True/False",
    description: "Үнэн эсвэл худал сонгох асуулт",
    icon: <Link2 className="w-6 h-6" />,
  },
  {
    title: "Богино хариулт",
    enTitle: "Short Answer",
    description: "Товч бичгээр хариулах асуулт",
    icon: <AlignLeft className="w-6 h-6" />,
  },
  {
    title: "Эссэ",
    enTitle: "Essay",
    description: "Урт хариулт шаардсан асуулт",
    icon: <FileText className="w-6 h-6" />,
  },
  {
    title: "Тааруулах",
    enTitle: "Matching",
    description: "Хослол тааруулах асуулт",
    icon: <ListOrdered className="w-6 h-6" />,
  },
  {
    title: "Хоосон зай бөглөх",
    enTitle: "Fill in the blank",
    description: "Өгүүлбэрийн хоосон зайг бөглөх",
    icon: <Type className="w-6 h-6" />,
  },
  {
    title: "Зураг дээр суурилсан",
    enTitle: "Image-based Question",
    description: "Зураг ашигласан асуулт",
    icon: <ImageIcon className="w-6 h-6" />,
  },
  {
    title: "Файл илгээх",
    enTitle: "File Upload",
    description: "Суралцагч файл илгээх асуулт",
    icon: <Upload className="w-6 h-6" />,
  },
  {
    title: "Математик томьёо",
    enTitle: "Math Formula",
    description: "Математик бодлого",
    icon: <Variable className="w-6 h-6" />,
  },
];

export default async function NewQuestionPage() {
  return (
    <div className="w-full mx-auto p-8 space-y-8  min-h-screen">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          Шинэ асуулт үүсгэх
        </h2>
        <p className="text-slate-500">Асуултын төрлөө сонгоно уу.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {questionTypes.map((type, index) => (
          <div
            key={index}
            className="group relative border-[6px] border-[#E5E7EB] rounded-[24px] p-8 min-h-[220px] transition-all hover:translate-y-[-2px] cursor-pointer overflow-hidden flex flex-col justify-between"
            style={{ boxShadow: "0 4px 0 0 #D1D5DB" }} // This creates the "thick bottom border" effect
          >
            {/* The Pastel Purple Cloud Effect */}
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#EEF2FF] rounded-full blur-2xl opacity-80 group-hover:bg-[#E0E7FF] transition-colors" />
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#F5F3FF] rounded-full blur-xl translate-x-1/4 -translate-y-1/4" />

            <div className="relative flex justify-between items-start">
              <div className="space-y-1">
                <h3 className="text-[20px] font-bold text-slate-900 tracking-tight leading-none">
                  {type.title}
                </h3>
                <p className="text-[14px] font-semibold text-[#7F7F7F]">
                  {type.enTitle}
                </p>
              </div>
              <div className="relative z-10 p-2  rounded-lg backdrop-blur-sm text-[slate-900]">
                {type.icon}
              </div>
            </div>

            <p className="relative z-10 text-[#7F7F7F] font-semibold text-[16px] leading-relaxed mt-auto pt-6">
              {type.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
