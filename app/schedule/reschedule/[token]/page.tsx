"use client";

import { useParams } from "next/navigation";
import { CandidateReschedulePage } from "@/components/CandidateReschedulePage";

export default function RescheduleRoutePage() {
  const params = useParams<{ token: string }>();
  return <CandidateReschedulePage token={params.token} />;
}
