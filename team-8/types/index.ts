export type UserRole = "student" | "teacher" | "admin";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subject {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Exam {
  id: string;
  title: string;
  description: string | null;
  subject_id: string | null;
  created_by: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  is_published: boolean;
  max_attempts: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  passing_score: number | null;
  created_at: string;
  updated_at: string;
}

export type QuestionType = "multiple_choice" | "true_false" | "essay" | "fill_blank";
export type Difficulty = "easy" | "medium" | "hard";

export interface Question {
  id: string;
  exam_id: string;
  type: QuestionType;
  content: string;
  content_html: string | null;
  image_url: string | null;
  options: Record<string, unknown>[] | null;
  correct_answer: string | null;
  points: number;
  order_index: number;
  explanation: string | null;
  created_at: string;
}

export interface QuestionBank {
  id: string;
  subject_id: string | null;
  created_by: string;
  type: QuestionType;
  content: string;
  content_html: string | null;
  image_url: string | null;
  options: Record<string, unknown>[] | null;
  correct_answer: string | null;
  points: number;
  difficulty: Difficulty;
  tags: string[];
  explanation: string | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export type ExamSessionStatus = "in_progress" | "submitted" | "graded" | "timed_out";

export interface ExamSession {
  id: string;
  exam_id: string;
  user_id: string;
  status: ExamSessionStatus;
  started_at: string;
  submitted_at: string | null;
  total_score: number | null;
  max_score: number | null;
  attempt_number: number;
}

export interface Answer {
  id: string;
  session_id: string;
  question_id: string;
  user_id: string;
  answer: string | null;
  is_correct: boolean | null;
  score: number | null;
  graded_by: string | null;
  graded_at: string | null;
  feedback: string | null;
  submitted_at: string;
}

export interface ExamSchedule {
  id: string;
  exam_id: string;
  room: string | null;
  start_time: string;
  end_time: string;
  created_at: string;
}
