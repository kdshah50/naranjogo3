/**
 * Property Management (Administración de propiedades) — SMA absentee-owner vertical.
 * Spec: docs/Naranjogo_PropertyManagement_Spec.pdf
 */

export const PROPERTY_MANAGEMENT_SERVICE = "administracion_propiedades";

export const PM_SUB_SERVICES = [
  {
    value: "property_watch",
    es: "Vigilancia de propiedad (Basic)",
    en: "Property Watch (Basic)",
    esDesc: "Recorridos, custodia de llaves, pagos de recibos, respuesta a emergencias.",
    enDesc: "Walkthroughs, key holding, bill pay, emergency response.",
  },
  {
    value: "maintenance_coord",
    es: "Coordinación de mantenimiento",
    en: "Maintenance Coordination",
    esDesc: "Agenda plomeros, jardineros, alberca, HOA; seguimiento de facturas.",
    enDesc: "Schedule plumber, gardener, pool, HOA; invoice tracking.",
  },
  {
    value: "rental_mgmt",
    es: "Gestión de renta / huéspedes",
    en: "Rental / Guest Management",
    esDesc: "Check-in/out, Airbnb/Booking, limpieza entre huéspedes, reporte de ingresos.",
    enDesc: "Check-in/out, Airbnb/Booking upkeep, turnover cleaning, revenue report.",
  },
  {
    value: "full_service",
    es: "Paquete integral (Full-Service)",
    en: "Full-Service Bundle",
    esDesc: "Todo lo anterior con un solo punto de contacto.",
    enDesc: "All of the above with a single point of contact.",
  },
] as const;

export type PmSubService = (typeof PM_SUB_SERVICES)[number]["value"];

export const PM_PACKAGE_TIERS = [
  {
    value: "basic",
    es: "Básico",
    en: "Basic",
    defaultFromMxn: 3500,
    defaultToMxn: 5500,
  },
  {
    value: "standard",
    es: "Estándar",
    en: "Standard",
    defaultFromMxn: 5500,
    defaultToMxn: 9000,
  },
  {
    value: "full_service",
    es: "Integral",
    en: "Full-Service",
    defaultFromMxn: 9000,
    defaultToMxn: 15000,
  },
] as const;

export type PmPackageTier = (typeof PM_PACKAGE_TIERS)[number]["value"];

export const PM_PROPERTY_TYPES = [
  { value: "house", es: "Casa", en: "House" },
  { value: "condo", es: "Condominio / depto", en: "Condo / apartment" },
  { value: "both", es: "Casa y condominio", en: "House and condo" },
] as const;

export type PmPropertyType = (typeof PM_PROPERTY_TYPES)[number]["value"];

export type PmPackageQuote = {
  tier: PmPackageTier;
  from_mxn: number;
  to_mxn: number;
};

export type PmReference = {
  name: string;
  phone: string;
};

/** Stored on listings.property_management (jsonb). */
export type PropertyManagementProfile = {
  version: 1;
  sub_services: PmSubService[];
  packages: PmPackageQuote[];
  property_types_served: PmPropertyType[];
  max_properties: number | null;
  business_legal_name: string;
  years_in_sma: number | null;
  insurance_company: string;
  insurance_policy_ref: string;
  insurance_declared: boolean;
  /** Admin sets true after reviewing proof — drives Insured/Bonded badge. */
  insured_verified: boolean;
  references: PmReference[];
  consultation_required: true;
  billing_model: "monthly_retainer";
};

export type PmBuyerIntake = {
  colonia: string;
  property_type: "house" | "condo";
  occupancy: "occupied" | "vacant";
  use: "personal" | "rental";
  address_note?: string;
};

const SUB_ALLOWED = new Set<string>(PM_SUB_SERVICES.map((s) => s.value));
const TIER_ALLOWED = new Set<string>(PM_PACKAGE_TIERS.map((t) => t.value));
const PROP_ALLOWED = new Set<string>(PM_PROPERTY_TYPES.map((p) => p.value));

export function isPropertyManagementService(slug: string | null | undefined): boolean {
  return slug === PROPERTY_MANAGEMENT_SERVICE;
}

export function sanitizePmSubServices(raw: unknown): PmSubService[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.filter((x): x is PmSubService => typeof x === "string" && SUB_ALLOWED.has(x)),
    ),
  ];
}

export function sanitizePmPackages(raw: unknown): PmPackageQuote[] {
  if (!Array.isArray(raw)) return [];
  const out: PmPackageQuote[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const tier = String(r.tier ?? "");
    if (!TIER_ALLOWED.has(tier)) continue;
    const from = Math.round(Number(r.from_mxn) || 0);
    const to = Math.round(Number(r.to_mxn) || 0);
    if (from < 0 || to < 0) continue;
    out.push({
      tier: tier as PmPackageTier,
      from_mxn: from,
      to_mxn: Math.max(to, from),
    });
  }
  return out;
}

