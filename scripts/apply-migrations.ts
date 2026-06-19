/**
 * Apply supabase/migrations/*.sql to the linked project via Supabase Management API.
 * Tracks applied migrations in schema_migrations so re-runs are safe.
 *
 * Usage: npx tsx scripts/apply-migrations.ts
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { loadEnvLocal } from "../lib/load-env";

loadEnvLocal();

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!PROJECT_REF || !ACCESS_TOKEN) {
  console.error("Missing SUPABASE_PROJECT_REF or SUPABASE_ACCESS_TOKEN in environment.");
  process.exit(1);
}

async function runQuery(sql: string): Promise<string> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );

  const body = await res.text();
  if (!res.ok) {
    throw new Error(body || `Query failed (${res.status})`);
  }
  return body;
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function ensureMigrationTable(): Promise<void> {
  await runQuery(`
    create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const raw = await runQuery("select name from schema_migrations order by name;");
  try {
    const rows = JSON.parse(raw) as { name: string }[];
    return new Set(rows.map((r) => r.name));
  } catch {
    return new Set();
  }
}

/** Existing projects that ran migrations before tracking was added. */
async function bootstrapAppliedMigrations(allFiles: string[]): Promise<void> {
  const raw = await runQuery(
    "select to_regclass('public.jobs') as jobs, to_regclass('public.llm_usage') as llm_usage;",
  );
  let jobs: string | null = null;
  let llmUsage: string | null = null;
  try {
    const row = JSON.parse(raw)[0] as { jobs: string | null; llm_usage: string | null };
    jobs = row.jobs;
    llmUsage = row.llm_usage;
  } catch {
    return;
  }

  if (!jobs) return;

  const toMark = allFiles.filter((f) => {
    if (f === "0014_llm_usage.sql") return llmUsage != null;
    return true;
  });

  if (toMark.length === 0) return;

  const values = toMark.map((f) => `(${sqlLiteral(f)})`).join(", ");
  await runQuery(
    `insert into schema_migrations (name) values ${values} on conflict (name) do nothing;`,
  );
  console.log(
    `Bootstrapped ${toMark.length} migration(s) already present in the database.\n`,
  );
}

async function markApplied(name: string): Promise<void> {
  await runQuery(
    `insert into schema_migrations (name) values (${sqlLiteral(name)}) on conflict (name) do nothing;`,
  );
}

async function applyMigration(name: string, sql: string): Promise<void> {
  process.stdout.write(`Applying ${name} ... `);
  try {
    await runQuery(sql);
    await markApplied(name);
    process.stdout.write("OK\n");
  } catch (err) {
    process.stdout.write("FAILED\n");
    console.error(err instanceof Error ? err.message : err);
    throw new Error(`Migration ${name} failed`);
  }
}

async function main() {
  const dir = join(process.cwd(), "supabase", "migrations");
  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`Project: ${PROJECT_REF}`);
  console.log(`Migrations: ${files.length}\n`);

  await ensureMigrationTable();
  let applied = await getAppliedMigrations();
  if (applied.size === 0) {
    await bootstrapAppliedMigrations(files);
    applied = await getAppliedMigrations();
  }

  let ran = 0;
  let skipped = 0;

  for (const file of files) {
    if (applied.has(file)) {
      skipped++;
      continue;
    }
    const sql = await readFile(join(dir, file), "utf8");
    await applyMigration(file, sql);
    ran++;
  }

  if (ran === 0) {
    console.log(`No new migrations to apply (${skipped} already applied).`);
  } else {
    console.log(`\nApplied ${ran} migration(s) (${skipped} skipped).`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
