import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleRestHeaders, getSupabaseUrl } from "@/lib/service-rest";
import { COLONIAS, coloniaLabel } from "@/lib/colonias";
import { normalizeCurpForStorage, normalizeRfcForStorage } from "@/lib/mx-tax-ids";
import {
  providerMetaFooters,
  providerServiceLabels,
  providerServiceSupportsMenu,
  PROVIDER_SERVICES,
  PROVIDER_LANGUAGE_OPTIONS,
  SERVICE_LOCATION_OPTIONS,
  sanitizeAlternateServiceSlugs,
  sanitizeCoachingTrainingFocusSlugs,
  sanitizeCoachingTrainingDeliverySlugs,
  coachingFocusLabels,
  coachingDeliveryLabels,
  COACHING_TRAINING_SERVICE,
} from "@/lib/provider-services";
import { hasServiceMenu, parseServiceMenu } from "@/lib/listing-service-menu";
import { rateLimitListingCreateByUser } from "@/lib/rate-limit";
import { createAdminSupabase } from "@/lib/auth-server";
import { embedListingInBackground } from "@/lib/listing-embedding";
import { storageAuthPhone } from "@/lib/phone";
import { pickLoginUserForPhone } from "@/lib/resolve-login-user";

const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP_NUMBER ?? "";
const TWILIO_SID     = process.env.TWILIO_ACCOUNT_SID ?? "";
const TWILIO_TOKEN   = process.env.TWILIO_AUTH_TOKEN ?? "";
const TWILIO_FROM    = process.env.TWILIO_WHATSAPP_FROM ?? "";

