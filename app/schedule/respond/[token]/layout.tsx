import type { Metadata } from "next";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Schedule response | ${APP_NAME}`,
  description: "Confirm or decline an interview time",
};

export default function ScheduleRespondLayout({ children }: { children: React.ReactNode }) {
  return children;
}
