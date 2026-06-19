import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchJobByInviteToken, submitJobApplication } from "@/lib/invite";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_PDF_SIZE = 20 * 1024 * 1024;

function isValidLinkedInUrl(value: string): boolean {
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return /(^|\.)linkedin\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const job = await fetchJobByInviteToken(token);
    if (!job) return NextResponse.json({ error: "Link not found" }, { status: 404 });

    const form = await req.formData();
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    const linkedin = String(form.get("linkedin") ?? "").trim();
    const coverNote = String(form.get("coverNote") ?? "").trim();
    const visitorId = String(form.get("visitorId") ?? "").trim();
    const resume = form.get("resume");

    if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!email || !z.string().email().safeParse(email).success) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }
    if (!linkedin) {
      return NextResponse.json({ error: "LinkedIn URL is required" }, { status: 400 });
    }
    if (!isValidLinkedInUrl(linkedin)) {
      return NextResponse.json(
        { error: "Enter a valid LinkedIn profile URL (e.g. linkedin.com/in/yourname)" },
        { status: 400 },
      );
    }
    if (!(resume instanceof File)) {
      return NextResponse.json({ error: "Resume PDF is required" }, { status: 400 });
    }
    if (resume.type && resume.type !== "application/pdf") {
      return NextResponse.json({ error: "Resume must be a PDF file" }, { status: 400 });
    }

    const buffer = Buffer.from(await resume.arrayBuffer());
    if (!buffer.length) {
      return NextResponse.json({ error: "Resume file is empty" }, { status: 400 });
    }
    if (buffer.length > MAX_PDF_SIZE) {
      return NextResponse.json({ error: "Resume exceeds 20 MB limit" }, { status: 400 });
    }

    const result = await submitJobApplication(job.id as string, {
      name,
      email,
      phone: phone || undefined,
      linkedin,
      coverNote: coverNote || undefined,
      resume: { name: resume.name || "resume.pdf", buffer },
      visitorId: visitorId || undefined,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    log.error({ err }, "apply submit failed");
    const message = err instanceof Error ? err.message : "Unknown error";
    const status =
      message.includes("already applied") ||
      message.includes("not accepting") ||
      message.includes("closed")
        ? 409
        : message.includes("required") || message.includes("PDF") || message.includes("parse")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
