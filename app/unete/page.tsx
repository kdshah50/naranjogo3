"use client";
import { useMemo, useState } from "react";
import { ALL_COLONIA_KEYS, COLONIAS as COLONIAS_MAP } from "@/lib/colonias";
import {
  buildAvailabilitySummaryString,
  defaultWeeklyAvailability,
  HOURS_12,
  MERIDIANS,
  type AvailabilityMode,
  type DayAvailability,
  type DayMeridian,
  type WeekdayKey,
  WEEKDAYS,
} from "@/lib/provider-availability";
import {
  PROVIDER_SERVICES as SERVICES,
  PROVIDER_LANGUAGE_OPTIONS,
  SERVICE_LOCATION_OPTIONS,
  providerServiceLabels,
} from "@/lib/provider-services";

const COLONIAS_LIST = ALL_COLONIA_KEYS.map(key => ({
  value: key,
  es: COLONIAS_MAP[key].label,
  en: COLONIAS_MAP[key].label_en,
  lat: COLONIAS_MAP[key].lat,
  lng: COLONIAS_MAP[key].lng,
}));


const T = {
  es: {
    title:        "Ofrece tu servicio en Naranjogo",
    sub:          "Llega a cientos de familias y expatriados en San Miguel de Allende.",
    step1:        "Tu información",
    step2:        "Tu servicio",
    step3:        "Términos y condiciones",
    step4:        "Confirmar",
    name:         "Nombre completo",
    whatsapp:     "WhatsApp (con código de país)",
    whatsappPh:   "+52 415 000 0000",
    curp:         "CURP (opcional)",
    curpPh:       "Ej. GAMA850101HDFRRL09",
    curpHelp:     "Tu CURP nos ayuda a verificar tu identidad. Aparecerás como proveedor verificado.",
    rfc:          "RFC (opcional)",
    rfcPh:        "Ej. XAXX010101000 o ABCD850101XXX",
    rfcHelp:      "Si facturas o eres persona moral, tu RFC ayuda al equipo a validar tu perfil (revisión manual).",
    service:      "¿Qué servicio ofreces?",
    desc:         "Describe tu servicio",
    descPh:       "Experiencia, zona de cobertura, horarios, especialidades...",
    price:        "Precio aproximado (MXN)",
    pricePh:      "Ej. $500 por visita",
    payment:      "¿Cómo aceptas pago?",
    city:         "Ciudad / Colonia",
    colonia:      "Colonia / Barrio",
    address:      "Dirección de referencia (opcional)",
    addressPh:    "Ej. Cerca del jardín principal, frente al parque...",
    next:         "Continuar →",
    back:         "← Atrás",
    submit:       "Enviar solicitud",
    submitting:   "Enviando...",
    doneTitle:    "¡Solicitud recibida!",
    doneSub:      "Revisaremos tu perfil en las próximas 24 horas y te contactaremos por WhatsApp para confirmar tu registro.",
    doneNote:     "Una vez aprobado, tu servicio aparecerá automáticamente en las búsquedas de Naranjogo.",
    free:         "Registro gratuito",
    verified:     "Perfil verificado",
    reach:        "Clientes reales en SMA",
    termsTitle:   "Términos y condiciones para proveedores",
    term1Title:   "Publicación gratuita",
    term1:        "Registrar tu servicio en Naranjogo es completamente gratuito. No cobramos por aparecer en el directorio.",
    term2Title:   "Modelo de negocio",
    term2:        "Naranjogo puede establecer una comisión o cuota de servicio en el futuro. Los términos comerciales específicos se acordarán contigo directamente antes de cualquier cobro.",
    term3Title:   "Calidad y veracidad",
    term3:        "Debes ser el proveedor real del servicio. La información que proporciones debe ser veraz. Naranjogo puede retirar tu perfil si recibe reportes negativos verificados.",
    term4Title:   "Proceso de aprobación",
    term4:        "Todos los proveedores son revisados manualmente por el equipo de Naranjogo antes de aparecer en el directorio. Nos reservamos el derecho de aprobar o rechazar cualquier solicitud.",
    term5Title:   "Privacidad",
    term5:        "Tu número de WhatsApp no se muestra públicamente. Solo los clientes que hagan clic en 'Contactar' pueden iniciar una conversación contigo.",
    acceptAll:    "He leído y acepto los términos y condiciones",
    acceptPricing:"Entiendo que Naranjogo puede establecer términos comerciales en el futuro, los cuales me serán comunicados antes de cualquier cobro.",
    mustAccept:   "Debes aceptar los términos para continuar",
    providerLanguages: "¿En qué idiomas atiendes a tus clientes?",
    serviceLocation:   "¿Dónde prestas el servicio?",
    alternateServices: "Otros servicios que también ofreces",
    alternateHint:     "Opcional — elige categorías adicionales de la misma lista (distinto a tu servicio principal).",
    availabilitySection:   "Disponibilidad del servicio (opcional)",
    availabilityHint:
      "Se muestra en tu perfil público. La cita exacta siempre se confirma con el cliente por WhatsApp.",
    availabilityOnDemand:   "Bajo demanda — el horario se coordina por WhatsApp",
    availabilityWeekly:     "Horario recurrente por día de la semana",
    availabilityDayClosed:  "Cerrado",
    availabilityFrom:       "De",
    availabilityTo:         "a",
    availabilityNotes:      "Notas adicionales (opcional)",
    availabilityNotesPh:    "Ej. Cierro en días festivos, avisar con 24 h de anticipación…",
  },
  en: {
    title:        "List your service on Naranjogo",
    sub:          "Reach hundreds of families and expats in San Miguel de Allende.",
    step1:        "Your info",
    step2:        "Your service",
    step3:        "Terms & conditions",
    step4:        "Confirm",
    name:         "Full name",
    whatsapp:     "WhatsApp (with country code)",
    whatsappPh:   "+52 415 000 0000",
    curp:         "CURP (optional)",
    curpPh:       "E.g. GAMA850101HDFRRL09",
    curpHelp:     "Your CURP helps us verify your identity. You'll appear as a verified provider.",
    rfc:          "RFC (optional)",
    rfcPh:        "E.g. XAXX010101000 or ABCD850101XXX",
    rfcHelp:      "If you invoice or are a business, your RFC helps our team validate your profile (manual review).",
    service:      "What service do you offer?",
    desc:         "Describe your service",
    descPh:       "Experience, coverage area, hours, specialties...",
    price:        "Approximate price (MXN)",
    pricePh:      "e.g. $500 per visit",
    payment:      "How do you accept payment?",
    city:         "City / Neighborhood",
    colonia:      "Neighborhood / Colonia",
    address:      "Reference address (optional)",
    addressPh:    "e.g. Near the main garden, by the park...",
    next:         "Continue →",
    back:         "← Back",
    submit:       "Submit application",
    submitting:   "Submitting...",
    doneTitle:    "Application received!",
    doneSub:      "We'll review your profile within 24 hours and contact you via WhatsApp to confirm your registration.",
    doneNote:     "Once approved, your service will automatically appear in Naranjogo searches.",
    free:         "Free to register",
    verified:     "Verified profile",
    reach:        "Real clients in SMA",
    termsTitle:   "Provider terms & conditions",
    term1Title:   "Free listing",
    term1:        "Registering your service on Naranjogo is completely free. We do not charge for appearing in the directory.",
    term2Title:   "Business model",
    term2:        "Naranjogo may establish a commission or service fee in the future. Specific commercial terms will be agreed with you directly before any charges apply.",
    term3Title:   "Quality & accuracy",
    term3:        "You must be the actual service provider. All information you provide must be accurate. Naranjogo may remove your profile if verified negative reports are received.",
    term4Title:   "Approval process",
    term4:        "All providers are manually reviewed by the Naranjogo team before appearing in the directory. We reserve the right to approve or reject any application.",
    term5Title:   "Privacy",
    term5:        "Your WhatsApp number is not shown publicly. Only clients who click 'Contact' can start a conversation with you.",
    acceptAll:    "I have read and agree to the terms and conditions",
    acceptPricing:"I understand that Naranjogo may establish commercial terms in the future, which will be communicated to me before any charges apply.",
    mustAccept:   "You must accept the terms to continue",
    providerLanguages: "What languages do you use with clients?",
    serviceLocation:   "Where do you provide the service?",
    alternateServices: "Other services you also offer",
    alternateHint:     "Optional — pick extra categories from the same list (besides your primary service).",
    availabilitySection:   "Service availability (optional)",
    availabilityHint:
      "Shown on your public profile. Exact appointment time is always confirmed with the client on WhatsApp.",
    availabilityOnDemand:   "On-demand — schedule by WhatsApp with each client",
    availabilityWeekly:     "Weekly recurring hours by weekday",
    availabilityDayClosed:  "Closed",
    availabilityFrom:       "From",
    availabilityTo:         "To",
    availabilityNotes:      "Additional notes (optional)",
    availabilityNotesPh:    "e.g. Closed on holidays, please give 24 h notice…",
  },
};

