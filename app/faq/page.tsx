import type { Metadata } from "next";
import { Suspense } from "react";
import FaqClient from "@/components/legal/FaqClient";

export const metadata: Metadata = {
  title: "Preguntas frecuentes | Naranjogo",
  description:
    "Cómo reservar servicios, pagar la tarifa de la plataforma o el servicio completo, chat con proveedores y precio acordado en Naranjogo.",
  robots: { index: true, follow: true },
};

export default function FaqPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-0 flex-1 bg-[#FDF8F1] flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <FaqClient />
    </Suspense>
  );
}
