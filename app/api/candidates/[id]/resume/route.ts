import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";

export const runtime = "nodejs";

const RESUME_BUCKET = "resumes";
const SIGNED_URL_TTL_SECONDS = 300;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = supabaseServer();
  const { data: cand, error } = await sb
    .from("candidates")
    .select("name, source, resume_url")
    .eq("id", id)
    .single();
  if (error || !cand) {
    return NextResponse.json({ error: error?.message ?? "Not found" }, { status: 404 });
  }
  if (!cand.resume_url) {
    return NextResponse.json(
      { error: "This candidate was uploaded as CSV/JSON — no resume PDF on file." },
      { status: 404 },
    );
  }
  const { data: signed, error: signErr } = await sb.storage
    .from(RESUME_BUCKET)
    .createSignedUrl(cand.resume_url as string, SIGNED_URL_TTL_SECONDS);
  if (signErr || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signErr?.message ?? "Could not sign resume URL" },
      { status: 500 },
    );
  }
  return NextResponse.json({
    url: signed.signedUrl,
    name: cand.name,
    source: cand.source,
  });
}
