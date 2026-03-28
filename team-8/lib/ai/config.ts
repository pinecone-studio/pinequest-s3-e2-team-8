import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("GEMINI_API_KEY is not set. AI features will be unavailable.");
}

export const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export const GEMINI_MODEL = "gemini-2.5-flash";

export function getModel() {
  if (!genAI) {
    throw new Error("GEMINI_API_KEY тохируулаагүй байна. .env.local файлд нэмнэ үү.");
  }
  return genAI.getGenerativeModel({ model: GEMINI_MODEL });
}
