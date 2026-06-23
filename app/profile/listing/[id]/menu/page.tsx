"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import ServiceMenuEditor from "@/components/ServiceMenuEditor";
import { useAppLang, useAppLangActions } from "@/hooks/use-app-lang";
import { inferProviderSlugFromListingTitle, listingTitleSupportsServiceMenu } from "@/lib/infer-listing-provider-slug";
import {
  parseServiceMenu,
  serviceMenuFormRowsFromMenu,
  serviceMenuPayloadFromFormRows,
  editorMenuRowsFromListing,
  type ServiceMenu,
  type ServiceMenuFormRow,
} from "@/lib/listing-service-menu";

type ListingRow = {
  id: string;
  title_es: string;
  seller_id: string;
  service_menu?: ServiceMenu | null;
};

export default function ProfileListingMenuPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#FDF8F1] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
        </main>
      }
    >
      <ProfileListingMenuInner />
    </Suspense>
  );
}

function ProfileListingMenuInner() {
  const params = useParams();
  const listingId = String(params?.id ?? "");
  const router = useRouter();
  const lang = useAppLang();
  const { setLang } = useAppLangActions();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [listing, setListing] = useState<ListingRow | null>(null);
  const [providerSlug, setProviderSlug] = useState<string | null>(null);
  const [rows, setRows] = useState<ServiceMenuFormRow[]>([]);

  const t = {
    es: {
      title: "Editar menú de servicios",
      backProfile: "← Mi perfil",
      backListing: "Ver anuncio",
      save: "Guardar menú",
      saving: "Guardando…",
      saved: "✓ Menú guardado.",
      noMenuSupport: "Este anuncio no admite menú de servicios.",
      loginRequired: "Inicia sesión para editar tu menú.",
    },
    en: {
      title: "Edit service menu",
      backProfile: "← My profile",
      backListing: "View listing",
      save: "Save menu",
      saving: "Saving…",
      saved: "✓ Menu saved.",
      noMenuSupport: "This listing does not support a service menu.",
      loginRequired: "Sign in to edit your menu.",
    },
  }[lang];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const meRes = await fetch("/api/auth/me", { credentials: "same-origin" });
        if (!meRes.ok) {
          router.push("/auth/login");
          return;
        }
        const me = await meRes.json();
        const myId = me.user?.id as string | undefined;
        if (!myId) {
          router.push("/auth/login");
          return;
        }

        const listingRes = await fetch(`/api/listings/${listingId}`, { credentials: "same-origin" });
        if (!listingRes.ok) {
          setError(listingRes.status === 404 ? "Not found" : "Error loading listing");
          setLoading(false);
          return;
        }
        const data = (await listingRes.json()) as ListingRow;
        if (String(data.seller_id) !== String(myId)) {
          setError(lang === "es" ? "No autorizado" : "Not authorized");
          setLoading(false);
          return;
        }

        const slug = inferProviderSlugFromListingTitle(data.title_es);
        if (!slug || !listingTitleSupportsServiceMenu(data.title_es)) {
          setListing(data);
          setProviderSlug(slug);
          setLoading(false);
          return;
        }

        const parsed = data.service_menu ? parseServiceMenu(data.service_menu) : null;
        const menu = parsed?.ok ? parsed.menu : null;
        if (!cancelled) {
          setListing(data);
          setProviderSlug(slug);
          setRows(editorMenuRowsFromListing(data.service_menu ?? null, slug, lang));
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Error");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listingId, lang, router]);

  const handleSave = async () => {
    if (!providerSlug) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload = serviceMenuPayloadFromFormRows(rows, providerSlug);
      const res = await fetch(`/api/listings/${listingId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_menu: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Save failed");
      }
      setSuccess(t.saved);
      const parsed = data.service_menu ? parseServiceMenu(data.service_menu) : null;
      if (parsed?.ok) {
        setRows(serviceMenuFormRowsFromMenu(parsed.menu, lang));
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FDF8F1] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FDF8F1] px-4 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link href="/profile" className="text-sm text-[#6B7280] hover:text-[#1B4332]">
            {t.backProfile}
          </Link>
          <div className="flex bg-[#F4F0EB] rounded-lg p-1 gap-1">
            {(["es", "en"] as const).map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => setLang(l)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                  lang === l ? "bg-white text-[#1B4332] shadow-sm" : "text-[#6B7280]"
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-[#E5E0D8] p-6 shadow-sm space-y-4">
          <div>
            <h1 className="font-serif text-xl font-bold text-[#1C1917]">{t.title}</h1>
            {listing?.title_es ? (
              <p className="text-sm text-[#6B7280] mt-1 truncate">{listing.title_es}</p>
            ) : null}
          </div>

          {!providerSlug || !listingTitleSupportsServiceMenu(listing?.title_es) ? (
            <p className="text-sm text-[#92400E]">{t.noMenuSupport}</p>
          ) : (
            <>
              <ServiceMenuEditor
                providerSlug={providerSlug}
                lang={lang}
                rows={rows}
                onRowsChange={setRows}
                disabled={saving}
              />
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-[#1B4332] text-white text-sm font-semibold disabled:opacity-50"
                >
                  {saving ? t.saving : t.save}
                </button>
                <Link
                  href={`/listing/${listingId}`}
                  className="px-5 py-2.5 rounded-xl border border-[#E5E0D8] text-[#1B4332] text-sm font-semibold"
                >
                  {t.backListing}
                </Link>
              </div>
            </>
          )}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {success ? <p className="text-sm text-[#065F46]">{success}</p> : null}
        </div>
      </div>
    </main>
  );
}
