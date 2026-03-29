import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const promptApiKey = process.env.GEMINI_API_KEY_PROMPT;

if (!apiKey) {
  console.warn("GEMINI_API_KEY is not set. AI features will be unavailable.");
}

if (!promptApiKey) {
  console.warn(
    "GEMINI_API_KEY_PROMPT is not set. Prompt-based AI question variation will be unavailable."
  );
}

export const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;
export const promptGenAI = promptApiKey
  ? new GoogleGenerativeAI(promptApiKey)
  : null;

export const GEMINI_MODEL = "gemini-2.5-flash";

export function getModel() {
  if (!genAI) {
    throw new Error("GEMINI_API_KEY тохируулаагүй байна. .env.local файлд нэмнэ үү.");
  }
  return genAI.getGenerativeModel({ model: GEMINI_MODEL });
}

export function getPromptModel() {
  if (!promptGenAI) {
    throw new Error(
      "GEMINI_API_KEY_PROMPT тохируулаагүй байна. .env.local файлд нэмнэ үү."
    );
  }

  return promptGenAI.getGenerativeModel({ model: GEMINI_MODEL });
}
