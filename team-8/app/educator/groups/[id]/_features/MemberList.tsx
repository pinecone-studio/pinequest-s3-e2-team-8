"use client";

import { useState } from "react";
import { removeMemberFromGroup } from "@/lib/group/actions";
import StudentIdentity from "@/components/profile/StudentIdentity";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Member {
  student_id: string;
  joined_at: string;
  profiles?: {
    id: string;
    email: string;
    full_name: string;
    avatar_url: string | null;
  } | null;
}

interface MemberListProps {
  groupId: string;
  members: Member[];
  canManage: boolean;
}

export default function MemberList({
  groupId,
  members,
  canManage,
}: MemberListProps) {
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleRemove(studentId: string) {
    setRemovingId(studentId);
    await removeMemberFromGroup(groupId, studentId);
    setRemovingId(null);
  }

  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Одоогоор бүлэгт сурагч нэмээгүй байна.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {members.map((member) => (
        <Card key={member.student_id}>
          <CardContent className="flex items-center justify-between gap-4 pt-4">
            <StudentIdentity
              name={member.profiles?.full_name || "Нэргүй сурагч"}
              email={member.profiles?.email || "Имэйлгүй"}
              avatarUrl={member.profiles?.avatar_url}
              size="sm"
              className="min-w-0 flex-1"
            />
            {canManage && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={removingId === member.student_id}
                onClick={() => handleRemove(member.student_id)}
              >
                {removingId === member.student_id ? "..." : "Хасах"}
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
