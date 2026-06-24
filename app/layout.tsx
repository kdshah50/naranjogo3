import type { Metadata } from "next";
import { Suspense } from "react";
// Inter loaded via CSS
import "./globals.css";
import Header from "@/components/Header";
import LangQuerySync from "@/components/LangQuerySync";
import PostHogIdentify from "@/components/posthog/PostHogIdentify";
import PostHogPageView from "@/components/posthog/PostHogPageView";
import PostHogProvider from "@/components/posthog/PostHogProvider";
import SiteFooter from "@/components/SiteFooter";
import { CartProvider } from "@/components/cart/CartContext";
import { getPublicAppUrl } from "@/lib/app-url";

const siteUrl = getPublicAppUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Tianguis — El Mercado Digital de México",
  description: "El mercado digital más seguro de México. Compra y vende con confianza.",
  openGraph: {
    title: "Tianguis — El Mercado Digital de México",
    description: "Compra y vende con confianza. Sin estafas, sin spam.",
    url: siteUrl,
    siteName: "Tianguis",
    locale: "es_MX",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans min-h-screen flex flex-col">
        <PostHogProvider>
          <CartProvider>
            <LangQuerySync />
            <Suspense fallback={null}>
              <PostHogPageView />
            </Suspense>
            <Suspense fallback={null}>
              <PostHogIdentify />
            </Suspense>
            <Header />
            <div className="flex-1 min-h-0 flex flex-col">{children}</div>
            <SiteFooter />
          </CartProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
