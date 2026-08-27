import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import Header from "@/components/header";
import Footer from "@/components/footer";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--font-inter" });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600"], display: "swap", variable: "--font-cormorant" });

export const metadata: Metadata = {
  title: "AMES DE BRILLIANTE",
  description: "Licensed Diamond Dealer, Republic of Botswana",
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.variable} ${cormorant.variable} min-h-full flex flex-col bg-background text-white font-sans`}>
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
