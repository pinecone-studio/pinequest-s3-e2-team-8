import { redirect } from "next/navigation";
import { getSessionForGrading } from "@/lib/grading/actions";
import GradingForm from "./_features/GradingForm";

export default async function GradingDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const data = await getSessionForGrading(sessionId);

  if (!data) redirect("/educator/grading");

  return (
    <GradingForm
      session={data.session}
      answers={data.answers}
      proctorEvents={data.proctorEvents}
    />
  );
}
