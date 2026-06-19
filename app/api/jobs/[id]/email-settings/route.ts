import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/db";
import { DEFAULT_EMAIL_SETTINGS, resolveEmailSettings } from "@/lib/email-templates";
import { EmailSettingsSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sb = supabaseServer();
  const { data, error } = await sb
    .from("jobs")
    .select("email_settings")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({
    email_settings: resolveEmailSettings(data.email_settings ?? DEFAULT_EMAIL_SETTINGS),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { email_settings?: unknown };
    const parsed = EmailSettingsSchema.safeParse(body.email_settings);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join("; ") },
        { status: 400 },
      );
    }

    const sb = supabaseServer();
    const { data: jobRow } = await sb.from("jobs").select("status").eq("id", id).single();
    if (jobRow?.status === "closed") {
      return NextResponse.json(
        { error: "Job is closed — re-open it before editing email templates." },
        { status: 409 },
      );
    }

    const { error } = await sb
      .from("jobs")
      .update({ email_settings: parsed.data })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ email_settings: parsed.data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
