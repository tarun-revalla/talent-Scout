import { NextRequest, NextResponse } from "next/server";
import { ingestFiles } from "@/lib/ingest";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — uploads + LLM parsing can be slow

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const entries = form.getAll("files");
    if (!entries.length) {
      return NextResponse.json({ error: "No files uploaded (field 'files')" }, { status: 400 });
    }
    const files: { name: string; buffer: Buffer; mime: string | null }[] = [];
    for (const e of entries) {
      if (!(e instanceof File)) continue;
      const ab = await e.arrayBuffer();
      files.push({ name: e.name, buffer: Buffer.from(ab), mime: e.type || null });
    }
    if (!files.length) return NextResponse.json({ error: "No files" }, { status: 400 });

    log.info({ count: files.length, names: files.map((f) => f.name) }, "ingesting files");
    const result = await ingestFiles(files);
    return NextResponse.json(result);
  } catch (err) {
    log.error({ err }, "upload route failed");
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
