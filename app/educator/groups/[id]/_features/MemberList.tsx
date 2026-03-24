"use client";

import { useState } from "react";
import { removeMemberFromGroup } from "@/lib/group/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Member {
  student_id: string;
  joined_at: string;
  profiles?: {
    id: string;
    email: string;
    full_name: string;
  } | null;
}

interface MemberListProps {
  groupId: string;
  members: Member[];
}

export default function MemberList({ groupId, members }: MemberListProps) {
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
            <div className="min-w-0">
              <p className="font-medium">
                {member.profiles?.full_name || "Нэргүй сурагч"}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {member.profiles?.email || "Имэйлгүй"}
              </p>
            </div>
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
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
