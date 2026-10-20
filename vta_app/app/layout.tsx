import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { AuthDialogProvider } from "@/components/AuthDialog";
import { MotionProvider } from "@/components/MotionProvider";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "VTA — Virtual Teaching Assistant", template: "%s · VTA" },
  description:
    "VTA turns a teacher's own course materials into a teaching assistant that answers students' questions and cites its sources.",
};

export const viewport: Viewport = { themeColor: "#faf6ec", colorScheme: "light" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable}`}>
      <body className="min-h-screen antialiased">
        <MotionProvider>
          <AuthProvider>
            <AuthDialogProvider>{children}</AuthDialogProvider>
          </AuthProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
