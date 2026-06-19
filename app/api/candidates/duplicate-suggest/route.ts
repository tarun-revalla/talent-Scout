import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseServer } from "@/lib/db";
import { suggestDuplicateResolution } from "@/lib/llm";
import { ParsedProfileSchema } from "@/lib/schemas";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  newId: z.string().uuid(),
  existingId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const body = BodySchema.parse(await req.json());
    const sb = supabaseServer();
    const { data: rows, error } = await sb
      .from("candidates")
      .select("id, email, parsed_profile, raw_text")
      .in("id", [body.newId, body.existingId]);
    if (error) throw new Error(error.message);

    const existing = rows?.find((r) => r.id === body.existingId);
    const newly = rows?.find((r) => r.id === body.newId);
    if (!existing || !newly) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    const existingProfile = ParsedProfileSchema.parse(existing.parsed_profile ?? {});
    const newProfile = ParsedProfileSchema.parse(newly.parsed_profile ?? {});

    const suggestion = await suggestDuplicateResolution({
      email: (existing.email as string) ?? (newly.email as string) ?? "",
      existingProfile,
      newProfile,
      existingRawSnippet: (existing.raw_text as string) ?? "",
      newRawSnippet: (newly.raw_text as string) ?? "",
      usage: { operation: "duplicate_suggest" },
    });

    return NextResponse.json({ suggestion });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.flatten() }, { status: 400 });
    }
    log.error({ err }, "duplicate suggest failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
