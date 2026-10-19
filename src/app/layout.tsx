import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DBOS Workflow · Workflow Studio",
  description: "Create and run durable workflows with DBOS and PostgreSQL.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
