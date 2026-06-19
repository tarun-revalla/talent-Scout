import type { Metadata } from "next";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Apply | ${APP_NAME}`,
  description: "Submit your application",
};

export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
