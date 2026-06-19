import { ApplyJobPage } from "@/components/ApplyJobPage";

export default async function ApplyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ApplyJobPage token={token} />;
}
