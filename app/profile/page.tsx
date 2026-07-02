"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import LoyaltyCard from "@/components/LoyaltyCard";
import ReferralCard from "@/components/ReferralCard";
import RoutineHabitsCard from "@/components/RoutineHabitsCard";
import SellerStripePayoutCard from "@/components/SellerStripePayoutCard";
import { useAppLang, useAppLangActions } from "@/hooks/use-app-lang";
import { formatCurrencyMXN } from "@/lib/locale-format";
import { listingTitleSupportsServiceMenu } from "@/lib/infer-listing-provider-slug";
import { fetchRidesEnabledOnServer } from "@/lib/rides/client-rides-enabled";

type User = {
  id: string;
  phone: string | null;
  display_name: string | null;
  trust_badge: string;
  phone_verified: boolean;
  ine_verified: boolean;
  rfc_verified: boolean;
  curp: string | null;
  rfc: string | null;
  ine_photo_url: string | null;
  stripe_connect_account_id?: string | null;
  created_at: string | null;
};

type Listing = {
  id: string;
  title_es: string;
  price_mxn: number;
  status: string;
  is_verified: boolean;
  category_id: string;
  location_city: string;
  created_at: string;
};

function badgeInfo(badge: string) {
  const map: Record<string, { icon: string; label: string; color: string; bg: string }> = {
    diamond: { icon: "💎", label: "Diamond", color: "#1D4ED8", bg: "#EFF6FF" },
    gold:    { icon: "🥇", label: "Gold",    color: "#92400E", bg: "#FEF3C7" },
    bronze:  { icon: "🥉", label: "Bronze",  color: "#78350F", bg: "#FEF9EE" },
    none:    { icon: "✓",  label: "Verificado", color: "#065F46", bg: "#ECFDF5" },
  };
  return map[badge] ?? map.none;
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#FDF8F1] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <ProfilePageInner />
    </Suspense>
  );
}

function ProfilePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stripeReturn = searchParams.get("stripe_connect");
  const [user, setUser] = useState<User | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const lang = useAppLang();
  const { setLang } = useAppLangActions();
  const [ineUploading, setIneUploading] = useState(false);
  const [ineMsg, setIneMsg] = useState("");
  const [favorites, setFavorites] = useState<
    { listing_id: string; title: string; price_mxn: number; location_city: string | null }[]
  >([]);
  const [pendingReviewCount, setPendingReviewCount] = useState(0);
  const [ridesEnabled, setRidesEnabled] = useState(false);

  useEffect(() => {
    void fetchRidesEnabledOnServer().then(setRidesEnabled);
  }, []);

  useEffect(() => {
    if (!user) return;
    fetch("/api/favorites?enrich=1", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { favorites: [] }))
      .then((d) => {
        setFavorites(Array.isArray(d.favorites) ? d.favorites : []);
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/bookings?status=paid", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = Array.isArray(d?.bookings) ? d.bookings : [];
        const n = list.filter(
          (b: { status?: string; has_review?: boolean }) =>
            String(b.status ?? "") === "completed" && !b.has_review
        ).length;
        setPendingReviewCount(n);
      })
      .catch(() => setPendingReviewCount(0));
  }, [user]);

  const t = {
    es: {
      myProfile:      "Mi perfil",
      memberSince:    "Miembro desde",
      phone:          "Teléfono",
      verified:       "Verificado",
      editName:       "Editar nombre",
      saveName:       "Guardar",
      cancel:         "Cancelar",
      myServices:     "Mis anuncios",
      noServices:     "No tienes anuncios publicados aún.",
      addService:     "Publicar servicio",
      pending:        "Pendiente aprobación",
      live:           "En línea",
      sold:           "Vendido",
      archived:       "Archivado",
      logout:         "Cerrar sesión",
      namePlaceholder:"Tu nombre completo",
      verifyBadge:    "Insignia de confianza",
      contactSupport: "¿Preguntas? Escríbenos",
      editMenu:       "Editar menú",
      phase3:         "Historial de reservas, reseñas, puntos e invitaciones: todo en un solo lugar.",
    },
    en: {
      myProfile:      "My profile",
      memberSince:    "Member since",
      phone:          "Phone",
      verified:       "Verified",
      editName:       "Edit name",
      saveName:       "Save",
      cancel:         "Cancel",
      myServices:     "My listings",
      noServices:     "You haven't posted any listings yet.",
      addService:     "Post a service",
      pending:        "Pending approval",
      live:           "Live",
      sold:           "Sold",
      archived:       "Archived",
      logout:         "Log out",
      namePlaceholder:"Your full name",
      verifyBadge:    "Trust badge",
      contactSupport: "Questions? Contact us",
      editMenu:       "Edit menu",
      phase3:         "Bookings, reviews, points, and referrals—everything in one place.",
    },
  }[lang];

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) {
          router.push("/auth/login");
          return;
        }
        const data = await res.json();
        const userData = data.user as User | undefined;
        const listingsData = data.listings as Listing[] | undefined;
        if (!userData) {
          router.push("/auth/login");
          return;
        }
        setUser(userData);
        setDisplayName(userData.display_name ?? "");
        setListings(Array.isArray(listingsData) ? listingsData : []);
        setLoading(false);
      })
      .catch(() => {
        router.push("/auth/login");
      });
  }, [router]);

  const handleSaveName = async () => {
    if (!user || !displayName.trim()) return;
    setSaving(true);
    const res = await fetch("/api/auth/me", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: displayName.trim() }),
    });
    if (res.ok) {
      const data = await res.json();
      const u = data.user as User | undefined;
      if (u) setUser(u);
    }
    setEditing(false);
    setSaving(false);
  };

  const handleLogout = () => {
    void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).finally(() => {
      router.push("/");
    });
  };

  const handleIneUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIneUploading(true);
    setIneMsg("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload-ine", { method: "POST", credentials: "same-origin", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setIneMsg(lang === "es" ? "✓ INE subida correctamente. Revisaremos tu documento." : "✓ INE uploaded. We'll review your document.");
      if (user) setUser({ ...user, ine_photo_url: data.url });
    } catch (err: any) {
      setIneMsg(err.message ?? "Error");
    } finally {
      setIneUploading(false);
    }
  };

  if (loading) return (
    <main className="min-h-screen bg-[#FDF8F1] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
    </main>
  );

  if (!user) return null;

  const badge = badgeInfo(user.trust_badge ?? "none");
  const memberYear = user.created_at ? new Date(user.created_at).getFullYear() : new Date().getFullYear();
  const fallbackPhone = user.phone ? user.phone.slice(-4) : "NA";
  const initials = (user.display_name?.trim() || fallbackPhone).slice(0, 2).toUpperCase();
  const activeListings   = listings.filter(l => l.status === "active" && l.is_verified);
  const pendingListings  = listings.filter(l => l.status === "active" && !l.is_verified);
  const soldListings     = listings.filter(l => l.status === "sold");
  const archivedListings = listings.filter(l => l.status === "archived");

  return (
    <main className="min-h-screen bg-[#FDF8F1] px-4 py-8">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/" className="text-sm text-[#6B7280] hover:text-[#1B4332] transition-colors">← {lang === "es" ? "Inicio" : "Home"}</Link>
          <div className="flex bg-[#F4F0EB] rounded-lg p-1 gap-1">
            {(["es", "en"] as const).map(l => (
              <button key={l} onClick={() => { setLang(l); }}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${lang === l ? "bg-white text-[#1B4332] shadow-sm" : "text-[#6B7280]"}`}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Profile card */}
        <div className="bg-white rounded-3xl border border-[#E5E0D8] p-8 mb-5 shadow-sm">
          <div className="flex items-start gap-5">
            {/* Avatar */}
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#1B4332] to-[#2D6A4F] flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
              {initials}
            </div>

            <div className="flex-1 min-w-0">
              {/* Name */}
              {editing ? (
                <div className="flex gap-2 mb-2">
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                    placeholder={t.namePlaceholder}
                    className="flex-1 border border-[#E5E0D8] rounded-xl px-3 py-2 text-sm outline-none focus:border-[#1B4332]" />
                  <button onClick={handleSaveName} disabled={saving}
                    className="px-3 py-2 bg-[#1B4332] text-white text-xs font-semibold rounded-xl disabled:opacity-50">
                    {saving ? "..." : t.saveName}
                  </button>
                  <button onClick={() => setEditing(false)}
                    className="px-3 py-2 border border-[#E5E0D8] text-[#6B7280] text-xs rounded-xl">
                    {t.cancel}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="font-serif text-xl font-bold text-[#1C1917]">
                    {user.display_name ?? user.phone ?? "Usuario"}
                  </h1>
                  <button onClick={() => setEditing(true)}
                    className="text-xs text-[#6B7280] hover:text-[#1B4332] transition-colors">
                    ✏️
                  </button>
                </div>
              )}

              <p className="text-xs text-[#6B7280] mb-3">{t.memberSince} {memberYear}</p>

              {/* Badges row */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ color: badge.color, background: badge.bg }}>
                  {badge.icon} {badge.label}
                </span>
                {user.phone_verified && (
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#ECFDF5] text-[#065F46]">
                    📱 {t.phone} {t.verified}
                  </span>
                )}
                {user.ine_verified && (
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#FEF3C7] text-[#92400E]">
                    🪪 INE {t.verified}
                  </span>
                )}
                {user.rfc_verified && (
                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-50 text-indigo-900 border border-indigo-200/80">
                    📋 RFC {t.verified}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { value: activeListings.length,  label: lang === "es" ? "En línea" : "Live" },
            { value: pendingListings.length,  label: lang === "es" ? "Pendientes" : "Pending" },
            { value: soldListings.length,     label: t.sold },
            { value: archivedListings.length, label: lang === "es" ? "Archivados" : "Archived" },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-[#E5E0D8] p-4 text-center">
              <div className="text-2xl font-bold text-[#1B4332]">{s.value}</div>
              <div className="text-xs text-[#6B7280] mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* INE Verification */}
        <div className="bg-white rounded-3xl border border-[#E5E0D8] p-6 mb-5 shadow-sm">
          <h2 className="font-serif text-lg font-bold text-[#1C1917] mb-3">
            🪪 {lang === "es" ? "Verificación de identidad" : "Identity verification"}
          </h2>

          {user.rfc_verified && (
            <div className="bg-indigo-50 border border-indigo-200/80 rounded-xl p-4 text-sm text-indigo-900 font-medium flex items-center gap-2 mb-3">
              ✓{" "}
              {lang === "es"
                ? "Tu RFC fue revisado por el equipo de Naranjogo"
                : "Your RFC has been reviewed by the Naranjogo team"}
            </div>
          )}

          {user.ine_verified ? (
            <div className="bg-[#ECFDF5] rounded-xl p-4 text-sm text-[#065F46] font-medium flex items-center gap-2">
              ✓ {lang === "es" ? "Tu identidad ha sido verificada" : "Your identity has been verified"}
            </div>
          ) : user.ine_photo_url ? (
            <div className="bg-[#FEF3C7] rounded-xl p-4 text-sm text-[#92400E] font-medium flex items-center gap-2">
              ⏳ {lang === "es" ? "Tu INE está en revisión. Te notificaremos por WhatsApp." : "Your INE is under review. We'll notify you via WhatsApp."}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-[#6B7280] leading-relaxed">
                {lang === "es"
                  ? "Sube una foto de tu INE para aparecer como proveedor verificado. Tu documento será revisado por nuestro equipo."
                  : "Upload a photo of your INE to appear as a verified provider. Your document will be reviewed by our team."}
              </p>
              <label className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold cursor-pointer transition-colors ${
                ineUploading ? "bg-[#E5E0D8] text-[#6B7280]" : "bg-[#1B4332] text-white hover:bg-[#2D6A4F]"
              }`}>
                {ineUploading
                  ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> {lang === "es" ? "Subiendo..." : "Uploading..."}</>
                  : <>📸 {lang === "es" ? "Subir foto de INE" : "Upload INE photo"}</>
                }
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleIneUpload} className="hidden" disabled={ineUploading} />
              </label>
              <p className="text-[11px] text-[#9CA3AF]">
                {lang === "es" ? "JPEG, PNG o WebP · Máximo 5 MB · Tu foto no se muestra públicamente" : "JPEG, PNG, or WebP · Max 5 MB · Your photo is not shown publicly"}
              </p>
            </div>
          )}

          {(user.curp || user.rfc) && (
            <div className="mt-3 bg-[#F4F0EB] rounded-xl px-4 py-2 text-xs space-y-1">
              {user.curp && (
                <div>
                  <span className="text-[#6B7280] font-medium">CURP: </span>
                  <span className="font-mono text-[#1C1917] tracking-wide">{user.curp}</span>
                </div>
              )}
              {user.rfc && (
                <div>
                  <span className="text-[#6B7280] font-medium">RFC: </span>
                  <span className="font-mono text-[#1C1917] tracking-wide">{user.rfc}</span>
                </div>
              )}
            </div>
          )}

          {ineMsg && (
            <p className={`mt-3 text-xs rounded-xl px-4 py-2 ${
              ineMsg.startsWith("✓") ? "bg-[#ECFDF5] text-[#065F46]" : "bg-red-50 text-red-600"
            }`}>
              {ineMsg}
            </p>
          )}
        </div>

        <SellerStripePayoutCard
          lang={lang}
          hasStripeConnect={Boolean(user.stripe_connect_account_id?.startsWith("acct_"))}
          stripeReturn={stripeReturn}
        />

        {/* My services */}
        <div className="bg-white rounded-3xl border border-[#E5E0D8] p-6 mb-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-lg font-bold text-[#1C1917]">{t.myServices}</h2>
            <Link href="/unete"
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#1B4332] text-white hover:bg-[#2D6A4F] transition-colors">
              + {t.addService}
            </Link>
          </div>

          {listings.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-sm text-[#6B7280] mb-4">{t.noServices}</p>
              <Link href="/unete"
                className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl bg-[#D4A017] text-white hover:bg-[#C4900D] transition-colors">
                {t.addService} →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {listings.map(l => (
                <div
                  key={l.id}
                  className="flex items-center gap-2 p-3 rounded-xl bg-[#F4F0EB]"
                >
                  <Link
                    href={`/listing/${l.id}`}
                    className="flex flex-1 min-w-0 items-center gap-3 hover:opacity-90 transition-opacity"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1C1917] truncate">{l.title_es}</p>
                      <p className="text-xs text-[#6B7280] mt-0.5">{formatCurrencyMXN(l.price_mxn, lang)} · {l.location_city}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${
                      l.is_verified && l.status === "active"
                        ? "bg-[#ECFDF5] text-[#065F46]"
                        : l.status === "sold"
                        ? "bg-[#EFF6FF] text-[#1D4ED8]"
                        : l.status === "archived"
                        ? "bg-[#F4F0EB] text-[#9CA3AF]"
                        : "bg-[#FFFBEB] text-[#92400E]"
                    }`}>
                      {l.is_verified && l.status === "active"
                        ? `✓ ${t.live}`
                        : l.status === "sold"
                        ? t.sold
                        : l.status === "archived"
                        ? t.archived
                        : `⏳ ${t.pending}`}
                    </span>
                  </Link>
                  {listingTitleSupportsServiceMenu(l.title_es) && (
                    <Link
                      href={`/profile/listing/${l.id}/menu`}
                      className="shrink-0 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg border border-amber-300 text-[#78350F] hover:bg-amber-50 transition-colors"
                    >
                      {t.editMenu}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Loyalty + referral */}
        <div id="loyalty-section" className="mb-5 scroll-mt-24">
          <LoyaltyCard lang={lang} />
        </div>
        <ReferralCard lang={lang} />

        <RoutineHabitsCard lang={lang} />

        <div className="bg-white rounded-3xl border border-[#E5E0D8] p-6 mb-5 shadow-sm">
          <h2 className="font-serif text-lg font-bold text-[#1C1917] mb-3">
            {lang === "es" ? "Favoritos" : "Saved services"}
          </h2>
          {favorites.length === 0 ? (
            <p className="text-sm text-[#6B7280]">
              {lang === "es"
                ? "Marca un servicio con el corazón en la ficha del listado."
                : "Save a service with the heart button on a listing page."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {favorites.map((f) => (
                <li key={f.listing_id}>
                  <Link
                    href={`/listing/${f.listing_id}`}
                    className="block p-3 rounded-xl bg-[#F4F0EB] hover:bg-[#EDE8E0] transition-colors"
                  >
                    <p className="text-sm font-semibold text-[#1C1917] truncate">{f.title}</p>
                    <p className="text-xs text-[#6B7280]">
                      {formatCurrencyMXN(f.price_mxn, lang)}
                      {f.location_city ? ` · ${f.location_city}` : ""}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* My bookings — buyer */}
        <Link href="/my-bookings" className="block mb-3">
          <div className="bg-white rounded-2xl border border-[#E5E0D8] p-4 hover:border-[#1B4332] transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">📋</span>
                <div>
                  <p className="text-sm font-bold text-[#1C1917]">
                    {lang === "es" ? "Mis reservas" : "My bookings"}
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    {lang === "es"
                      ? "Servicios (limpieza, chef, costura…) — no incluye taxi"
                      : "Services (cleaning, chef, tailoring…) — not taxi rides"}
                  </p>
                </div>
              </div>
              <span className="text-[#6B7280] text-sm">→</span>
            </div>
            {pendingReviewCount > 0 ? (
              <p className="text-xs font-semibold text-amber-900 mt-3 px-2 py-2 rounded-xl bg-amber-50 border border-amber-100">
                {lang === "es"
                  ? `⭐ Tienes ${pendingReviewCount} ${
                      pendingReviewCount === 1 ? "servicio completado por valorar" : "servicios completados por valorar"
                    }. Abre para dejar tu reseña al proveedor.`
                  : `⭐ You have ${pendingReviewCount} completed ${
                      pendingReviewCount === 1 ? "booking" : "bookings"
                    } to rate. Open to review your provider.`}
              </p>
            ) : null}
          </div>
        </Link>

        {ridesEnabled ? (
          <>
            <Link href="/viaje" className="block mb-3">
              <div className="bg-white rounded-2xl border border-[#E5E0D8] p-4 hover:border-[#1B4332] transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🚕</span>
                    <div>
                      <p className="text-sm font-bold text-[#1C1917]">
                        {lang === "es" ? "Mis viajes (taxi)" : "My rides (taxi)"}
                      </p>
                      <p className="text-xs text-[#6B7280]">
                        {lang === "es"
                          ? "Pedir viaje, estado en vivo y tickets NG-…"
                          : "Request rides, live status, and NG-… tickets"}
                      </p>
                    </div>
                  </div>
                  <span className="text-[#6B7280] text-sm">→</span>
                </div>
              </div>
            </Link>
            <Link href="/conductor/viajes" className="block mb-3">
              <div className="bg-white rounded-2xl border border-[#E5E0D8] p-4 hover:border-[#1B4332] transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🚗</span>
                    <div>
                      <p className="text-sm font-bold text-[#1C1917]">
                        {lang === "es" ? "Viajes asignados (conductor)" : "Assigned trips (driver)"}
                      </p>
                      <p className="text-xs text-[#6B7280]">
                        {lang === "es"
                          ? "Panel de conductor — aceptar, iniciar y completar"
                          : "Driver panel — accept, start, and complete rides"}
                      </p>
                    </div>
                  </div>
                  <span className="text-[#6B7280] text-sm">→</span>
                </div>
              </div>
            </Link>
          </>
        ) : null}

        <Link href="/seller-bookings" className="block mb-3">
          <div className="bg-white rounded-2xl border border-[#E5E0D8] p-4 hover:border-[#1B4332] transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">✅</span>
                <div>
                  <p className="text-sm font-bold text-[#1C1917]">
                    {lang === "es" ? "Reservas de clientes" : "Client bookings"}
                  </p>
                  <p className="text-xs text-[#6B7280]">
                    {lang === "es"
                      ? "Servicios que vendes — no viajes de taxi"
                      : "Services you sell — not taxi rides"}
                  </p>
                </div>
              </div>
              <span className="text-[#6B7280] text-sm">→</span>
            </div>
          </div>
        </Link>

        {/* Guarantee link */}
        <div className="bg-gradient-to-r from-emerald-50 to-[#ECFDF5] rounded-2xl border border-emerald-200 p-4 mb-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#065F46" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <div>
                <p className="text-sm font-bold text-emerald-900">Garantía NaranjoGo</p>
                <p className="text-xs text-emerald-700">
                  {lang === "es"
                    ? "¿Problemas con un servicio? Solicita un reembolso."
                    : "Issues with a service? Request a refund."}
                </p>
              </div>
            </div>
            <Link href="/claims" className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
              {lang === "es" ? "Ver" : "View"} →
            </Link>
          </div>
        </div>

        {/* Coming soon banner */}
        <div className="bg-[#F4F0EB] rounded-2xl p-4 mb-5 text-center">
          <p className="text-xs text-[#6B7280]">🚀 {t.phase3}</p>
        </div>

        {/* Logout */}
        <button onClick={handleLogout}
          className="w-full py-3 rounded-xl border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors">
          🚪 {t.logout}
        </button>

      </div>
    </main>
  );
}
