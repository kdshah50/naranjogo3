import type { Metadata } from "next";
import { Suspense } from "react";
import PrivacyClient from "@/components/legal/PrivacyClient";

export const metadata: Metadata = {
  title: "Privacidad | Tianguis",
  description: "Información sobre el tratamiento de datos en Tianguis.",
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-0 flex-1 bg-[#FDF8F1] flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <PrivacyClient />
    </Suspense>
  );
}
