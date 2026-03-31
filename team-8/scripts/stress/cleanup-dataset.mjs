import {
  STRESS_EXAM_ID,
  STRESS_GROUP_ID,
  STRESS_SUBJECT_ID,
  createStressRedisClient,
  createSupabaseAdminClient,
  findStressProfiles,
  getStressQuestionCacheKey,
} from "./shared.mjs";

async function cleanupExamArtifacts(supabase, redis) {
  const { data: sessions, error: sessionError } = await supabase
    .from("exam_sessions")
    .select("id, user_id")
    .eq("exam_id", STRESS_EXAM_ID);

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  for (const session of sessions ?? []) {
    const sessionId = String(session.id);
    const userId = String(session.user_id);
    await Promise.allSettled([
      redis.del(`session:${sessionId}:user:${userId}:answers`),
      redis.del(`session:${sessionId}:user:${userId}:answer-meta`),
      redis.del(`session:${sessionId}:user:${userId}:meta`),
      redis.del(`heartbeat:session:${sessionId}`),
      redis.del(`lock:exam-submit:${sessionId}`),
    ]);
  }

  await redis.del(getStressQuestionCacheKey());

  const deleteQueries = [
    supabase.from("exam_recipients").delete().eq("exam_id", STRESS_EXAM_ID),
    supabase.from("exam_assignments").delete().eq("exam_id", STRESS_EXAM_ID),
    supabase.from("questions").delete().eq("exam_id", STRESS_EXAM_ID),
    supabase.from("exams").delete().eq("id", STRESS_EXAM_ID),
    supabase.from("student_group_members").delete().eq("group_id", STRESS_GROUP_ID),
    supabase.from("student_groups").delete().eq("id", STRESS_GROUP_ID),
    supabase.from("subjects").delete().eq("id", STRESS_SUBJECT_ID),
  ];

  for (const query of deleteQueries) {
    const { error } = await query;
    if (error) {
      throw new Error(error.message);
    }
  }
}

async function cleanupStressUsers(supabase) {
  const profiles = await findStressProfiles(supabase);

  for (const profile of profiles) {
    const { error } = await supabase.auth.admin.deleteUser(String(profile.id));
    if (error) {
      throw new Error(`Failed to delete ${profile.email}: ${error.message}`);
    }
  }

  return profiles.length;
}

async function main() {
  const supabase = createSupabaseAdminClient();
  const redis = createStressRedisClient();
  await cleanupExamArtifacts(supabase, redis);
  const deletedUsers = await cleanupStressUsers(supabase);

  console.log(
    JSON.stringify(
      {
        ok: true,
        examId: STRESS_EXAM_ID,
        deletedUsers,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
