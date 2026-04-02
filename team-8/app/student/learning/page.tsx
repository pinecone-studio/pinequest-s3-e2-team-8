import Link from "next/link";
import { getStudentLearningPageData } from "@/lib/student-learning/actions";
import type {
  StudentLearningSubjectSummary,
  StudentLearningTopicSummary,
} from "@/types";
import StudyPlanPanel from "./_features/StudyPlanPanel";
import PracticeBuilder from "./_features/PracticeBuilder";
import LearningAutoRefresh from "./_features/LearningAutoRefresh";

const LEARNING_ERROR_MESSAGES: Record<string, string> = {
  practice_empty:
    "Practice шалгалтын өгөгдөл дутуу байна. Шинээр practice үүсгээд дахин оролдоно уу.",
};

const RING_COLORS = ["#DED15B", "#FBC62F", "#F7A23B", "#F75D5F"] as const;

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="space-y-2">
      <h2 className="text-[24px] font-semibold leading-[120%] text-black">
        {title}
      </h2>
      <p className="text-[14px] font-normal leading-[140%] text-[#6B6B6B]">
        {subtitle}
      </p>
    </div>
  );
}

function getOverviewLegendTopics({
  isActive,
  activeTopics,
  subject,
}: {
  isActive: boolean;
  activeTopics: StudentLearningTopicSummary[];
  subject: StudentLearningSubjectSummary;
}) {
  if (isActive && activeTopics.length > 0) {
    return activeTopics.slice(0, 4).map((topic) => ({
      label: topic.topic_label,
      value: Math.round(topic.mastery_score),
    }));
  }

  return [
    {
      label: `${subject.subject_name} ерөнхий mastery`,
      value: Math.round(subject.mastery_score),
    },
    {
      label: "Сул сэдвийн тоо",
      value: subject.weak_topic_count,
    },
    {
      label: "Official асуултууд",
      value: subject.official_question_count,
    },
    {
      label: "Practice асуултууд",
      value: subject.practice_question_count,
    },
  ];
}

function SubjectRings({ values }: { values: number[] }) {
  return (
    <svg viewBox="0 0 220 220" className="h-[190px] w-[190px]">
      {values.slice(0, 4).map((value, index) => {
        const radius = 84 - index * 17;
        const circumference = 2 * Math.PI * radius;
        const progress = Math.max(8, Math.min(100, value));
        const dash = `${(circumference * progress) / 100} ${circumference}`;

        return (
          <g key={`${radius}-${index}`}>
            <circle
              cx="110"
              cy="110"
              r={radius}
              fill="none"
              stroke="#F4F4F5"
              strokeWidth="11"
            />
            <circle
              cx="110"
              cy="110"
              r={radius}
              fill="none"
              stroke={RING_COLORS[index]}
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={dash}
              transform="rotate(-90 110 110)"
            />
          </g>
        );
      })}
      <circle cx="110" cy="110" r="24" fill="#FAFAFA" />
    </svg>
  );
}

