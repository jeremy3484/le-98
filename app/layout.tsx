import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Unbounded } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { UserProvider } from "@/lib/supabase/use-user";
import type { Profile } from "@/types/database";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
const displayFont = Unbounded({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "600", "700", "800", "900"],
  display: "swap",
});

const APP_NAME = "Jeu du 98";
const APP_DESCRIPTION =
  "Jeu de cartes multijoueur en temps réel — variante du 98.";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_NAME,
    template: "%s | " + APP_NAME,
  },
  description: APP_DESCRIPTION,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    // iOS Safari n'accepte PAS de SVG en apple-touch-icon : il faut un PNG.
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0a12",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: Profile | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = (data as Profile) ?? null;
  }

  return (
    <html
      lang="fr"
      className={cn("dark font-sans", geistSans.variable, displayFont.variable)}
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${displayFont.variable} antialiased`}
      >
        <UserProvider initialUser={user} initialProfile={profile}>
          {children}
        </UserProvider>
      </body>
    </html>
  );
}
