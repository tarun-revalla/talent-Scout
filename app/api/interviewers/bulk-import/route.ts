import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";

interface BulkImportRow {
  name?: string;
  email?: string;
  timezone?: string;
  availabilityPattern?: string;
  roundIndex?: string;
  bufferMinutes?: string;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; error: string }>;
  created: Array<{ name: string; email: string }>;
}

export async function POST(req: NextRequest) {
  try {
    const { jobId, csvContent } = await req.json();
    if (!jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }
    if (!csvContent) {
      return NextResponse.json({ error: "csvContent required" }, { status: 400 });
    }

    const { createInterviewer } = await import("@/lib/interviewers");
    const result: ImportResult = {
      success: 0,
      failed: 0,
      errors: [],
      created: [],
    };

    // Parse CSV
    const parsed = Papa.parse<BulkImportRow>(csvContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    if (parsed.errors.length > 0) {
      return NextResponse.json(
        { error: "CSV parsing error", details: parsed.errors },
        { status: 400 },
      );
    }

    const rows = parsed.data as BulkImportRow[];

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Account for header

      try {
        // Validate required fields
        if (!row.name?.trim()) {
          result.errors.push({ row: rowNum, error: "Name is required" });
          result.failed++;
          continue;
        }
        if (!row.email?.trim()) {
          result.errors.push({ row: rowNum, error: "Email is required" });
          result.failed++;
          continue;
        }

        // Optional timezone (will be auto-detected from calendar)
        const timezone = row.timezone?.trim() || undefined;

        // Parse availability pattern (e.g., "Mon/Wed 2-5pm PST" or leave blank for no default)
        // For now, we'll just create with defaults and let user customize
        const roundIndex = row.roundIndex ? parseInt(row.roundIndex) : null;
        const bufferMinutes = row.bufferMinutes ? parseInt(row.bufferMinutes) : 15;

        // Create interviewer
        const interviewer = await createInterviewer(jobId, {
          name: row.name.trim(),
          email: row.email.trim(),
          timezone,
          roundIndex: roundIndex !== null ? roundIndex : undefined,
          bufferMinutes,
        });

        result.created.push({
          name: interviewer.name,
          email: interviewer.email,
        });
        result.success++;
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        result.errors.push({ row: rowNum, error: msg });
        result.failed++;
      }
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
