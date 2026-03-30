import { NextResponse } from "next/server";

/**
 * Lightweight ping endpoint used by the Pre-Exam System Check
 * to measure approximate round-trip latency to the server.
 */
export async function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