function SubjectOverviewCard({
  subject,
  isActive,
  topics,
}: {
  subject: StudentLearningSubjectSummary;
  isActive: boolean;
  topics: StudentLearningTopicSummary[];
}) {
  const legendTopics = getOverviewLegendTopics({
    isActive,
    activeTopics: topics,
    subject,
  });

  return (
    <Link
      href={`/student/learning?subject=${subject.subject_id}`}
      className={`block min-h-[299px] rounded-[16px] border bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.08)] transition ${
        isActive
          ? "border-[#D5C4FF] ring-2 ring-[#7F32F5]/10"
          : "border-[#ECECEC] hover:border-[#D5C4FF]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[18px] font-semibold leading-[120%] text-[#111111]">
            {subject.subject_name}
          </p>
          <p className="text-[14px] font-normal leading-[120%] text-[#6B6B6B]">
            Тааруухан сэдвүүд
          </p>
        </div>
        <p className="text-[32px] font-semibold leading-none text-[#111111]">
          {Math.round(subject.mastery_score)}%
        </p>
      </div>

      <div className="mt-6 grid grid-cols-[190px_minmax(0,1fr)] items-center gap-4">
        <SubjectRings values={legendTopics.map((topic) => topic.value)} />

        <div className="space-y-4">
          {legendTopics.map((topic, index) => (
            <div
              key={`${subject.subject_id}-${topic.label}`}
              className="flex items-center justify-between gap-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="h-[10px] w-[10px] shrink-0 rounded-full"
                  style={{ backgroundColor: RING_COLORS[index] }}
                />
                <span className="truncate text-[13px] font-medium leading-[120%] text-[#4C4C4C]">
                  {topic.label}
                </span>
              </div>
              <span className="shrink-0 text-[13px] font-semibold leading-[120%] text-[#111111]">
                {topic.value}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {subject.needs_topic_backfill ? (
        <p className="mt-4 text-xs text-amber-600">
          Topic breakdown хараахан бүрэн бэлэн болоогүй байна.
        </p>
      ) : null}
    </Link>
  );
}

function LearningPageHeader() {
  return (
    <SectionHeader
      title="Learning Hub"
      subtitle="Сул сэдвүүдээ харж, AI study plan авч, зөвхөн өөртөө practice шалгалт өгнө."
    />
  );
}

export default async function StudentLearningPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; error?: string }>;
}) {
  const { subject: requestedSubjectId, error: requestedError } =
    await searchParams;
  const pageData = await getStudentLearningPageData(requestedSubjectId);

  if ("error" in pageData) {
    return (
      <div className="mx-auto w-full max-w-[1120px] space-y-10 px-2 pb-10 xl:w-[1120px] xl:max-w-[1120px]">
        <LearningPageHeader />
        <div className="rounded-[20px] border border-[#ECECEC] bg-white px-8 py-12 text-center text-[14px] text-[#6B6B6B] shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          {pageData.error}
        </div>
      </div>
    );
  }

  const { overview, selectedSubject, studyPlan: studyPlanState } = pageData;
  const studyPlanResult =
    studyPlanState && !("error" in studyPlanState) ? studyPlanState : null;

  if (overview.subjects.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1120px] space-y-10 px-2 pb-10 xl:w-[1120px] xl:max-w-[1120px]">
        <LearningAutoRefresh active={overview.isRefreshing} />
        <LearningPageHeader />
        <div className="rounded-[20px] border border-[#ECECEC] bg-white px-8 py-12 text-center text-[14px] text-[#6B6B6B] shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          {overview.isRefreshing
            ? "Mastery profile шинэчлэгдэж байна. Түр хүлээгээд дахин шалгана уу."
            : "Одоогоор weak-topic profile үүсгэх хангалттай data алга."}
        </div>
      </div>
    );
  }

  if (!overview.selectedSubjectId || !selectedSubject) {
    return (
      <div className="mx-auto w-full max-w-[1120px] space-y-10 px-2 pb-10 xl:w-[1120px] xl:max-w-[1120px]">
        <LearningAutoRefresh active={overview.isRefreshing} />
        <LearningPageHeader />
        <div className="rounded-[20px] border border-[#ECECEC] bg-white px-8 py-12 text-center text-[14px] text-[#6B6B6B] shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          Хичээлийн learning data олдсонгүй.
        </div>
      </div>
    );
  }

  const selectedSubjectId = overview.selectedSubjectId;
  const subjectLearning = selectedSubject;
  const plan = studyPlanResult?.plan ?? null;
  const isStale = studyPlanResult?.isStale ?? false;

  return (
    <div className="mx-auto w-full max-w-[1120px] space-y-10 px-2 pb-10 pt-2 xl:w-[1120px] xl:max-w-[1120px]">
      <LearningAutoRefresh
        active={
          Boolean(overview.isRefreshing) ||
          studyPlanResult?.status === "pending"
        }
        subjectId={selectedSubjectId}
      />

      <LearningPageHeader />

      {requestedError && LEARNING_ERROR_MESSAGES[requestedError] ? (
        <div className="rounded-[16px] border border-amber-300 bg-amber-50 px-5 py-4 text-[14px] text-amber-800">
          {LEARNING_ERROR_MESSAGES[requestedError]}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {overview.subjects.map((subject) => (
          <SubjectOverviewCard
            key={subject.subject_id}
            subject={subject}
            isActive={subject.subject_id === selectedSubjectId}
            topics={
              subject.subject_id === selectedSubjectId
                ? subjectLearning.topics
                : []
            }
          />
        ))}
      </div>

      <section className="space-y-12 rounded-[32px] border border-transparent bg-[linear-gradient(180deg,#F4EEFA_0%,#FBF8FE_42%,#FFFFFF_100%)] px-7 py-8 shadow-[0_18px_40px_rgba(127,50,245,0.08)]">
        <StudyPlanPanel
          subjectId={selectedSubjectId}
          plan={plan}
          isStale={isStale}
          status={studyPlanResult?.status ?? "idle"}
          lastError={studyPlanResult?.lastError ?? null}
          isRefreshing={
            Boolean(subjectLearning.isRefreshing) ||
            Boolean(studyPlanResult?.isRefreshing)
          }
          disabled={subjectLearning.topics.length === 0}
        />

        <PracticeBuilder
          key={selectedSubjectId}
          subjectId={selectedSubjectId}
          subjectName={subjectLearning.subject.subject_name}
          topics={subjectLearning.topics}
          practiceHistory={subjectLearning.practiceHistory}
        />
      </section>
    </div>
  );
}
