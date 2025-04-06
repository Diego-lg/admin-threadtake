import type { Metadata } from "next";
import { Inter } from "next/font/google"; // Replace Geist fonts with Inter
import "./globals.css";

import { Providers } from "@/providers/providers"; // Import the new wrapper
const inter = Inter({
  variable: "--font-inter", // Use a standard variable name
  subsets: ["latin"],
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
        className={`${inter.variable} antialiased`} // Apply only Inter variable
      >
        <Providers>
          {/* Use the wrapper component */}
          {children}
        </Providers>
      </body>
    </html>
  );
}
