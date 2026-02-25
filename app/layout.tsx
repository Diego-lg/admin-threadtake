import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google"; // Load both Inter and JetBrains Mono
import "./globals.css";

import { Providers } from "@/providers/providers"; // Import the new wrapper
import { ServerInitializer } from "@/components/server-initializer";

const inter = Inter({
  variable: "--font-inter", // Distinct variable for Inter
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono", // Distinct variable name
  subsets: ["latin"],
  display: "swap",
});

// Remove Geist Mono definition

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "Admin Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Add suppressHydrationWarning for ThemeProvider */}
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased`} // Apply both font variables
      >
        <Providers>
          {/* Use the wrapper component */}
          <ServerInitializer />
          {children}
        </Providers>
      </body>
    </html>
  );
}
