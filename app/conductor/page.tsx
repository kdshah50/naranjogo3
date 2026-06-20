"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { withLang } from "@/components/BuyerRetentionPanel";
import { useAppLang } from "@/hooks/use-app-lang";
import { ALL_COLONIA_KEYS, COLONIAS } from "@/lib/colonias";
import {
  clearConductorFormDraft,
  draftHasContent,
  loadConductorDraftPhoto,
  loadConductorFormDraft,
  saveConductorDraftPhoto,
  saveConductorFormDraft,
  type ConductorDraftStep,
  type ConductorFormDraft,
  type ConductorPhotoKind,
} from "@/lib/rides/conductor-form-draft";
import { MAX_DRIVER_DOC_BYTES, MAX_DRIVER_DOC_MB } from "@/lib/rides/driver-storage";
import { formatDriverSignupClientError } from "@/lib/rides/format-api-error";
import { conductorCopy } from "@/lib/rides/ui-copy";

const COLONIAS_LIST = ALL_COLONIA_KEYS.map((key) => ({
  value: key,
  label: COLONIAS[key].label,
}));

type Step = ConductorDraftStep;

export default function ConductorPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#F8F4ED] flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#1B4332] border-t-transparent" />
        </main>
      }
    >
      <ConductorPageInner />
    </Suspense>
  );
}