async function notifyAdmin(form: any) {
  if (!TWILIO_SID || !TWILIO_TOKEN || !ADMIN_WHATSAPP || !TWILIO_FROM) return;
  try {
    const msg = [
      `🆕 *Naranjogo — Nuevo proveedor*`,
      `👤 ${form.name}`,
      `📱 ${form.whatsapp}`,
      `🔧 ${form.service_label}`,
      `💰 $${form.price} MXN`,
      `📍 ${form.colonia ? (COLONIAS[form.colonia]?.label ?? form.colonia) : form.city}, SMA`,
      ...(form.provider_languages_es ? [`🗣 ${form.provider_languages_es}`] : []),
      ...(form.service_location_es ? [`📌 ${form.service_location_es}`] : []),
      ...(form.alternate_services_es ? [`➕ ${form.alternate_services_es}`] : []),
      ...(form.coaching_training_detail_es ? [`🎓 ${form.coaching_training_detail_es}`] : []),
      ...(form.curp ? [`🪪 CURP: ${form.curp}`] : []),
      ...(form.rfc ? [`📋 RFC: ${form.rfc}`] : []),
      ``,
      `"${(form.description ?? "").slice(0, 120)}..."`,
      ``,
      `✅ Términos aceptados: ${form.accepted_at}`,
      `💡 Pendiente: definir comisión antes de aprobar`,
      ``,
      `→ Aprueba en Supabase: is_verified = true`,
    ].join("\n");

    const body = new URLSearchParams({
      From: `whatsapp:${TWILIO_FROM}`,
      To:   `whatsapp:${ADMIN_WHATSAPP}`,
      Body: msg,
    });
    await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      }
    );
  } catch (e) {
    console.error("WhatsApp notify failed:", e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const SUPA_URL = getSupabaseUrl();
    const h = { ...getServiceRoleRestHeaders(), "Content-Type": "application/json" as const };
    const body = await req.json();
    const {
      name, whatsapp, service, service_label,
      description, price, city, colonia, address, lang,
      accepted_terms, accepted_pricing, accepted_at,
      curp, rfc, payment_methods,
      provider_languages, service_location,
      alternate_services: alternateRaw,
      service_menu: serviceMenuRaw,
    } = body;

    // Validate optional service_menu. Only honored for services that support a menu
    // (e.g. tailoring). Empty / invalid input falls back to NULL — never blocks signup.
    let serviceMenuToStore: unknown = null;
    if (
      serviceMenuRaw != null &&
      providerServiceSupportsMenu(String(service ?? ""))
    ) {
      const parsedMenu = parseServiceMenu(serviceMenuRaw);
      if (parsedMenu.ok && hasServiceMenu(parsedMenu.menu)) {
        serviceMenuToStore = parsedMenu.menu;
      }
    }

    const availability_summary = String((body as { availability_summary?: string }).availability_summary ?? "")
      .trim()
      .slice(0, 2000);

    const alternate_services = sanitizeAlternateServiceSlugs(alternateRaw, String(service ?? ""));
    const serviceStr = String(service ?? "");
    let coaching_focus: string[] = [];
    let coaching_delivery: string[] = [];
    if (serviceStr === COACHING_TRAINING_SERVICE) {
      coaching_focus = sanitizeCoachingTrainingFocusSlugs(
        (body as { coaching_focus?: unknown }).coaching_focus,
      );
      coaching_delivery = sanitizeCoachingTrainingDeliverySlugs(
        (body as { coaching_delivery?: unknown }).coaching_delivery,
      );
      if (coaching_focus.length === 0 || coaching_delivery.length === 0) {
        return NextResponse.json(
          {
            error:
              "Para Coaching y capacitación elige al menos un área (Agile, SAFe, IA, ingeniería) y una modalidad (virtual y/o presencial).",
          },
          { status: 400 },
        );
      }
    }
    const langOk =
      provider_languages === "bilingual" ||
      provider_languages === "spanish_only" ||
      provider_languages === "english_only";
    const locOk = service_location === "in_house" || service_location === "on_site_only";

    // Validate required fields
    if (!name || !whatsapp || !service || !description) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!langOk || !locOk) {
      return NextResponse.json({ error: "Missing provider language or service location" }, { status: 400 });
    }
    if (!accepted_terms || !accepted_pricing) {
      return NextResponse.json({ error: "Terms not accepted" }, { status: 400 });
    }

    // Parse price
    const price_mxn = Math.round(
      parseFloat((price ?? "0").toString().replace(/[^0-9.]/g, "")) * 100
    );

    const phone = storageAuthPhone(String(whatsapp ?? ""));

    // 1. Find existing user by canonical phone (never create a duplicate UUID)
    const supabase = createAdminSupabase();
    const existingUser = await pickLoginUserForPhone(supabase, phone);
    let sellerId: string;

    const cleanCurp = normalizeCurpForStorage(String(curp ?? ""));
    const cleanRfc = normalizeRfcForStorage(String(rfc ?? ""));

    if (existingUser) {
      sellerId = existingUser.id;
      const patch: Record<string, string | boolean> = { phone, phone_verified: true };
      if (cleanCurp) patch.curp = cleanCurp;
      if (cleanRfc) patch.rfc = cleanRfc;
      if (!String(existingUser.display_name ?? "").trim()) patch.display_name = String(name);
      await supabase.from("users").update(patch).eq("id", sellerId);
    } else {
      const userPayload: Record<string, unknown> = {
        phone,
        phone_verified: true,
        display_name: name,
        trust_badge: "none",
      };
      if (cleanCurp) userPayload.curp = cleanCurp;
      if (cleanRfc) userPayload.rfc = cleanRfc;

      const { data: inserted, error: insErr } = await supabase
        .from("users")
        .insert(userPayload)
        .select("id")
        .single();

      if (insErr?.code === "23505") {
        const again = await pickLoginUserForPhone(supabase, phone);
        if (!again) {
          return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
        }
        sellerId = again.id;
      } else if (insErr || !inserted?.id) {
        return NextResponse.json({ error: insErr ?? "Failed to create user" }, { status: 500 });
      } else {
        sellerId = String(inserted.id);
      }
    }

    const rl = await rateLimitListingCreateByUser(sellerId);
    if (!rl.ok) {
      return NextResponse.json(
        {
          error:
            rl.reason === "hour"
              ? "Demasiados registros en poco tiempo. Intenta más tarde."
              : "Límite diario de anuncios alcanzado para este número. Contacta soporte.",
        },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
        },
      );
    }

    // 2. Create listing — is_verified=false (pending admin approval)
    // Get precise coordinates from colonia
    const coloniaKey = colonia ?? "otro";
    const coloniaData = COLONIAS[coloniaKey] ?? COLONIAS["otro"];
    const coloniaLabelEs = coloniaData.label;
    const coloniaLabelEn = coloniaLabel(coloniaKey, "en");
    const svcDef = PROVIDER_SERVICES.find((s) => s.value === serviceStr);
    const titleLabelEs = svcDef?.es ?? String(service_label ?? serviceStr);
    const titleLabelEn = svcDef?.en ?? String(service_label ?? serviceStr);
    const locationCity = `${coloniaLabelEs}, San Miguel de Allende`;
    const descWithAddressEs = address
      ? `${description}\n\nZona: ${coloniaLabelEs}. Ref: ${address}`
      : `${description}\n\nZona: ${coloniaLabelEs}`;
    const descWithAddressEn = address
      ? `${description}\n\nArea: ${coloniaLabelEn}. Ref: ${address}`
      : `${description}\n\nArea: ${coloniaLabelEn}`;
    const meta = providerMetaFooters({
      provider_languages,
      service_location,
      alternate_slugs: alternate_services,
      coaching_focus_slugs: serviceStr === COACHING_TRAINING_SERVICE ? coaching_focus : undefined,
      coaching_delivery_slugs: serviceStr === COACHING_TRAINING_SERVICE ? coaching_delivery : undefined,
    });

    const listing = {
      seller_id:          sellerId,
      title_es:           `${titleLabelEs} — ${coloniaLabelEs}, SMA`,
      title_en:           `${titleLabelEn} — ${coloniaLabelEn}, SMA`,
      description_es:     descWithAddressEs + meta.es,
      description_en:      descWithAddressEn + meta.en,
      price_mxn:          price_mxn > 0 ? price_mxn : 50000,
      category_id:        "services",
      condition:          "new",
      status:             "active",
      is_verified:        false,          // hidden until admin approves
      location_city:      locationCity,
      location_state:     "Guanajuato",
      zip_code:           "37700",
      location_lat:       coloniaData.lat,
      location_lng:       coloniaData.lng,
      shipping_available: false,
      negotiable:         true,
      photo_urls:         [],
      payment_methods:    Array.isArray(payment_methods) && payment_methods.length > 0
                            ? payment_methods
                            : ["efectivo", "whatsapp"],
      expires_at:         new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      ...(availability_summary ? { availability_summary } : {}),
      ...(serviceMenuToStore ? { service_menu: serviceMenuToStore } : {}),
    };

    const listingRes = await fetch(`${SUPA_URL}/rest/v1/listings`, {
      method: "POST",
      headers: {
        ...h,
        Prefer: "return=representation",
      },
      body: JSON.stringify(listing),
    });

    if (!listingRes.ok) {
      let details: unknown;
      try {
        details = await listingRes.json();
      } catch {
        details = { message: await listingRes.text() };
      }
      const msg =
        details &&
        typeof details === "object" &&
        typeof (details as { message?: string }).message === "string"
          ? (details as { message: string }).message
          : JSON.stringify(details);
      console.error("[provider-signup] listing insert failed", details);
      const status =
        listingRes.status >= 400 && listingRes.status < 600 ? listingRes.status : 500;
      return NextResponse.json({ error: msg, details }, { status });
    }

    const listingRows = await listingRes.json();
    const createdListing = Array.isArray(listingRows) ? listingRows[0] : listingRows;
    if (createdListing?.id) {
      embedListingInBackground(supabase, String(createdListing.id), {
        title_es: listing.title_es,
        description_es: listing.description_es,
        description_en: listing.description_en,
      });
    }

    // 3. Notify admin via WhatsApp (non-blocking)
    const provider_languages_es =
      PROVIDER_LANGUAGE_OPTIONS.find((o) => o.value === provider_languages)?.es ?? "";
    const service_location_es =
      SERVICE_LOCATION_OPTIONS.find((o) => o.value === service_location)?.es ?? "";
    const alternate_services_es =
      alternate_services.length > 0 ? providerServiceLabels(alternate_services, "es") : "";
    const coaching_training_detail_es =
      serviceStr === COACHING_TRAINING_SERVICE && (coaching_focus.length > 0 || coaching_delivery.length > 0)
        ? `Capacitación: ${coachingFocusLabels(coaching_focus, "es")} · Modalidad: ${coachingDeliveryLabels(
            coaching_delivery,
            "es",
          )}`
        : "";

    notifyAdmin({
      name,
      whatsapp,
      service_label,
      price,
      city,
      colonia,
      description,
      accepted_at,
      curp: cleanCurp,
      rfc: cleanRfc,
      provider_languages_es,
      service_location_es,
      alternate_services_es,
      coaching_training_detail_es,
    }).catch(() => {});

    return NextResponse.json({ ok: true });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
