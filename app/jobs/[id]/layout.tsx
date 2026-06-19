import { JobsSidebar } from "@/components/JobsSidebar";

export default async function JobDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      <JobsSidebar activeJobId={id} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
