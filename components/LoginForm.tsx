"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { formatMxLocalInput, formatUsLocalInput } from "@/lib/phone";
import { useAppLang } from "@/hooks/use-app-lang";
import type { Lang } from "@/lib/i18n-lang";

type Country = "MX" | "US";

const COUNTRIES: { id: Country; flag: string; dial: string; label: { es: string; en: string }; placeholder: string }[] = [
  { id: "MX", flag: "🇲🇽", dial: "+52", label: { es: "México", en: "Mexico" }, placeholder: "55 1234 5678" },
  { id: "US", flag: "🇺🇸", dial: "+1", label: { es: "Estados Unidos", en: "United States" }, placeholder: "(555) 123-4567" },
];

const LG: Record<
  Lang,
  {
    title: string;
    sub: string;
    regionLabel: string;
    phoneLabel: string;
    invalidDigits: string;
    otpFail: string;
    sending: string;
    cta: string;
    termsLead: string;
    termsLink: string;
  }
> = {
  es: {
    title: "Inicia sesión",
    sub: "Te enviamos un código por WhatsApp para verificar tu número.",
    regionLabel: "PAÍS / REGIÓN",
    phoneLabel: "NÚMERO DE WHATSAPP",
    invalidDigits: "Ingresa un número válido de 10 dígitos",
    otpFail: "No se pudo enviar el código OTP. Intenta de nuevo en un minuto.",
    sending: "Enviando...",
    cta: "Recibir código por WhatsApp",
    termsLead: "Al continuar aceptas nuestros",
    termsLink: "Términos de uso",
  },
  en: {
    title: "Log in",
    sub: "We'll send you a code on WhatsApp to verify your number.",
    regionLabel: "COUNTRY / REGION",
    phoneLabel: "WHATSAPP NUMBER",
    invalidDigits: "Enter a valid 10-digit number",
    otpFail: "Couldn't send the OTP. Try again in a minute.",
    sending: "Sending...",
    cta: "Get code on WhatsApp",
    termsLead: "By continuing you accept our",
    termsLink: "Terms of use",
  },
};

export default function LoginForm() {
  const lang = useAppLang();
  const ui = LG[lang];
  const [country, setCountry] = useState<Country>("MX");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "";
  const refParam = searchParams.get("ref")?.trim() ?? "";

  const selected = COUNTRIES.find((c) => c.id === country)!;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 10) {
      setError(ui.invalidDigits);
      setLoading(false);
      return;
    }
    const e164 = country === "MX" ? `52${clean}` : `1${clean}`;
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: e164 }),
      });
      const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
      const data = isJson ? await res.json() : null;
      if (!res.ok) {
        const fallback = ui.otpFail;
        throw new Error((data as { error?: string } | null)?.error ?? fallback);
      }
      const params = new URLSearchParams({ phone: e164 });
      if (data && typeof data === "object" && "devOtp" in data && data.devOtp) {
        params.set("otp", String(data.devOtp));
      }
      if (returnTo) params.set("returnTo", returnTo);
      if (refParam) params.set("ref", refParam);
      router.push(`/auth/verify?${params.toString()}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#FDF8F1] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex justify-center mb-8">
          <span className="font-serif text-3xl font-bold text-[#1B4332]">T</span>
          <span className="font-serif text-2xl text-[#1C1917]">ianguis</span>
          <span className="text-[#D4A017] text-sm font-bold ml-0.5 mt-1">✦</span>
        </Link>
        <div className="bg-white rounded-2xl border border-[#E5E0D8] p-8 shadow-sm">
          <h1 className="font-serif text-2xl font-bold text-[#1C1917] mb-2">{ui.title}</h1>
          <p className="text-sm text-[#6B7280] mb-6">{ui.sub}</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-[#6B7280] block mb-2 tracking-wide">{ui.regionLabel}</label>
              <select
                value={country}
                onChange={(e) => {
                  setCountry(e.target.value as Country);
                  setPhone("");
                }}
                className="w-full px-4 py-3 rounded-xl border border-[#E5E0D8] bg-[#F4F0EB] text-sm font-medium text-[#374151] outline-none focus:border-[#1B4332] transition-colors"
              >
                {COUNTRIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.flag} {c.label[lang]} ({c.dial})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#6B7280] block mb-2 tracking-wide">{ui.phoneLabel}</label>
              <div className="flex items-center border border-[#E5E0D8] rounded-xl overflow-hidden focus-within:border-[#1B4332] transition-colors">
                <div className="px-4 py-3 bg-[#F4F0EB] border-r border-[#E5E0D8] flex items-center gap-1.5 flex-shrink-0 min-w-[5.5rem]">
                  <span className="text-base">{selected.flag}</span>
                  <span className="text-sm font-semibold text-[#374151]">{selected.dial}</span>
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) =>
                    setPhone(country === "MX" ? formatMxLocalInput(e.target.value) : formatUsLocalInput(e.target.value))
                  }
                  placeholder={selected.placeholder}
                  className="flex-1 px-4 py-3 text-base outline-none bg-transparent min-w-0"
                  autoComplete="tel-national"
                />
              </div>
            </div>
            {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-semibold text-white transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: loading ? "#6B7280" : "#25D366" }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {ui.sending}
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  {ui.cta}
                </>
              )}
            </button>
          </form>
          <p className="text-xs text-[#9CA3AF] text-center mt-4">
            {ui.termsLead}{" "}
            <Link href="/terms" className="text-[#1B4332] hover:underline">
              {ui.termsLink}
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
