import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "6Frame Verify — Agent acceptance testing",
  description:
    "An AI agent pays 6Frame Verify to prove that its work actually meets the job before it says done.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
