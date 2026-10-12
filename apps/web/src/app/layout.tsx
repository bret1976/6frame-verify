import type { Metadata, Viewport } from "next";
import "@/styles/globals.css";

const base = (process.env.APP_BASE_URL || "https://siteverify.dev").replace(/\/$/, "");
const title = "6Frame Verify — Pre-launch website QA in 60 seconds";
const description =
  "Paste your URL: a real browser checks broken links, SEO tags, social previews, mobile layout, console errors and load time on desktop + mobile. Report with screenshots. $3 per check.";

export const metadata: Metadata = {
  metadataBase: new URL(base),
  title,
  description,
  applicationName: "6Frame Verify",
  openGraph: {
    type: "website",
    url: base,
    siteName: "6Frame Verify",
    title,
    description,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "6Frame Verify — pre-launch website QA in 60 seconds" }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#07080b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
