import Link from "next/link";
import { getGroups } from "@/lib/group/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import CreateGroupForm from "./_features/CreateGroupForm";

export default async function GroupsPage() {
  const groups = await getGroups();

  const groupTypeLabel: Record<string, string> = {
    class: "Анги",
    elective: "Сонголт",
    mixed: "Холимог",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Бүлгүүд</h2>
          <p className="text-muted-foreground">
            Сурагчдын бүлэг удирдах, шалгалт оноох
          </p>
        </div>
      </div>

      {/* Бүлэг үүсгэх форм */}
      <CreateGroupForm />

      {/* Бүлгийн жагсаалт */}
      {groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-10 text-center text-muted-foreground">
            <Users className="mb-2 h-8 w-8" />
            <p>Бүлэг байхгүй байна. Дээрх формоор шинэ бүлэг үүсгэнэ үү.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const memberCount = (group as any).student_group_members?.[0]?.count ?? 0;
            return (
              <Link key={group.id} href={`/educator/groups/${group.id}`}>
                <Card className="cursor-pointer transition-shadow hover:shadow-md">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{group.name}</CardTitle>
                      <Badge variant="outline">
                        {groupTypeLabel[group.group_type] || group.group_type}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {group.grade && (
                        <span>{group.grade}-р анги</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {memberCount} сурагч
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
