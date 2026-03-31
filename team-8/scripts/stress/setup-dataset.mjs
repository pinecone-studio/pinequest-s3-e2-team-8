import {
  STRESS_EXAM_DESCRIPTION,
  STRESS_EXAM_ID,
  STRESS_EXAM_TITLE,
  STRESS_GROUP_ID,
  STRESS_GROUP_NAME,
  STRESS_OWNER_FALLBACK_ID,
  STRESS_PASSWORD,
  STRESS_SUBJECT_ID,
  STRESS_SUBJECT_NAME,
  STRESS_USER_COUNT,
  buildPublishedSnapshot,
  buildStressExamWindow,
  buildStressQuestions,
  chunk,
  createStressRedisClient,
  createSupabaseAdminClient,
  findStressProfiles,
  getCachePayloadFromSnapshot,
  getCacheTtlSeconds,
  getStressEmail,
  getStressFullName,
  getStressQuestionCacheKey,
} from "./shared.mjs";

async function getOwnerId(supabase) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.id ?? STRESS_OWNER_FALLBACK_ID;
}

async function ensureStressUsers(supabase) {
  const existingProfiles = await findStressProfiles(supabase);
  const existingByEmail = new Map(
    existingProfiles.map((profile) => [String(profile.email), profile])
  );

  const missing = [];
  for (let index = 1; index <= STRESS_USER_COUNT; index += 1) {
    const email = getStressEmail(index);
    if (!existingByEmail.has(email)) {
      missing.push({ email, fullName: getStressFullName(index) });
    }
  }

  for (const batch of chunk(missing, 20)) {
    await Promise.all(
      batch.map(async (user) => {
        const { error } = await supabase.auth.admin.createUser({
          email: user.email,
          password: STRESS_PASSWORD,
          email_confirm: true,
          user_metadata: {
            full_name: user.fullName,
            role: "student",
          },
        });

        if (error) {
          throw new Error(`Failed to create ${user.email}: ${error.message}`);
        }
      })
    );
  }

  let profiles = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    profiles = await findStressProfiles(supabase);
    if (profiles.length >= STRESS_USER_COUNT) break;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  if (profiles.length !== STRESS_USER_COUNT) {
    throw new Error(
      `Expected ${STRESS_USER_COUNT} stress profiles, found ${profiles.length}.`
    );
  }

  return profiles;
}

