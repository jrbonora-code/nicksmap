import type { Metadata } from "next";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

// Runtime identity configuration and sessions must never be frozen during build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "BlackFin", template: "%s · BlackFin" },
  description: "BlackFin. Private multifamily intelligence across Florida.",
  robots: { index: false, follow: false, nocache: true }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
