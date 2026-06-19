import { supabaseServer } from "@/lib/db";

async function main() {
  const id = process.argv[2];
  const email = process.argv[3];
  if (!id || !email) {
    console.error("usage: tsx scripts/set-candidate-email.ts <candidate_id> <email>");
    process.exit(1);
  }

  const { error, data } = await supabaseServer()
    .from("candidates")
    .update({ email })
    .eq("id", id)
    .select("id, name, email")
    .single();

  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log("updated:", data);
}

void main();
