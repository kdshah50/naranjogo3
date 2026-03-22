import type { Metadata } from "next";
// Inter loaded via CSS
import "./globals.css";
import Header from "@/components/Header";



export const metadata: Metadata = {
  title: "Tianguis — El Mercado Digital de México",
  description: "El mercado digital más seguro de México. Compra y vende con confianza.",
  openGraph: {
    title: "Tianguis — El Mercado Digital de México",
    description: "Compra y vende con confianza. Sin estafas, sin spam.",
    url: "https://www.naranjogo.com.mx",
    siteName: "Tianguis",
    locale: "es_MX",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans">
        <Header />
        {children}
      </body>
    </html>
  );
}