export default function UnetePage() {
  const [lang, setLang] = useState<"es"|"en">("es");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [termsError, setTermsError] = useState(false);

  const [form, setForm] = useState({
    name: "", whatsapp: "", service: "",
    description: "", price: "", curp: "", rfc: "",
    city: "San Miguel de Allende",
    colonia: "",
    address: "",
    provider_languages: "" as "" | "bilingual" | "spanish_only" | "english_only",
    service_location: "" as "" | "in_house" | "on_site_only",
    alternate_services: [] as string[],
    availability_mode: "weekly_hours" as AvailabilityMode,
    weekly_hours: defaultWeeklyAvailability(),
    availability_notes: "",
    payment_methods: ["efectivo", "whatsapp"] as string[],
    acceptTerms: false,
    acceptPricing: false,
  });

  const t = T[lang];
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const patchWeeklyDay = (key: WeekdayKey, patch: Partial<DayAvailability>) => {
    setForm((f) => ({
      ...f,
      weekly_hours: { ...f.weekly_hours, [key]: { ...f.weekly_hours[key], ...patch } },
    }));
  };

  const availabilityComposite = useMemo(
    () =>
      buildAvailabilitySummaryString(
        lang,
        form.availability_mode,
        form.weekly_hours,
        form.availability_notes,
      ).slice(0, 2000),
    [lang, form.availability_mode, form.weekly_hours, form.availability_notes],
  );

  const handleSubmit = async () => {
    if (!form.acceptTerms || !form.acceptPricing) {
      setTermsError(true);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const selectedService = SERVICES.find((s) => s.value === form.service);
      const { weekly_hours: _wh, availability_mode: _am, availability_notes: _an, ...signupFields } = form;

      const res = await fetch("/api/provider-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...signupFields,
          availability_summary: availabilityComposite.trim(),
          service_label: selectedService?.[lang] ?? form.service,
          lang,
          accepted_terms: true,
          accepted_pricing: true,
          accepted_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = text;
        try {
          const j = JSON.parse(text) as {
            error?: string | { message?: string };
            message?: string;
          };
          if (typeof j.error === "string") msg = j.error;
          else if (j.error && typeof j.error === "object" && typeof j.error.message === "string")
            msg = j.error.message;
          else if (typeof j.message === "string") msg = j.message;
        } catch {
          /* raw text */
        }
        throw new Error(
          msg || (lang === "es" ? "No se pudo enviar la solicitud." : "Couldn't submit application.")
        );
      }
      setDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── DONE screen ──────────────────────────────────────────────────────────────
  if (done) return (
    <main className="min-h-screen bg-[#FDF8F1] flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl border border-[#E5E0D8] p-10 max-w-md w-full text-center shadow-sm">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="font-serif text-2xl font-bold text-[#1B4332] mb-3">{t.doneTitle}</h1>
        <p className="text-sm text-[#6B7280] leading-relaxed mb-3">{t.doneSub}</p>
        <p className="text-xs text-[#059669] font-medium leading-relaxed">{t.doneNote}</p>
        <div className="mt-6">
          <a href="/" className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl bg-[#1B4332] text-white hover:bg-[#2D6A4F] transition-colors">
            ← {lang === "es" ? "Volver al inicio" : "Back to home"}
          </a>
        </div>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-[#FDF8F1] px-4 py-10">
      <div className="max-w-lg mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <a href="/" className="text-sm text-[#6B7280] hover:text-[#1B4332] transition-colors">← Naranjogo</a>
          <div className="flex bg-[#F4F0EB] rounded-lg p-1 gap-1">
            {(["es","en"] as const).map(l => (
              <button key={l} onClick={() => setLang(l)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${lang===l ? "bg-white text-[#1B4332] shadow-sm" : "text-[#6B7280]"}`}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Hero */}
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl font-bold text-[#1B4332] mb-3">{t.title}</h1>
          <p className="text-sm text-[#6B7280] leading-relaxed mb-5">{t.sub}</p>
          <div className="flex justify-center gap-3 flex-wrap">
            {[t.free, t.verified, t.reach].map(label => (
              <span key={label} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]">
                ✓ {label}
              </span>
            ))}
          </div>
        </div>

        {/* Progress — 4 steps */}
        <div className="flex gap-2 mb-8">
          {[1,2,3,4].map(s => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-full h-1.5 rounded-full transition-all duration-300 ${step >= s ? "bg-[#1B4332]" : "bg-[#E5E0D8]"}`} />
              <span className={`text-[10px] font-medium text-center ${step >= s ? "text-[#1B4332]" : "text-[#A8A095]"}`}>
                {s === 1 ? t.step1 : s === 2 ? t.step2 : s === 3 ? t.step3 : t.step4}
              </span>
            </div>
          ))}
        </div>

        {/* Form card */}
        <div className="bg-white rounded-3xl border border-[#E5E0D8] p-8 shadow-sm">

          {/* ── STEP 1: Your info ── */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-2">{t.name}</label>
                <input value={form.name} onChange={e => set("name", e.target.value)}
                  className="w-full border border-[#E5E0D8] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#1B4332] transition-colors"
                  placeholder="María García" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-2">{t.whatsapp}</label>
                <input value={form.whatsapp} onChange={e => set("whatsapp", e.target.value)}
                  className="w-full border border-[#E5E0D8] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#1B4332] transition-colors"
                  placeholder={t.whatsappPh} type="tel" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-2">{t.colonia}</label>
                <select value={form.colonia} onChange={e => set("colonia", e.target.value)}
                  className="w-full border border-[#E5E0D8] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#1B4332] transition-colors bg-white">
                  <option value="">— {lang === "es" ? "Selecciona tu colonia" : "Select your neighborhood"} —</option>
                  {COLONIAS_LIST.map(c => (
                    <option key={c.value} value={c.value}>{c[lang]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-2">{t.address}</label>
                <input value={form.address} onChange={e => set("address", e.target.value)}
                  className="w-full border border-[#E5E0D8] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#1B4332] transition-colors"
                  placeholder={t.addressPh} />
                <p className="text-xs text-[#A8A095] mt-1">
                  {lang === "es" ? "No se mostrará públicamente — solo para coordenadas de búsqueda." : "Not shown publicly — used only for search location."}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-2">{t.curp}</label>
                <input value={form.curp ?? ""} onChange={e => set("curp", e.target.value.toUpperCase())}
                  className="w-full border border-[#E5E0D8] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#1B4332] transition-colors font-mono tracking-wide"
                  placeholder={t.curpPh} maxLength={18} />
                <p className="text-xs text-[#059669] mt-1 flex items-center gap-1">
                  🛡️ {t.curpHelp}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-2">{t.rfc}</label>
                <input value={form.rfc ?? ""} onChange={e => set("rfc", e.target.value.toUpperCase())}
                  className="w-full border border-[#E5E0D8] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#1B4332] transition-colors font-mono tracking-wide"
                  placeholder={t.rfcPh} maxLength={13} />
                <p className="text-xs text-[#6B7280] mt-1 flex items-center gap-1">
                  📋 {t.rfcHelp}
                </p>
              </div>
              <button onClick={() => setStep(2)}
                disabled={!form.name || !form.whatsapp || !form.colonia}
                className="w-full bg-[#1B4332] text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40 hover:bg-[#2D6A4F] transition-colors">
                {t.next}
              </button>
            </div>
          )}

          {/* ── STEP 2: Your service ── */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-2">{t.service}</label>
                <select value={form.service} onChange={e => {
                  const v = e.target.value;
                  setForm(f => ({
                    ...f,
                    service: v,
                    alternate_services: f.alternate_services.filter(x => x !== v),
                  }));
                }}
                  className="w-full border border-[#E5E0D8] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#1B4332] transition-colors bg-white">
                  <option value="">— {lang === "es" ? "Selecciona" : "Select"} —</option>
                  {SERVICES.map(s => (
                    <option key={s.value} value={s.value}>{s[lang]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-2">{t.providerLanguages}</label>
                <div className="flex flex-col gap-2">
                  {PROVIDER_LANGUAGE_OPTIONS.map(opt => (
                    <label key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${form.provider_languages === opt.value ? "border-[#1B4332] bg-[#ECFDF5]" : "border-[#E5E0D8] hover:border-[#1B4332]"}`}>
                      <input type="radio" name="provider_languages" checked={form.provider_languages === opt.value}
                        onChange={() => set("provider_languages", opt.value)}
                        className="accent-[#1B4332] mt-0.5 w-4 h-4 flex-shrink-0" />
                      <span className="text-sm">{opt[lang]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-2">{t.serviceLocation}</label>
                <div className="flex flex-col gap-2">
                  {SERVICE_LOCATION_OPTIONS.map(opt => (
                    <label key={opt.value}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${form.service_location === opt.value ? "border-[#1B4332] bg-[#ECFDF5]" : "border-[#E5E0D8] hover:border-[#1B4332]"}`}>
                      <input type="radio" name="service_location" checked={form.service_location === opt.value}
                        onChange={() => set("service_location", opt.value)}
                        className="accent-[#1B4332] mt-0.5 w-4 h-4 flex-shrink-0" />
                      <span className="text-sm">{opt[lang]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-2">{t.alternateServices}</label>
                <p className="text-xs text-[#A8A095] mb-2">{t.alternateHint}</p>
                <div className="flex flex-col gap-2 max-h-48 overflow-y-auto rounded-xl border border-[#E5E0D8] p-2">
                  {SERVICES.filter(s => s.value !== form.service).map(s => {
                    const checked = form.alternate_services.includes(s.value);
                    return (
                      <label key={s.value}
                        className={`flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-colors ${checked ? "bg-[#ECFDF5]" : "hover:bg-[#F4F0EB]"}`}>
                        <input type="checkbox" checked={checked}
                          onChange={() => {
                            const next = checked
                              ? form.alternate_services.filter(x => x !== s.value)
                              : [...form.alternate_services, s.value];
                            set("alternate_services", next);
                          }}
                          className="accent-[#1B4332] w-4 h-4 flex-shrink-0" />
                        <span className="text-sm">{s[lang]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="border border-[#E5E0D8] rounded-2xl p-4 bg-[#FDFCFA]">
                <label className="block text-xs font-semibold text-[#6B7280] mb-1">{t.availabilitySection}</label>
                <p className="text-xs text-[#A8A095] mb-3">{t.availabilityHint}</p>

                <div className="flex flex-col gap-2 mb-4">
                  <label
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${form.availability_mode === "on_demand" ? "border-[#1B4332] bg-[#ECFDF5]" : "border-[#E5E0D8] hover:border-[#1B4332]"}`}>
                    <input
                      type="radio"
                      name="availability_mode"
                      checked={form.availability_mode === "on_demand"}
                      onChange={() => set("availability_mode", "on_demand")}
                      className="accent-[#1B4332] mt-0.5 w-4 h-4 flex-shrink-0"
                    />
                    <span className="text-sm">{t.availabilityOnDemand}</span>
                  </label>
                  <label
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${form.availability_mode === "weekly_hours" ? "border-[#1B4332] bg-[#ECFDF5]" : "border-[#E5E0D8] hover:border-[#1B4332]"}`}>
                    <input
                      type="radio"
                      name="availability_mode"
                      checked={form.availability_mode === "weekly_hours"}
                      onChange={() => set("availability_mode", "weekly_hours")}
                      className="accent-[#1B4332] mt-0.5 w-4 h-4 flex-shrink-0"
                    />
                    <span className="text-sm">{t.availabilityWeekly}</span>
                  </label>
                </div>

                {form.availability_mode === "weekly_hours" && (
                  <div className="flex flex-col gap-2 max-h-[22rem] overflow-y-auto rounded-xl border border-[#E5E0D8] bg-white p-2">
                    {WEEKDAYS.map(({ key, es, en }) => {
                      const dayLabel = lang === "es" ? es : en;
                      const slot = form.weekly_hours[key];
                      return (
                        <div
                          key={key}
                          className="rounded-lg px-2 py-2 border border-transparent hover:bg-[#F4F0EB] flex flex-wrap items-center gap-x-2 gap-y-2"
                        >
                          <span className="text-xs font-semibold text-[#1B4332] min-w-[4.75rem] sm:min-w-[5.5rem]">{dayLabel}</span>
                          <label className="flex items-center gap-2 mr-2">
                            <input
                              type="checkbox"
                              checked={slot.closed}
                              onChange={(e) => patchWeeklyDay(key, { closed: e.target.checked })}
                              className="accent-[#1B4332] w-3.5 h-3.5"
                            />
                            <span className="text-xs text-[#6B7280]">{t.availabilityDayClosed}</span>
                          </label>
                          <span className="text-[10px] text-[#A8A095]">{t.availabilityFrom}</span>
                          <select
                            disabled={slot.closed}
                            value={slot.fromHour}
                            onChange={(e) =>
                              patchWeeklyDay(key, { fromHour: Number.parseInt(e.target.value, 10) })
                            }
                            className="border border-[#E5E0D8] rounded-lg px-1.5 py-1 text-xs bg-white outline-none focus:border-[#1B4332] disabled:opacity-45 disabled:pointer-events-none"
                          >
                            {HOURS_12.map((h) => (
                              <option key={`${key}-fh-${h}`} value={h}>{h}</option>
                            ))}
                          </select>
                          <select
                            disabled={slot.closed}
                            value={slot.fromMeridian}
                            onChange={(e) =>
                              patchWeeklyDay(key, {
                                fromMeridian: e.target.value as DayMeridian,
                              })
                            }
                            className="border border-[#E5E0D8] rounded-lg px-1.5 py-1 text-xs bg-white outline-none focus:border-[#1B4332] disabled:opacity-45 disabled:pointer-events-none"
                          >
                            {MERIDIANS.map((m) => (
                              <option key={`${key}-fm-${m}`} value={m}>{m}</option>
                            ))}
                          </select>
                          <span className="text-[10px] text-[#A8A095]">{t.availabilityTo}</span>
                          <select
                            disabled={slot.closed}
                            value={slot.toHour}
                            onChange={(e) =>
                              patchWeeklyDay(key, { toHour: Number.parseInt(e.target.value, 10) })
                            }
                            className="border border-[#E5E0D8] rounded-lg px-1.5 py-1 text-xs bg-white outline-none focus:border-[#1B4332] disabled:opacity-45 disabled:pointer-events-none"
                          >
                            {HOURS_12.map((h) => (
                              <option key={`${key}-th-${h}`} value={h}>{h}</option>
                            ))}
                          </select>
                          <select
                            disabled={slot.closed}
                            value={slot.toMeridian}
                            onChange={(e) =>
                              patchWeeklyDay(key, {
                                toMeridian: e.target.value as DayMeridian,
                              })
                            }
                            className="border border-[#E5E0D8] rounded-lg px-1.5 py-1 text-xs bg-white outline-none focus:border-[#1B4332] disabled:opacity-45 disabled:pointer-events-none"
                          >
                            {MERIDIANS.map((m) => (
                              <option key={`${key}-tm-${m}`} value={m}>{m}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}

                <label className="block text-xs font-semibold text-[#6B7280] mb-1 mt-4">{t.availabilityNotes}</label>
                <textarea
                  value={form.availability_notes}
                  onChange={(e) => set("availability_notes", e.target.value)}
                  rows={2}
                  maxLength={1800}
                  placeholder={t.availabilityNotesPh}
                  className="w-full border border-[#E5E0D8] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#1B4332] transition-colors resize-none bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-2">{t.desc}</label>
                <textarea value={form.description} onChange={e => set("description", e.target.value)}
                  rows={4} placeholder={t.descPh}
                  className="w-full border border-[#E5E0D8] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#1B4332] transition-colors resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-2">{t.price}</label>
                <input value={form.price} onChange={e => set("price", e.target.value)}
                  className="w-full border border-[#E5E0D8] rounded-xl px-4 py-3 text-sm outline-none focus:border-[#1B4332] transition-colors"
                  placeholder={t.pricePh} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#6B7280] mb-2">{t.payment}</label>
                <div className="flex flex-col gap-2">
                  {([
                    ["efectivo", "💵", lang === "es" ? "Efectivo" : "Cash"],
                    ["spei", "🏦", "SPEI"],
                    ["oxxo", "🏪", "OXXO Pay"],
                    ["mercadopago", "💳", "Mercado Pago"],
                    ["whatsapp", "💬", lang === "es" ? "Acordar por WhatsApp" : "Arrange via WhatsApp"],
                  ] as const).map(([val, icon, label]) => {
                    const checked = form.payment_methods.includes(val);
                    return (
                      <label key={val} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${checked ? "border-[#1B4332] bg-[#ECFDF5]" : "border-[#E5E0D8] hover:border-[#1B4332]"}`}>
                        <input type="checkbox" checked={checked}
                          onChange={() => {
                            const next = checked
                              ? form.payment_methods.filter(m => m !== val)
                              : [...form.payment_methods, val];
                            set("payment_methods", next);
                          }}
                          className="accent-[#1B4332] w-4 h-4 flex-shrink-0" />
                        <span className="text-sm">{icon} {label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)}
                  className="flex-none border border-[#E5E0D8] text-[#6B7280] font-medium py-3 px-5 rounded-xl text-sm hover:border-[#1B4332] transition-colors">
                  {t.back}
                </button>
                <button onClick={() => setStep(3)}
                  disabled={
                    !form.service || !form.description || !form.price
                    || !form.provider_languages || !form.service_location
                  }
                  className="flex-1 bg-[#1B4332] text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40 hover:bg-[#2D6A4F] transition-colors">
                  {t.next}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Terms & conditions ── */}
          {step === 3 && (
            <div className="flex flex-col gap-5">
              <h2 className="font-serif text-lg font-bold text-[#1B4332]">{t.termsTitle}</h2>

              {/* Terms list */}
              <div className="flex flex-col gap-4 max-h-72 overflow-y-auto pr-1">
                {[
                  [t.term1Title, t.term1],
                  [t.term2Title, t.term2],
                  [t.term3Title, t.term3],
                  [t.term4Title, t.term4],
                  [t.term5Title, t.term5],
                ].map(([title, body]) => (
                  <div key={title} className="bg-[#F4F0EB] rounded-xl p-4">
                    <p className="text-xs font-bold text-[#1B4332] mb-1">{title}</p>
                    <p className="text-xs text-[#6B7280] leading-relaxed">{body}</p>
                  </div>
                ))}
              </div>

              {/* Checkboxes */}
              <div className="flex flex-col gap-3">
                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${form.acceptTerms ? "border-[#1B4332] bg-[#ECFDF5]" : "border-[#E5E0D8]"}`}>
                  <input type="checkbox" checked={form.acceptTerms}
                    onChange={e => { set("acceptTerms", e.target.checked); setTermsError(false); }}
                    className="mt-0.5 accent-[#1B4332] w-4 h-4 flex-shrink-0" />
                  <span className="text-xs text-[#374151] leading-relaxed">{t.acceptAll}</span>
                </label>
                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${form.acceptPricing ? "border-[#D4A017] bg-[#FFFBEB]" : "border-[#E5E0D8]"}`}>
                  <input type="checkbox" checked={form.acceptPricing}
                    onChange={e => { set("acceptPricing", e.target.checked); setTermsError(false); }}
                    className="mt-0.5 accent-[#D4A017] w-4 h-4 flex-shrink-0" />
                  <span className="text-xs text-[#374151] leading-relaxed">{t.acceptPricing}</span>
                </label>
              </div>

              {termsError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-xl px-4 py-2">{t.mustAccept}</p>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(2)}
                  className="flex-none border border-[#E5E0D8] text-[#6B7280] font-medium py-3 px-5 rounded-xl text-sm hover:border-[#1B4332] transition-colors">
                  {t.back}
                </button>
                <button
                  onClick={() => {
                    if (!form.acceptTerms || !form.acceptPricing) { setTermsError(true); return; }
                    setTermsError(false);
                    setStep(4);
                  }}
                  className="flex-1 bg-[#1B4332] text-white font-semibold py-3 rounded-xl text-sm hover:bg-[#2D6A4F] transition-colors">
                  {t.next}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 4: Confirm & submit ── */}
          {step === 4 && (
            <div className="flex flex-col gap-4">
              {/* Summary */}
              <div className="bg-[#F4F0EB] rounded-2xl p-5 flex flex-col gap-3">
                {[
                  [t.name,     form.name],
                  ["WhatsApp", form.whatsapp],
                  [t.service,  SERVICES.find(s => s.value === form.service)?.[lang] ?? form.service],
                  [t.providerLanguages, PROVIDER_LANGUAGE_OPTIONS.find(o => o.value === form.provider_languages)?.[lang] ?? "—"],
                  [t.serviceLocation, SERVICE_LOCATION_OPTIONS.find(o => o.value === form.service_location)?.[lang] ?? "—"],
                  ...(form.alternate_services.length
                    ? [[t.alternateServices, providerServiceLabels(form.alternate_services, lang)] as [string, string]]
                    : []),
                  ...(availabilityComposite.trim()
                    ? [[t.availabilitySection, availabilityComposite.trim()] as [string, string]]
                    : []),
                  [t.price,    `$${form.price} MXN`],
                  [t.colonia,  COLONIAS_LIST.find(c => c.value === form.colonia)?.[lang] ?? form.colonia],
                  ...(form.curp ? [[t.curp.replace(" (opcional)", "").replace(" (optional)", ""), form.curp]] : []),
                  ...(form.rfc ? [[t.rfc.replace(" (opcional)", "").replace(" (optional)", ""), form.rfc]] : []),
                  [t.payment, form.payment_methods.map(m => {
                    const labels: Record<string, string> = { efectivo: "💵 Efectivo", spei: "🏦 SPEI", oxxo: "🏪 OXXO", mercadopago: "💳 M.Pago", whatsapp: "💬 WhatsApp" };
                    return labels[m] ?? m;
                  }).join(", ")],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-[#6B7280] font-medium">{label}</span>
                    <span className="text-[#1C1917] font-semibold text-right max-w-[60%]">{value}</span>
                  </div>
                ))}
              </div>

              {/* Terms accepted badges */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-xs text-[#065F46] bg-[#ECFDF5] rounded-lg px-3 py-2">
                  <span>✓</span>
                  <span>{lang === "es" ? "Términos y condiciones aceptados" : "Terms and conditions accepted"}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#92400E] bg-[#FFFBEB] rounded-lg px-3 py-2">
                  <span>✓</span>
                  <span>{lang === "es" ? "Términos comerciales futuros reconocidos" : "Future commercial terms acknowledged"}</span>
                </div>
              </div>

              <div className="bg-[#F4F0EB] rounded-xl p-4 text-xs text-[#6B7280] leading-relaxed">
                🛡️ {lang === "es"
                  ? "Tu número de WhatsApp nunca se muestra públicamente. Solo clientes verificados pueden contactarte."
                  : "Your WhatsApp number is never shown publicly. Only verified clients can contact you."}
              </div>

              {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-4 py-3">{error}</p>}

              <div className="flex gap-3">
                <button onClick={() => setStep(3)}
                  className="flex-none border border-[#E5E0D8] text-[#6B7280] font-medium py-3 px-5 rounded-xl text-sm hover:border-[#1B4332] transition-colors">
                  {t.back}
                </button>
                <button onClick={handleSubmit} disabled={loading}
                  className="flex-1 bg-[#D4A017] text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-40 hover:bg-[#C4900D] transition-colors">
                  {loading ? t.submitting : `✓ ${t.submit}`}
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-[#A8A095] mt-6">
          {lang === "es"
            ? "¿Preguntas? Escríbenos a naranjogo.com.mx"
            : "Questions? Contact us at naranjogo.com.mx"}
        </p>
      </div>
    </main>
  );
}
