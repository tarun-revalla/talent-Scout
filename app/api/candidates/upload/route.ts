import { NextRequest, NextResponse } from "next/server";
import { ingestFiles } from "@/lib/ingest";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — uploads + LLM parsing can be slow

const MAX_FILES = 100;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const entries = form.getAll("files");
    if (!entries.length) {
      return NextResponse.json({ error: "No files uploaded (field 'files')" }, { status: 400 });
    }
    if (entries.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Too many files uploaded (${entries.length} > ${MAX_FILES})` },
        { status: 400 },
      );
    }
    const files: { name: string; buffer: Buffer; mime: string | null }[] = [];
    let totalBytes = 0;
    for (const e of entries) {
      if (!(e instanceof File)) continue;
      if (e.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          { error: `${e.name} exceeds 20 MB limit` },
          { status: 400 },
        );
      }
      totalBytes += e.size;
      if (totalBytes > MAX_TOTAL_BYTES) {
        return NextResponse.json(
          { error: "Upload batch exceeds 100 MB limit" },
          { status: 400 },
        );
      }
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
