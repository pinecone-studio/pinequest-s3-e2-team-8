import Link from "next/link";
import { getExams } from "@/lib/exam/actions";
import { Button } from "@/components/ui/button";
import ExamList from "./_features/ExamList";
import { PlusCircle } from "lucide-react";

export default async function ExamsPage() {
  const exams = await getExams();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Шалгалтууд</h2>
          <p className="text-muted-foreground">Таны үүсгэсэн бүх шалгалтууд</p>
        </div>
        <Link href="/educator/create-exam">
          <Button>
            <PlusCircle className="mr-2 h-4 w-4" />
            Шалгалт үүсгэх
          </Button>
        </Link>
      </div>
      <ExamList exams={exams as Parameters<typeof ExamList>[0]["exams"]} />
    </div>
  );
}
