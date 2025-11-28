import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import MotionProvider from "@/components/MotionProvider";
import { Plus_Jakarta_Sans } from "next/font/google";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap"
});

export const metadata = {
  title: "IMS",
  description: "Intelligent Maritime System PWA",
  manifest: "/manifest.webmanifest"
};

export const viewport = { themeColor: "#1d3455" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#1d3455" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/ims-logo.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className={`${jakarta.className} bg-[#0B1220] text-white antialiased`}>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
