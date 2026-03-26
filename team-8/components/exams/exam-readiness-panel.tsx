import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  ListChecks,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ExamReadiness } from "@/lib/exam-readiness";

function getStatusIcon(status: "complete" | "warning" | "blocked") {
  if (status === "complete") {
    return <CheckCircle2 className="h-4 w-4 text-foreground" />;
  }

  return <AlertTriangle className="h-4 w-4 text-amber-600" />;
}

function getStatusBadge(readiness: ExamReadiness) {
  return {
    label: readiness.lifecycle.label,
    variant: readiness.lifecycle.variant,
  };
}

function getGroupTypeLabel(groupType: string) {
  if (groupType === "class") return "Анги";
  if (groupType === "elective") return "Сонгон";
  if (groupType === "mixed") return "Холимог";
  return groupType;
}

export default function ExamReadinessPanel({
  readiness,
  examId,
  className,
}: {
  readiness: ExamReadiness;
  examId: string;
  className?: string;
}) {
  const statusBadge = getStatusBadge(readiness);
  const actionableChecks = readiness.checks.filter(
    (check) => check.status !== "complete"
  );

  return (
    <Card className={cn("border-border/80", className)}>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Шалгалтын бэлэн байдал</CardTitle>
          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
          {readiness.blockedCount > 0 && (
            <Badge variant="outline">{readiness.blockedCount} blocker</Badge>
          )}
          {readiness.warningCount > 0 && (
            <Badge variant="outline">{readiness.warningCount} анхааруулга</Badge>
          )}
        </div>
        <CardDescription>
          {readiness.lifecycle.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ClipboardList className="h-3.5 w-3.5" />
              Агуулга
            </div>
            <p className="mt-2 text-base font-semibold">
              {readiness.questionCount} асуулт · {readiness.totalPoints} оноо
            </p>
            <p className="text-xs text-muted-foreground">
              {readiness.passageCount} passage block
              {readiness.essayCount > 0
                ? ` · ${readiness.essayCount} essay`
                : " · Бүгд автоматаар дүнлэнэ"}
            </p>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              Хамрах хүрээ
            </div>
            <p className="mt-2 text-base font-semibold">
              {readiness.assignmentCount} бүлэг · {readiness.assignedStudentCount} сурагч
            </p>
            <p className="text-xs text-muted-foreground">
              Assignment-аа шалгаад, шаардлагатай бол бүлэг нэмнэ.
            </p>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" />
              Хуваарь
            </div>
            <p className="mt-2 text-base font-semibold">
              {readiness.durationMinutes} / {readiness.scheduleWindowMinutes} минут
            </p>
            <p className="text-xs text-muted-foreground">
              {readiness.conflictMessage ? "Давхцал илэрсэн" : "Давхцалгүй"}
            </p>
          </div>
        </div>

        {actionableChecks.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">Нийтлэхийн өмнө анхаарах зүйлс</p>
            {actionableChecks.map((check) => (
              <div
                key={check.key}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5",
                  check.status === "blocked" && "border-amber-300/70 bg-amber-50/40",
                  check.status === "warning" && "border-amber-200/70 bg-amber-50/20"
                )}
              >
                <div className="mt-0.5">{getStatusIcon(check.status)}</div>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{check.label}</p>
                  <p className="text-sm text-muted-foreground">{check.description}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border bg-muted/10 px-3 py-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 text-foreground" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Нийтлэхэд бэлэн байна</p>
              <p className="text-sm text-muted-foreground">
                Хичээл, хуваарь, бүлэг, хамрагдах сурагчийн мэдээлэл бүрэн байна.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm font-medium">Оноосон бүлгүүд</p>
          {readiness.assignedGroups.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {readiness.assignedGroups.map((group) => (
                <Badge key={group.id} variant="outline" className="h-auto py-1">
                  {group.name}
                  {group.grade ? ` · ${group.grade}-р анги` : ""}
                  {` · ${getGroupTypeLabel(group.group_type)}`}
                  {` · ${group.member_count} сурагч`}
                </Badge>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Одоогоор нэг ч бүлэгт оноогоогүй байна. Бүлэгт оноосны дараа
              шалгалт сурагчдад харагдана.
            </div>
          )}
        </div>

        {readiness.conflictMessage && (
          <div className="rounded-lg border border-amber-300/70 bg-amber-50/40 p-3 text-sm">
            <p className="font-medium">Хуваарийн зөрчил илэрсэн</p>
            <p className="mt-1 text-muted-foreground">{readiness.conflictMessage}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-3 text-sm">
          <Link
            href={`/educator/exams/${examId}/edit`}
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Хуваарь, тохиргоо засах
          </Link>
          <Link
            href="/educator/groups"
            className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Бүлэг, assignment-аа шалгах
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
