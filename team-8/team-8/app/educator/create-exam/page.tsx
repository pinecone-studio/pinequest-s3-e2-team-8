import ExamForm from "./_features/ExamForm";

export default function CreateExamPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Шалгалт үүсгэх</h2>
        <p className="text-muted-foreground">
          Шалгалтын мэдээллийг оруулна уу. Дараа нь асуулт нэмэх боломжтой.
        </p>
      </div>
      <ExamForm />
    </div>
  );
}
