import { getModel } from "@/lib/ai/config";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/**
 * Шалгалтын материалын зураг дахь текстийг таних (Gemini).
 * API key байхгүй эсвэл алдаа гарвал null.
 */
export async function extractQuestionTextFromImageBytes(
  bytes: Uint8Array,
  mimeType: string
): Promise<string | null> {
  if (!ALLOWED_MIME.has(mimeType)) {
    return null;
  }

  try {
    const model = getModel();
    const base64 = Buffer.from(bytes).toString("base64");
    const result = await model.generateContent([
      {
        text: `Энэ зураг нь шалгалт, дасгал, асуултын материал байж болно.
Зураг дээрх бүх бичвэр, тоо, томъёог Монгол болон латин үсгээр ХУУЛЖ өг.
Зөвхөн олсон текст — тайлбар, удиртгал бичихгүй.`,
      },
      {
        inlineData: { mimeType, data: base64 },
      },
    ]);
    const text = result.response.text().trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
