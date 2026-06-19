import { ScheduleRespondPage } from "@/components/ScheduleRespondPage";

export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ScheduleRespondPage token={token} />;
}