function ConductorPageInner() {
  const lang = useAppLang();
  const t = conductorCopy(lang);

  const [draftReady, setDraftReady] = useState(false);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const restoreStartedRef = useRef(false);

  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [curp, setCurp] = useState("");
  const [rfc, setRfc] = useState("");

  const [licenseNumber, setLicenseNumber] = useState("");
  const [licenseExpiry, setLicenseExpiry] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState(String(new Date().getFullYear()));
  const [vehicleColor, setVehicleColor] = useState("");
  const [vehiclePlates, setVehiclePlates] = useState("");
  const [insuranceProvider, setInsuranceProvider] = useState("");
  const [insurancePolicy, setInsurancePolicy] = useState("");
  const [insuranceExpiry, setInsuranceExpiry] = useState("");

  const [primaryColonia, setPrimaryColonia] = useState("centro");
  const [extraColonias, setExtraColonias] = useState<string[]>([]);
  const [description, setDescription] = useState("");

  const [licensePhoto, setLicensePhoto] = useState<File | null>(null);
  const [vehicleCardPhoto, setVehicleCardPhoto] = useState<File | null>(null);
  const [insurancePhoto, setInsurancePhoto] = useState<File | null>(null);

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPricing, setAcceptedPricing] = useState(false);

  const buildDraft = useCallback(
    (): ConductorFormDraft => ({
      step,
      name,
      whatsapp,
      curp,
      rfc,
      licenseNumber,
      licenseExpiry,
      vehicleMake,
      vehicleModel,
      vehicleYear,
      vehicleColor,
      vehiclePlates,
      insuranceProvider,
      insurancePolicy,
      insuranceExpiry,
      primaryColonia,
      extraColonias,
      description,
      acceptedTerms,
      acceptedPricing,
      savedAt: new Date().toISOString(),
    }),
    [
      step,
      name,
      whatsapp,
      curp,
      rfc,
      licenseNumber,
      licenseExpiry,
      vehicleMake,
      vehicleModel,
      vehicleYear,
      vehicleColor,
      vehiclePlates,
      insuranceProvider,
      insurancePolicy,
      insuranceExpiry,
      primaryColonia,
      extraColonias,
      description,
      acceptedTerms,
      acceptedPricing,
    ],
  );

  const persistDraftNow = useCallback(() => {
    if (!draftReady || done) return false;
    const draft = buildDraft();
    if (!draftHasContent(draft)) return false;
    const ok = saveConductorFormDraft(draft);
    if (ok) setLastSavedAt(new Date().toISOString());
    return ok;
  }, [buildDraft, draftReady, done]);

  useEffect(() => {
    if (restoreStartedRef.current) return;
    restoreStartedRef.current = true;

    const draft = loadConductorFormDraft();
    if (draft && draftHasContent(draft)) {
      setStep(draft.step);
      setName(draft.name);
      setWhatsapp(draft.whatsapp);
      setCurp(draft.curp);
      setRfc(draft.rfc);
      setLicenseNumber(draft.licenseNumber);
      setLicenseExpiry(draft.licenseExpiry);
      setVehicleMake(draft.vehicleMake);
      setVehicleModel(draft.vehicleModel);
      setVehicleYear(draft.vehicleYear);
      setVehicleColor(draft.vehicleColor);
      setVehiclePlates(draft.vehiclePlates);
      setInsuranceProvider(draft.insuranceProvider);
      setInsurancePolicy(draft.insurancePolicy);
      setInsuranceExpiry(draft.insuranceExpiry);
      setPrimaryColonia(draft.primaryColonia);
      setExtraColonias(draft.extraColonias);
      setDescription(draft.description);
      setAcceptedTerms(draft.acceptedTerms);
      setAcceptedPricing(draft.acceptedPricing);
      if (draft.savedAt) setLastSavedAt(draft.savedAt);
      setDraftNote(t.draftRestored);
    }

    void (async () => {
      const [license, vehicleCard, insurance] = await Promise.all([
        loadConductorDraftPhoto("license"),
        loadConductorDraftPhoto("vehicle_card"),
        loadConductorDraftPhoto("insurance"),
      ]);
      if (license) setLicensePhoto(license);
      if (vehicleCard) setVehicleCardPhoto(vehicleCard);
      if (insurance) setInsurancePhoto(insurance);
      setDraftReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!draftReady || done) return;
    const id = window.setTimeout(() => {
      const draft = buildDraft();
      if (draftHasContent(draft) && saveConductorFormDraft(draft)) {
        setLastSavedAt(new Date().toISOString());
      }
    }, 500);
    return () => window.clearTimeout(id);
  }, [draftReady, done, buildDraft]);

  useEffect(() => {
    if (!draftReady || done) return;
    const onLeave = () => {
      const draft = buildDraft();
      if (draftHasContent(draft)) saveConductorFormDraft(draft);
    };
    window.addEventListener("beforeunload", onLeave);
    document.addEventListener("visibilitychange", onLeave);
    return () => {
      window.removeEventListener("beforeunload", onLeave);
      document.removeEventListener("visibilitychange", onLeave);
    };
  }, [draftReady, done, buildDraft]);

  const setDraftPhoto = (kind: ConductorPhotoKind, file: File | null) => {
    if (kind === "license") setLicensePhoto(file);
    else if (kind === "vehicle_card") setVehicleCardPhoto(file);
    else setInsurancePhoto(file);
    if (file && draftReady) void saveConductorDraftPhoto(kind, file);
  };

  const goToStep = (next: Step) => {
    persistDraftNow();
    setStep(next);
  };

  const clearDraft = async () => {
    await clearConductorFormDraft();
    setStep(1);
    setName("");
    setWhatsapp("");
    setCurp("");
    setRfc("");
    setLicenseNumber("");
    setLicenseExpiry("");
    setVehicleMake("");
    setVehicleModel("");
    setVehicleYear(String(new Date().getFullYear()));
    setVehicleColor("");
    setVehiclePlates("");
    setInsuranceProvider("");
    setInsurancePolicy("");
    setInsuranceExpiry("");
    setPrimaryColonia("centro");
    setExtraColonias([]);
    setDescription("");
    setLicensePhoto(null);
    setVehicleCardPhoto(null);
    setInsurancePhoto(null);
    setAcceptedTerms(false);
    setAcceptedPricing(false);
    setDraftNote(null);
    setLastSavedAt(null);
    setError(null);
    setDraftReady(true);
  };

  const serviceColonias = useMemo(() => {
    const set = new Set([primaryColonia, ...extraColonias]);
    return [...set];
  }, [primaryColonia, extraColonias]);

  const toggleColonia = (key: string) => {
    if (key === primaryColonia) return;
    setExtraColonias((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const submit = async () => {
    setError(null);
    if (!licensePhoto || !vehicleCardPhoto || !insurancePhoto) {
      setError(t.photosRequired);
      return;
    }
    for (const [label, file] of [
      [t.licenseLabel, licensePhoto],
      [t.vehicleCardLabel, vehicleCardPhoto],
      [t.policyLabel, insurancePhoto],
    ] as const) {
      if (file.size > MAX_DRIVER_DOC_BYTES) {
        setError(
          t.photoTooLarge(label, MAX_DRIVER_DOC_MB, (file.size / 1024 / 1024).toFixed(1)),
        );
        return;
      }
    }
    if (!acceptedTerms || !acceptedPricing) {
      setError(t.mustAcceptTerms);
      return;
    }

    setBusy(true);
    try {
      const photoPaths: {
        license_photo_url?: string;
        vehicle_card_photo_url?: string;
        insurance_photo_url?: string;
      } = {};

      const uploadOne = async (
        kind: "license" | "vehicle_card" | "insurance",
        file: File,
      ): Promise<boolean> => {
        const fd = new FormData();
        fd.append("name", name);
        fd.append("whatsapp", whatsapp);
        if (curp) fd.append("curp", curp);
        if (rfc) fd.append("rfc", rfc);
        fd.append("kind", kind);
        fd.append("file", file);

        const res = await fetch("/api/rides/drivers/upload-doc", { method: "POST", body: fd });
        const raw = await res.text();
        let data: unknown = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          data = { error: raw.slice(0, 200) };
        }
        if (!res.ok) {
          setError(formatDriverSignupClientError(res.status, data, lang));
          return false;
        }
        const path = (data as { object_path?: string }).object_path;
        if (!path) {
          setError(t.photoSaveFailed);
          return false;
        }
        if (kind === "license") photoPaths.license_photo_url = path;
        else if (kind === "vehicle_card") photoPaths.vehicle_card_photo_url = path;
        else photoPaths.insurance_photo_url = path;
        return true;
      };

      if (!(await uploadOne("license", licensePhoto))) return;
      if (!(await uploadOne("vehicle_card", vehicleCardPhoto))) return;
      if (!(await uploadOne("insurance", insurancePhoto))) return;

      const payload = {
        name,
        whatsapp,
        curp: curp || undefined,
        rfc: rfc || undefined,
        license_number: licenseNumber,
        license_expiry: licenseExpiry,
        vehicle_make: vehicleMake,
        vehicle_model: vehicleModel,
        vehicle_year: vehicleYear,
        vehicle_color: vehicleColor,
        vehicle_plates: vehiclePlates,
        insurance_provider: insuranceProvider,
        insurance_policy: insurancePolicy,
        insurance_expiry: insuranceExpiry,
        colonia: primaryColonia,
        service_colonias: serviceColonias,
        description: description || undefined,
        accepted_terms: true,
        accepted_pricing: true,
        accepted_at: new Date().toISOString(),
        ...photoPaths,
      };

      const res = await fetch("/api/driver-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const raw = await res.text();
      let data: unknown = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw.slice(0, 200) };
      }
      if (!res.ok) {
        setError(formatDriverSignupClientError(res.status, data, lang));
        return;
      }
      await clearConductorFormDraft();
      setDone(true);
    } catch {
      setError(t.networkError);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <main className="min-h-screen bg-[#F8F4ED] px-4 py-10">
        <div className="mx-auto max-w-lg rounded-2xl border border-[#A7F3D0] bg-white p-8 text-center shadow-sm">
          <div className="text-4xl mb-4">🚕</div>
          <h1 className="text-2xl font-bold text-[#1B4332] mb-2">{t.doneTitle}</h1>
          <p className="text-gray-600 mb-6">{t.doneBody}</p>
          <p className="text-sm text-gray-500 mb-6">{t.doneStripe}</p>
          <Link
            href={withLang("/profile", lang)}
            className="inline-block rounded-xl bg-[#1B4332] px-6 py-3 text-white font-medium"
          >
            {t.goToProfile}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F8F4ED] px-4 py-8">
      <div className="mx-auto max-w-xl">
        <div className="mb-6">
          <Link href={withLang("/", lang)} className="text-sm text-[#1B4332]/70 hover:underline">
            {t.backHome}
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-[#1B4332]">{t.title}</h1>
          <p className="text-gray-600 mt-1">{t.subtitle}</p>
          {draftNote && (
            <p className="mt-2 text-sm text-[#1B4332] bg-[#E8F5E9] rounded-lg px-3 py-2">
              {draftNote}
            </p>
          )}
          {lastSavedAt && draftReady && !done && (
            <p className="mt-1 text-xs text-gray-500">
              {t.draftSaved}
              {draftHasContent(buildDraft()) ? "" : t.draftEmpty}.
            </p>
          )}
        </div>

        <div className="mb-6 flex gap-2">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className={`h-1 flex-1 rounded-full ${step >= n ? "bg-[#1B4332]" : "bg-gray-200"}`}
            />
          ))}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
          {step === 1 && (
            <>
              <h2 className="font-semibold text-lg">{t.step1Title}</h2>
              <Field label={t.fullName} value={name} onChange={setName} required />
              <Field
                label={t.whatsapp}
                value={whatsapp}
                onChange={setWhatsapp}
                placeholder={t.whatsappPlaceholder}
                required
              />
              <Field label={t.curpOptional} value={curp} onChange={setCurp} />
              <Field label={t.rfcOptional} value={rfc} onChange={setRfc} />
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="font-semibold text-lg">{t.step2Title}</h2>
              <Field label={t.licenseNumber} value={licenseNumber} onChange={setLicenseNumber} required />
              <Field
                label={t.licenseExpiry}
                value={licenseExpiry}
                onChange={setLicenseExpiry}
                type="date"
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <Field label={t.make} value={vehicleMake} onChange={setVehicleMake} required />
                <Field label={t.model} value={vehicleModel} onChange={setVehicleModel} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t.year} value={vehicleYear} onChange={setVehicleYear} type="number" required />
                <Field label={t.color} value={vehicleColor} onChange={setVehicleColor} required />
              </div>
              <Field label={t.plates} value={vehiclePlates} onChange={setVehiclePlates} required />
              <Field
                label={t.insurer}
                value={insuranceProvider}
                onChange={setInsuranceProvider}
                required
              />
              <Field label={t.policyNumber} value={insurancePolicy} onChange={setInsurancePolicy} required />
              <Field
                label={t.insuranceExpiry}
                value={insuranceExpiry}
                onChange={setInsuranceExpiry}
                type="date"
                required
              />
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="font-semibold text-lg">{t.step3Title}</h2>
              <label className="block text-sm font-medium text-gray-700">{t.primaryColonia}</label>
              <select
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2"
                value={primaryColonia}
                onChange={(e) => setPrimaryColonia(e.target.value)}
              >
                {COLONIAS_LIST.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <p className="text-sm text-gray-500 mt-4">{t.extraColonias}</p>
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                {COLONIAS_LIST.filter((c) => c.value !== primaryColonia).map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => toggleColonia(c.value)}
                    className={`rounded-full px-3 py-1 text-sm border ${
                      extraColonias.includes(c.value)
                        ? "bg-[#1B4332] text-white border-[#1B4332]"
                        : "bg-white text-gray-700 border-gray-200"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <label className="block text-sm font-medium text-gray-700 mt-4">
                {t.notesOptional}
              </label>
              <textarea
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 min-h-[80px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t.notesPlaceholder}
              />
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="font-semibold text-lg">{t.step4Title}</h2>
              <p className="text-sm text-gray-500">{t.photoHint(MAX_DRIVER_DOC_MB)}</p>
              <PhotoField
                label={t.licensePhoto}
                file={licensePhoto}
                onChange={(f) => setDraftPhoto("license", f)}
                tooLargeSuffix={t.fileTooLarge(MAX_DRIVER_DOC_MB)}
              />
              <PhotoField
                label={t.vehicleCardPhoto}
                file={vehicleCardPhoto}
                onChange={(f) => setDraftPhoto("vehicle_card", f)}
                tooLargeSuffix={t.fileTooLarge(MAX_DRIVER_DOC_MB)}
              />
              <PhotoField
                label={t.insurancePhoto}
                file={insurancePhoto}
                onChange={(f) => setDraftPhoto("insurance", f)}
                tooLargeSuffix={t.fileTooLarge(MAX_DRIVER_DOC_MB)}
              />
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-1"
                />
                <span>{t.acceptTerms}</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={acceptedPricing}
                  onChange={(e) => setAcceptedPricing(e.target.checked)}
                  className="mt-1"
                />
                <span>{t.acceptPricing}</span>
              </label>
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex justify-between pt-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => goToStep((step - 1) as Step)}
                className="text-[#1B4332] font-medium"
              >
                {t.back}
              </button>
            ) : (
              <span />
            )}
            {step < 4 ? (
              <button
                type="button"
                onClick={() => goToStep((step + 1) as Step)}
                className="rounded-xl bg-[#1B4332] px-5 py-2 text-white font-medium"
              >
                {t.continue}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={submit}
                className="rounded-xl bg-[#1B4332] px-5 py-2 text-white font-medium disabled:opacity-60"
              >
                {busy ? t.submitting : t.submit}
              </button>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-500">
          {t.footerDraft}{" "}
          <button
            type="button"
            onClick={() => void clearDraft()}
            className="underline text-[#1B4332]/80 hover:text-[#1B4332]"
          >
            {t.clearDraft}
          </button>
        </p>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2"
        required={required}
      />
    </label>
  );
}

function PhotoField({
  label,
  file,
  onChange,
  tooLargeSuffix,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  tooLargeSuffix: string;
}) {
  const tooLarge = file != null && file.size > MAX_DRIVER_DOC_BYTES;
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label} *</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="mt-1 w-full text-sm"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {file && (
        <p className={`text-xs mt-1 ${tooLarge ? "text-red-600" : "text-gray-500"}`}>
          {file.name} ({(file.size / 1024).toFixed(0)} KB)
          {tooLarge ? tooLargeSuffix : ""}
        </p>
      )}
    </label>
  );
}