export function sanitizePmPropertyTypes(raw: unknown): PmPropertyType[] {
  if (!Array.isArray(raw)) return [];
  return [
    ...new Set(
      raw.filter((x): x is PmPropertyType => typeof x === "string" && PROP_ALLOWED.has(x)),
    ),
  ];
}

export function sanitizePmReferences(raw: unknown): PmReference[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const name = String(r.name ?? "").trim().slice(0, 120);
      const phone = String(r.phone ?? "").trim().slice(0, 40);
      if (!name || !phone) return null;
      return { name, phone };
    })
    .filter((x): x is PmReference => !!x)
    .slice(0, 2);
}

export function parsePropertyManagementProfile(raw: unknown): PropertyManagementProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const sub_services = sanitizePmSubServices(o.sub_services);
  const packages = sanitizePmPackages(o.packages);
  if (sub_services.length === 0 && packages.length === 0) return null;
  const property_types_served = sanitizePmPropertyTypes(o.property_types_served);
  const references = sanitizePmReferences(o.references);
  const yearsRaw = o.years_in_sma;
  const years =
    yearsRaw === null || yearsRaw === undefined || yearsRaw === ""
      ? null
      : Math.max(0, Math.min(80, Math.round(Number(yearsRaw) || 0)));
  const maxRaw = o.max_properties;
  const max_properties =
    maxRaw === null || maxRaw === undefined || maxRaw === ""
      ? null
      : Math.max(1, Math.min(500, Math.round(Number(maxRaw) || 0)));

  return {
    version: 1,
    sub_services,
    packages,
    property_types_served,
    max_properties,
    business_legal_name: String(o.business_legal_name ?? "").trim().slice(0, 200),
    years_in_sma: years,
    insurance_company: String(o.insurance_company ?? "").trim().slice(0, 120),
    insurance_policy_ref: String(o.insurance_policy_ref ?? "").trim().slice(0, 80),
    insurance_declared: Boolean(o.insurance_declared),
    insured_verified: Boolean(o.insured_verified),
    references,
    consultation_required: true,
    billing_model: "monthly_retainer",
  };
}

export function buildPropertyManagementProfile(input: {
  sub_services: unknown;
  packages: unknown;
  property_types_served: unknown;
  max_properties?: unknown;
  business_legal_name?: unknown;
  years_in_sma?: unknown;
  insurance_company?: unknown;
  insurance_policy_ref?: unknown;
  insurance_declared?: unknown;
  references?: unknown;
}): PropertyManagementProfile | null {
  return parsePropertyManagementProfile({
    ...input,
    insured_verified: false,
    consultation_required: true,
    billing_model: "monthly_retainer",
    version: 1,
  });
}

/** Lowest “from” monthly MXN across packages — used as listing price_mxn (centavos). */
export function pmStartingMonthlyMxn(profile: PropertyManagementProfile | null): number | null {
  if (!profile?.packages.length) return null;
  const mins = profile.packages.map((p) => p.from_mxn).filter((n) => n > 0);
  if (!mins.length) return null;
  return Math.min(...mins);
}

export function pmPackageLabel(tier: PmPackageTier, lang: "es" | "en"): string {
  return PM_PACKAGE_TIERS.find((t) => t.value === tier)?.[lang] ?? tier;
}

export function pmSubServiceLabel(slug: PmSubService, lang: "es" | "en"): string {
  return PM_SUB_SERVICES.find((s) => s.value === slug)?.[lang] ?? slug;
}

