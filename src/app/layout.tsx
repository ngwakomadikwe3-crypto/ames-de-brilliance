import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import Header from "@/components/header";
import Footer from "@/components/footer";
import PwaRegister from "@/components/PwaRegister";


export const metadata: Metadata = {
  title: "AMES DE BRILLIANTE",
  description: "AMES Boutique, Chat and Video — an interactive luxury experience.",
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${GeistSans.variable} min-h-full flex flex-col bg-background text-white font-sans`}>
        <PwaRegister />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
