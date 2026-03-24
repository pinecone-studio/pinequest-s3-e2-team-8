import { NextResponse } from "next/server";

// Basic health check route to keep the file as a valid module.
export function GET() {
  return NextResponse.json({ ok: true });
}