export function formatPmPriceLine(
  profile: PropertyManagementProfile | null,
  priceMxnCents: number,
  lang: "es" | "en",
): string {
  const fromPesos =
    pmStartingMonthlyMxn(profile) ??
    (priceMxnCents > 0 ? Math.round(priceMxnCents / 100) : null);
  if (fromPesos == null) {
    return lang === "en" ? "Monthly retainer · consultation" : "Retainer mensual · consulta";
  }
  const fmt = new Intl.NumberFormat(lang === "en" ? "en-MX" : "es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(fromPesos);
  const tierCount = profile?.packages.length ?? 0;
  if (lang === "en") {
    return tierCount > 1
      ? `From ${fmt}/mo · ${tierCount} tiers`
      : `From ${fmt}/mo · retainer`;
  }
  return tierCount > 1
    ? `Desde ${fmt}/mes · ${tierCount} paquetes`
    : `Desde ${fmt}/mes · retainer`;
}

export function propertyManagementMetaFooters(profile: PropertyManagementProfile): {
  es: string;
  en: string;
} {
  const subsEs = profile.sub_services.map((s) => pmSubServiceLabel(s, "es")).join(", ");
  const subsEn = profile.sub_services.map((s) => pmSubServiceLabel(s, "en")).join(", ");
  const pkgsEs = profile.packages
    .map((p) => `${pmPackageLabel(p.tier, "es")}: $${p.from_mxn}–$${p.to_mxn} MXN/mes`)
    .join("; ");
  const pkgsEn = profile.packages
    .map((p) => `${pmPackageLabel(p.tier, "en")}: $${p.from_mxn}–$${p.to_mxn} MXN/mo`)
    .join("; ");
  const typesEs = profile.property_types_served
    .map((v) => PM_PROPERTY_TYPES.find((p) => p.value === v)?.es ?? v)
    .join(", ");
  const typesEn = profile.property_types_served
    .map((v) => PM_PROPERTY_TYPES.find((p) => p.value === v)?.en ?? v)
    .join(", ");

  const esParts = [
    "---",
    "Administración de propiedades",
    "Consulta requerida (retainer mensual — no compra inmediata).",
    profile.business_legal_name ? `Razón social: ${profile.business_legal_name}` : null,
    profile.years_in_sma != null ? `Años operando en SMA: ${profile.years_in_sma}` : null,
    subsEs ? `Sub-servicios: ${subsEs}` : null,
    pkgsEs ? `Paquetes: ${pkgsEs}` : null,
    typesEs ? `Tipos de propiedad: ${typesEs}` : null,
    profile.max_properties != null ? `Máx. propiedades: ${profile.max_properties}` : null,
    profile.insurance_declared
      ? `Seguro/fianza declarado: ${profile.insurance_company || "sí"}${
          profile.insurance_policy_ref ? ` (${profile.insurance_policy_ref})` : ""
        }`
      : null,
    profile.insured_verified ? "Insignia: Asegurado/Fianzado (verificado por admin)." : null,
  ].filter((x): x is string => !!x);

  const enParts = [
    "---",
    "Property management",
    "Consultation required (monthly retainer — not instant checkout).",
    profile.business_legal_name ? `Legal / business name: ${profile.business_legal_name}` : null,
    profile.years_in_sma != null ? `Years operating in SMA: ${profile.years_in_sma}` : null,
    subsEn ? `Sub-services: ${subsEn}` : null,
    pkgsEn ? `Packages: ${pkgsEn}` : null,
    typesEn ? `Property types: ${typesEn}` : null,
    profile.max_properties != null ? `Max properties: ${profile.max_properties}` : null,
    profile.insurance_declared
      ? `Insurance/bonding declared: ${profile.insurance_company || "yes"}${
          profile.insurance_policy_ref ? ` (${profile.insurance_policy_ref})` : ""
        }`
      : null,
    profile.insured_verified ? "Badge: Insured/Bonded (admin verified)." : null,
  ].filter((x): x is string => !!x);

  return {
    es: "\n\n" + esParts.join("\n"),
    en: "\n\n" + enParts.join("\n"),
  };
}

export function formatPmBuyerIntakeWhatsAppMessage(
  intake: PmBuyerIntake,
  lang: "es" | "en",
): string {
  const type =
    intake.property_type === "house"
      ? lang === "es"
        ? "Casa"
        : "House"
      : lang === "es"
        ? "Condominio"
        : "Condo";
  const occ =
    intake.occupancy === "occupied"
      ? lang === "es"
        ? "Ocupada"
        : "Occupied"
      : lang === "es"
        ? "Vacía"
        : "Vacant";
  const use =
    intake.use === "rental"
      ? lang === "es"
        ? "Renta / huéspedes"
        : "Rental / guests"
      : lang === "es"
        ? "Uso personal"
        : "Personal use";

  if (lang === "en") {
    return [
      "Hi — I'd like a property management consultation on Naranjogo.",
      `Colonia: ${intake.colonia || "(not set)"}`,
      `Property type: ${type}`,
      `Occupancy: ${occ}`,
      `Use: ${use}`,
      intake.address_note ? `Notes: ${intake.address_note}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    "Hola — quiero una consulta de administración de propiedades en Naranjogo.",
    `Colonia: ${intake.colonia || "(sin indicar)"}`,
    `Tipo de propiedad: ${type}`,
    `Ocupación: ${occ}`,
    `Uso: ${use}`,
    intake.address_note ? `Notas: ${intake.address_note}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export const PM_BUYER_INTAKE_STORAGE_KEY = "naranjogo_pm_buyer_intake_v1";