async function ensureSubject(supabase, ownerId) {
  const { error } = await supabase.from("subjects").upsert(
    {
      id: STRESS_SUBJECT_ID,
      name: STRESS_SUBJECT_NAME,
      description: "Dedicated subject for Problem 5 stress tests.",
      created_by: ownerId,
    },
    { onConflict: "id" }
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function ensureGroup(supabase, ownerId) {
  const { error: groupError } = await supabase.from("student_groups").upsert(
    {
      id: STRESS_GROUP_ID,
      name: STRESS_GROUP_NAME,
      grade: 12,
      group_type: "class",
      subject_id: STRESS_SUBJECT_ID,
      created_by: ownerId,
    },
    { onConflict: "id" }
  );

  if (groupError) {
    throw new Error(groupError.message);
  }
}

async function syncGroupMembers(supabase, studentProfiles) {
  const { error: deleteError } = await supabase
    .from("student_group_members")
    .delete()
    .eq("group_id", STRESS_GROUP_ID);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  for (const batch of chunk(studentProfiles, 200)) {
    const rows = batch.map((profile) => ({
      group_id: STRESS_GROUP_ID,
      student_id: profile.id,
    }));

    const { error } = await supabase
      .from("student_group_members")
      .insert(rows);

    if (error) {
      throw new Error(error.message);
    }
  }
}

async function ensureExam(supabase, ownerId, window) {
  const { error } = await supabase.from("exams").upsert(
    {
      id: STRESS_EXAM_ID,
      title: STRESS_EXAM_TITLE,
      description: STRESS_EXAM_DESCRIPTION,
      subject_id: STRESS_SUBJECT_ID,
      created_by: ownerId,
      start_time: window.startTime,
      end_time: window.endTime,
      duration_minutes: window.durationMinutes,
      is_published: true,
      max_attempts: 1,
      shuffle_questions: false,
      shuffle_options: false,
      passing_score: 60,
      proctoring_mode: "off",
      device_policy: "any",
      require_fullscreen: false,
      require_camera: false,
      identity_verification: false,
      evidence_mode: "metadata_only",
      post_exam_similarity_enabled: false,
      published_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function replaceQuestions(supabase, questions) {
  const { error: deleteError } = await supabase
    .from("questions")
    .delete()
    .eq("exam_id", STRESS_EXAM_ID);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  for (const batch of chunk(questions, 100)) {
    const { error } = await supabase.from("questions").insert(batch);
    if (error) {
      throw new Error(error.message);
    }
  }
}

async function syncAssignmentsAndRecipients(supabase, ownerId, studentProfiles) {
  const { error: assignmentError } = await supabase
    .from("exam_assignments")
    .upsert(
      {
        exam_id: STRESS_EXAM_ID,
        group_id: STRESS_GROUP_ID,
        assigned_by: ownerId,
      },
      { onConflict: "exam_id,group_id" }
    );

  if (assignmentError) {
    throw new Error(assignmentError.message);
  }

  const { error: deleteRecipientsError } = await supabase
    .from("exam_recipients")
    .delete()
    .eq("exam_id", STRESS_EXAM_ID);

  if (deleteRecipientsError) {
    throw new Error(deleteRecipientsError.message);
  }

  for (const batch of chunk(studentProfiles, 200)) {
    const rows = batch.map((profile) => ({
      exam_id: STRESS_EXAM_ID,
      student_id: profile.id,
      assigned_by: ownerId,
    }));

    const { error } = await supabase.from("exam_recipients").insert(rows);
    if (error) {
      throw new Error(error.message);
    }
  }
}

async function updatePublishedSnapshot(
  supabase,
  redis,
  ownerId,
  studentProfiles,
  questions,
  window
) {
  const publishedAt = new Date().toISOString();
  const snapshot = buildPublishedSnapshot({
    ownerId,
    subjectId: STRESS_SUBJECT_ID,
    questions,
    assignedStudentCount: studentProfiles.length,
    startTime: window.startTime,
    endTime: window.endTime,
    durationMinutes: window.durationMinutes,
    publishedAt,
  });

  const { error } = await supabase
    .from("exams")
    .update({
      published_snapshot: snapshot,
      published_at: publishedAt,
      is_published: true,
    })
    .eq("id", STRESS_EXAM_ID);

  if (error) {
    throw new Error(error.message);
  }

  const cachePayload = getCachePayloadFromSnapshot(snapshot);
  await redis.set(getStressQuestionCacheKey(), JSON.stringify(cachePayload), {
    ex: getCacheTtlSeconds(window.endTime, window.durationMinutes),
  });
}

async function main() {
  const supabase = createSupabaseAdminClient();
  const redis = createStressRedisClient();
  const ownerId = await getOwnerId(supabase);
  const window = buildStressExamWindow();

  await ensureSubject(supabase, ownerId);
  const studentProfiles = await ensureStressUsers(supabase);
  await ensureGroup(supabase, ownerId);
  await syncGroupMembers(supabase, studentProfiles);
  await ensureExam(supabase, ownerId, window);
  const questions = buildStressQuestions(STRESS_SUBJECT_ID, ownerId);
  await replaceQuestions(supabase, questions);
  await syncAssignmentsAndRecipients(supabase, ownerId, studentProfiles);
  await updatePublishedSnapshot(
    supabase,
    redis,
    ownerId,
    studentProfiles,
    questions,
    window
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        examId: STRESS_EXAM_ID,
        subjectId: STRESS_SUBJECT_ID,
        groupId: STRESS_GROUP_ID,
        studentCount: studentProfiles.length,
        password: STRESS_PASSWORD,
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
