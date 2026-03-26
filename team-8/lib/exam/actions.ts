"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { syncExamRecipients } from "@/lib/exam-recipients";
import {
  getAllowedGroupIds,
  getAllowedSubjectIds,
} from "@/lib/teacher/permissions";

export async function createExam(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const duration_minutes = parseInt(formData.get("duration_minutes") as string);
  const subject_id = ((formData.get("subject_id") as string) || "").trim() || null;
  const group_id = ((formData.get("group_id") as string) || "").trim() || null;
  // datetime-local input өгөгдлийг UB цагаар хадгалах (+08:00)
  const start_time = (formData.get("start_time") as string) + "+08:00";
  const end_time = (formData.get("end_time") as string) + "+08:00";
  const passing_score = parseFloat(formData.get("passing_score") as string) || 60;
  const max_attempts = parseInt(formData.get("max_attempts") as string) || 1;
  const shuffle_questions = formData.get("shuffle_questions") === "on";
  const shuffle_options = formData.get("shuffle_options") === "on";

  if (!title || !start_time || !end_time || !duration_minutes) {
    return { error: "Бүх талбарыг бөглөнө үү" };
  }

  if (new Date(start_time).getTime() >= new Date(end_time).getTime()) {
    return { error: "Дуусах цаг нь эхлэх цагаасаа хойш байх ёстой" };
  }

  // Subject permission check (strict)
  const allowedIds = await getAllowedSubjectIds(supabase, user.id);
  if (allowedIds !== null) {
    // Non-admin teacher
    if (!subject_id) {
      return { error: "Хичээл заавал сонгоно уу" };
    }
    if (!allowedIds.includes(subject_id)) {
      return { error: "Энэ хичээлийн шалгалт үүсгэх эрх байхгүй байна" };
    }
  }

  if (group_id) {
    if (allowedIds !== null) {
      if (!subject_id) {
        return { error: "Хичээл заавал сонгоно уу" };
      }

      const allowedGroupIds = await getAllowedGroupIds(
        supabase,
        user.id,
        subject_id
      ) ?? [];

      if (!allowedGroupIds.includes(group_id)) {
        return { error: "Энэ бүлэгт энэ хичээлийн шалгалт оноох эрх байхгүй байна" };
      }
    }

    const { data: group } = await supabase
      .from("student_groups")
      .select("id")
      .eq("id", group_id)
      .maybeSingle();

    if (!group) return { error: "Сонгосон бүлэг олдсонгүй" };
  }

  const { data, error } = await supabase
    .from("exams")
    .insert({
      title,
      description: description || null,
      subject_id,
      created_by: user.id,
      start_time,
      end_time,
      duration_minutes,
      passing_score,
      max_attempts,
      shuffle_questions,
      shuffle_options,
      is_published: false,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  if (group_id) {
    const { error: assignmentError } = await supabase.rpc(
      "assign_exam_to_group",
      {
        p_exam_id: data.id,
        p_group_id: group_id,
        p_assigned_by: user.id,
      }
    );

    if (assignmentError) {
      await supabase
        .from("exams")
        .delete()
        .eq("id", data.id)
        .eq("created_by", user.id);
      return { error: assignmentError.message };
    }
  }

  revalidatePath("/educator");
  redirect(`/educator/exams/${data.id}/questions`);
}

export async function updateExam(examId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: existingExam } = await supabase
    .from("exams")
    .select("id, is_published")
    .eq("id", examId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (!existingExam) return { error: "Шалгалт олдсонгүй" };
  if (existingExam.is_published) {
    return { error: "Нийтлэгдсэн шалгалтыг өөрчлөх боломжгүй" };
  }

  const start_time = (formData.get("start_time") as string) + "+08:00";
  const end_time = (formData.get("end_time") as string) + "+08:00";
  const subject_id = ((formData.get("subject_id") as string) || "").trim() || null;

  if (new Date(start_time).getTime() >= new Date(end_time).getTime()) {
    return { error: "Дуусах цаг нь эхлэх цагаасаа хойш байх ёстой" };
  }

  // Subject permission check (strict)
  const allowedIds = await getAllowedSubjectIds(supabase, user.id);
  if (allowedIds !== null) {
    if (!subject_id) {
      return { error: "Хичээл заавал сонгоно уу" };
    }
    if (!allowedIds.includes(subject_id)) {
      return { error: "Энэ хичээлийн шалгалт үүсгэх эрх байхгүй байна" };
    }
  }

  const { error } = await supabase
    .from("exams")
    .update({
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || null,
      subject_id,
      duration_minutes: parseInt(formData.get("duration_minutes") as string),
      start_time,
      end_time,
      passing_score: parseFloat(formData.get("passing_score") as string) || 60,
      max_attempts: parseInt(formData.get("max_attempts") as string) || 1,
      shuffle_questions: formData.get("shuffle_questions") === "on",
      shuffle_options: formData.get("shuffle_options") === "on",
    })
    .eq("id", examId)
    .eq("created_by", user.id);

  if (error) return { error: error.message };

  revalidatePath("/educator");
  revalidatePath(`/educator/exams/${examId}`);
  return { success: true };
}

export async function publishExam(examId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { data: exam } = await supabase
    .from("exams")
    .select("id, is_published")
    .eq("id", examId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (!exam) return { error: "Шалгалт олдсонгүй" };

  const { count: questionCount } = await supabase
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId);

  if (!questionCount || questionCount <= 0) {
    return { error: "Нийтлэхийн өмнө дор хаяж 1 асуулт нэмнэ үү" };
  }

  const syncResult = await syncExamRecipients(supabase, examId, user.id);
  if (!syncResult.success) {
    return { error: syncResult.error };
  }

  const { error } = await supabase
    .from("exams")
    .update({ is_published: true })
    .eq("id", examId)
    .eq("created_by", user.id);

  if (error) return { error: error.message };

  revalidatePath("/educator");
  revalidatePath(`/educator/exams/${examId}`);
  return { success: true };
}

export async function deleteExam(examId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Нэвтрээгүй байна" };

  const { error } = await supabase
    .from("exams")
    .delete()
    .eq("id", examId)
    .eq("created_by", user.id);

  if (error) return { error: error.message };

  revalidatePath("/educator");
  redirect("/educator");
}

export async function getExams() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("exams")
    .select("*, subjects(name), questions(count)")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getExamById(examId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("exams")
    .select("*, subjects(name), questions(*)")
    .eq("id", examId)
    .eq("created_by", user.id)
    .maybeSingle();

  return data;
}

/**
 * Шалгалтын бүх оролцогчдын дүнг нэгтгэн буцаана.
 * Багш өөрийн болон teaching scope-ийн шалгалтыг харж болно.
 * Admin бүх шалгалтыг харж болно.
 */
export async function getExamResults(examId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isAdmin = profile?.role === "admin";

  // Шалгалтын мэдээлэл авах
  const { data: exam } = await supabase
    .from("exams")
    .select("id, title, passing_score, subject_id, created_by, subjects(name)")
    .eq("id", examId)
    .maybeSingle();

  if (!exam) return null;

  // Эрх шалгах: admin эсвэл эзэн эсвэл teaching assignment-тай teacher
  if (!isAdmin && exam.created_by !== user.id) {
    const { data: examAssignments } = await supabase
      .from("exam_assignments")
      .select("group_id")
      .eq("exam_id", examId);

    const groupIds = (examAssignments ?? []).map((a) => a.group_id);

    if (groupIds.length > 0 && exam.subject_id) {
      const { data: ta } = await supabase
        .from("teaching_assignments")
        .select("id")
        .eq("teacher_id", user.id)
        .eq("subject_id", exam.subject_id)
        .in("group_id", groupIds)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (!ta) return null;
    } else {
      return null;
    }
  }

  // Энэ шалгалтад хамаарах бүлгүүд
  const { data: assignmentRows } = await supabase
    .from("exam_assignments")
    .select("group_id, student_groups(id, name)")
    .eq("exam_id", examId);

  const groups = (assignmentRows ?? []).flatMap((r) => {
    const g = Array.isArray(r.student_groups) ? r.student_groups[0] : r.student_groups;
    return g ? [g as { id: string; name: string }] : [];
  });

  // Сурагч бүрийн харьяалах group-ийг олох
  const groupIds = groups.map((g) => g.id);
  const memberRows = groupIds.length > 0
    ? (await supabase
        .from("student_group_members")
        .select("student_id, group_id")
        .in("group_id", groupIds)).data ?? []
    : [];

  const studentGroupMap = new Map<string, string[]>();
  for (const m of memberRows) {
    const existing = studentGroupMap.get(m.student_id) ?? [];
    existing.push(m.group_id);
    studentGroupMap.set(m.student_id, existing);
  }

  // Бүх session авах (submitted + graded)
  const { data: sessions } = await supabase
    .from("exam_sessions")
    .select("id, user_id, status, total_score, max_score, submitted_at, profiles(full_name, email)")
    .eq("exam_id", examId)
    .in("status", ["submitted", "graded"])
    .order("submitted_at", { ascending: true });

  const passingScore = exam.passing_score ?? 60;

  const sessionResults = (sessions ?? []).map((s) => {
    const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
    const totalScore = Number(s.total_score ?? 0);
    const maxScore = Number(s.max_score ?? 0);
    const percentage = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
    const studentGroupIds = studentGroupMap.get(s.user_id) ?? [];
    const studentGroups = groups.filter((g) => studentGroupIds.includes(g.id));

    return {
      session_id: s.id,
      student_id: s.user_id,
      student_name: profile?.full_name ?? "—",
      student_email: profile?.email ?? "—",
      total_score: totalScore,
      max_score: maxScore,
      percentage,
      status: s.status as "submitted" | "graded",
      submitted_at: s.submitted_at,
      passed: percentage >= passingScore,
      groups: studentGroups,
    };
  });

  // Нийт статистик
  const total = sessionResults.length;
  const passCount = sessionResults.filter((s) => s.passed).length;
  const avgScore = total > 0
    ? Math.round(sessionResults.reduce((sum, s) => sum + s.percentage, 0) / total)
    : 0;

  return {
    exam: {
      id: exam.id,
      title: exam.title,
      passing_score: passingScore,
      subject: Array.isArray(exam.subjects) ? exam.subjects[0] ?? null : exam.subjects,
    },
    sessions: sessionResults,
    stats: {
      total,
      submitted: sessionResults.filter((s) => s.status === "submitted").length,
      graded: sessionResults.filter((s) => s.status === "graded").length,
      avgScore,
      passCount,
      passRate: total > 0 ? Math.round((passCount / total) * 100) : 0,
    },
    groups,
  };
}
