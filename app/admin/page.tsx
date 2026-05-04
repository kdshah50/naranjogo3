"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type Listing = {
  id: string;
  title_es: string;
  description_es: string;
  price_mxn: number;
  category_id: string;
  is_verified: boolean;
  status: string;
  location_city: string;
  commission_pct: number | null;
  package_session_count?: number | null;
  package_total_price_mxn?: number | null;
  created_at: string;
  calendar_sync_enabled?: boolean | null;
  calendar_last_synced_at?: string | null;
  users: { display_name: string; phone: string } | null;
};

type UserRow = {
  id: string;
  phone: string | null;
  display_name: string | null;
  trust_badge: string | null;
  phone_verified: boolean;
  ine_verified: boolean;
  rfc_verified?: boolean;
  curp: string | null;
  rfc: string | null;
  ine_photo_url: string | null;
  created_at: string;
  review_count?: number;
  review_avg?: number;
};

function fmtMXN(c: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(c / 100);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [pinErrorDetail, setPinErrorDetail] = useState<string | null>(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const [tab, setTab] = useState<"listings" | "sellers" | "reports" | "claims">("listings");

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"pending" | "verified" | "all">("pending");
  const [saving, setSaving] = useState<string | null>(null);
  const [commissions, setCommissions] = useState<Record<string, string>>({});
  const [pkgSess, setPkgSess] = useState<Record<string, string>>({});
  const [pkgPesos, setPkgPesos] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [msgError, setMsgError] = useState(false);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSaving, setUserSaving] = useState<string | null>(null);

  type ClaimRow = {
    id: string;
    booking_id: string;
    buyer_id: string;
    seller_id: string;
    listing_id: string;
    reason: string;
    details: string | null;
    status: string;
    admin_note: string | null;
    refund_amount_cents: number | null;
    created_at: string;
    resolved_at: string | null;
    listing_title: string | null;
    buyer_name: string;
    seller_name: string;
    commission_cents: number;
  };
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [claimFilter, setClaimFilter] = useState<"open" | "all">("open");
  const [claimSaving, setClaimSaving] = useState<string | null>(null);

  type ReportRow = {
    id: string;
    reporter_id: string;
    listing_id: string | null;
    seller_id: string | null;
    reason: string;
    details: string | null;
    status: string;
    admin_note: string | null;
    created_at: string;
    resolved_at: string | null;
    listing_title: string | null;
    reporter_name: string;
    seller_name: string | null;
  };
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportFilter, setReportFilter] = useState<"open" | "all">("open");
  const [reportSaving, setReportSaving] = useState<string | null>(null);

  type DupListingMini = {
    id: string;
    seller_id: string;
    title_es: string;
    price_mxn: number;
    created_at: string;
    photo_sample: string | null;
  };
  type DupGroupRow = { reason: string; key: string; listings: DupListingMini[] };
  const [dupGroups, setDupGroups] = useState<DupGroupRow[]>([]);
  const [dupLoading, setDupLoading] = useState(false);
  const [dupMeta, setDupMeta] = useState<{ scanned: number; groupCount: number } | null>(null);

  const loadDupes = useCallback(async () => {
    setDupLoading(true);
    try {
      const res = await fetch(
        `/api/admin/suspected-duplicates?pin=${encodeURIComponent(pin.trim())}`,
        { credentials: "same-origin" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Error");
      setDupGroups(Array.isArray(data.groups) ? data.groups : []);
      setDupMeta({
        scanned: typeof data.scanned === "number" ? data.scanned : 0,
        groupCount: typeof data.groupCount === "number" ? data.groupCount : 0,
      });
    } catch {
      setDupGroups([]);
      setDupMeta(null);
    }
    setDupLoading(false);
  }, [pin]);

  const load = useCallback(async () => {
    setLoading(true);
    const f = filter === "pending" ? "pending" : filter === "verified" ? "verified" : "all";
    const res = await fetch(
      `/api/admin/listing-queue?pin=${encodeURIComponent(pin.trim())}&filter=${f}&scope=all`,
      { credentials: "same-origin" }
    );
    const json = res.ok ? await res.json() : { listings: [] };
    const data = (json as { listings?: unknown }).listings;
    setListings(Array.isArray(data) ? data : []);
    // Init commission + optional package
    const c: Record<string, string> = {};
    const ps: Record<string, string> = {};
    const pp: Record<string, string> = {};
    (Array.isArray(data) ? data : []).forEach((l: Listing) => {
      c[l.id] = String(l.commission_pct ?? 5);
      if (l.package_session_count != null && l.package_session_count >= 2) {
        ps[l.id] = String(l.package_session_count);
      }
      if (l.package_total_price_mxn != null && l.package_total_price_mxn > 0) {
        pp[l.id] = String(l.package_total_price_mxn / 100);
      }
    });
    setCommissions(c);
    setPkgSess(ps);
    setPkgPesos(pp);
    setLoading(false);
  }, [filter, pin]);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch(`/api/admin/users?pin=${encodeURIComponent(pin.trim())}`);
      const data = await res.json();
      const usersList: UserRow[] = Array.isArray(data.users) ? data.users : [];

      const enriched = await Promise.all(
        usersList.map(async (u) => {
          try {
            const rRes = await fetch(`/api/reviews?sellerId=${u.id}`);
            if (rRes.ok) {
              const rd = await rRes.json();
              return { ...u, review_count: rd.total ?? 0, review_avg: rd.average ?? 0 };
            }
          } catch { /* silent */ }
          return { ...u, review_count: 0, review_avg: 0 };
        })
      );
      setUsers(enriched);
    } catch {
      setUsers([]);
    }
    setUsersLoading(false);
  }, [pin]);

  const updateUser = async (userId: string, updates: Record<string, unknown>) => {
    setUserSaving(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim(), userId, ...updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      showMsg(`✅ User updated`);
      await loadUsers();
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "Error", true);
    } finally {
      setUserSaving(null);
    }
  };

  const loadClaims = useCallback(async () => {
    setClaimsLoading(true);
    try {
      const res = await fetch(`/api/claims?pin=${encodeURIComponent(pin.trim())}&status=${claimFilter}`);
      const data = await res.json();
      setClaims(Array.isArray(data.claims) ? data.claims : []);
    } catch {
      setClaims([]);
    }
    setClaimsLoading(false);
  }, [pin, claimFilter]);

  const updateClaim = async (claimId: string, status: string) => {
    setClaimSaving(claimId);
    try {
      const res = await fetch("/api/claims", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim(), claimId, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      showMsg("✅ Claim updated");
      await loadClaims();
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "Error", true);
    } finally {
      setClaimSaving(null);
    }
  };

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const res = await fetch(`/api/reports?pin=${encodeURIComponent(pin.trim())}&status=${reportFilter}`);
      const data = await res.json();
      setReports(Array.isArray(data.reports) ? data.reports : []);
    } catch {
      setReports([]);
    }
    setReportsLoading(false);
  }, [pin, reportFilter]);

  const updateReport = async (reportId: string, status: string) => {
    setReportSaving(reportId);
    try {
      const res = await fetch("/api/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim(), reportId, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error");
      showMsg("✅ Report updated");
      await loadReports();
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "Error", true);
    } finally {
      setReportSaving(null);
    }
  };

  useEffect(() => {
    if (!authed) return;
    if (tab === "listings") void load();
    else if (tab === "sellers") void loadUsers();
    else if (tab === "reports") void loadReports();
    else if (tab === "claims") void loadClaims();
  }, [authed, tab, load, loadUsers, loadReports, loadClaims]);

  const submitPin = async () => {
    setPinError(false);
    setPinErrorDetail(null);
    setPinLoading(true);
    try {
      const res = await fetch("/api/admin/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setAuthed(true);
        return;
      }
      setPinError(true);
      if (res.status === 404) {
        setPinErrorDetail("No está el servicio de verificación. Haz redeploy en Vercel con el código nuevo.");
      } else if (res.status === 401) {
        setPinErrorDetail(data.error ?? "PIN incorrecto (revisa ADMIN_PIN en el servidor).");
      } else {
        setPinErrorDetail(data.error ?? `Error ${res.status}. Revisa logs en Vercel.`);
      }
    } catch {
      setPinError(true);
      setPinErrorDetail("Sin conexión o error de red.");
    } finally {
      setPinLoading(false);
    }
  };

  const showMsg = (text: string, error = false) => {
    setMsg(text);
    setMsgError(error);
    setTimeout(() => {
      setMsg("");
      setMsgError(false);
    }, 5000);
  };

  const lockAdminPanel = () => {
    setAuthed(false);
  };

  const sessionLogout = () => {
    void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).finally(() => {
      setAuthed(false);
      router.push("/");
    });
  };

  const postAdmin = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/admin/listing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, pin: pin.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data?.error === "string" ? data.error : "Error al guardar");
    }
  };

  const buildPackagePayload = (id: string) => {
    const s = (pkgSess[id] ?? "").trim();
    const p = (pkgPesos[id] ?? "").trim();
    if (!s && !p) {
      return { package_session_count: null as number | null, package_total_price_mxn: null as number | null };
    }
    if (!s || !p) {
      throw new Error("Complete package sessions and total MXN, or leave both empty");
    }
    const n = parseInt(s, 10);
    const pesos = parseFloat(p.replace(/,/g, "."));
    if (!Number.isFinite(n) || n < 2 || !Number.isFinite(pesos) || pesos <= 0) {
      throw new Error("Package: 2+ sessions and positive total MXN, or both empty");
    }
    return { package_session_count: n, package_total_price_mxn: Math.round(pesos * 100) };
  };

  const savePackage = async (id: string) => {
    setSaving(id);
    try {
      const pkg = buildPackagePayload(id);
      await postAdmin({ id, action: "package", ...pkg });
      showMsg("✅ Package pricing saved");
      await load();
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "Error", true);
    } finally {
      setSaving(null);
    }
  };

  const approve = async (id: string) => {
    setSaving(id);
    const pct = parseFloat(commissions[id] ?? "5");
    try {
      const pkg = buildPackagePayload(id);
      await postAdmin({ id, action: "approve", commission_pct: pct, ...pkg });
      showMsg(`✅ Approved — comisión ${pct}%${pkg.package_session_count ? ` — paquete ${pkg.package_session_count} sesiones` : ""}`);
      await load();
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "No se pudo aprobar", true);
    } finally {
      setSaving(null);
    }
  };

  const reject = async (id: string) => {
    setSaving(id);
    try {
      await postAdmin({ id, action: "reject" });
      showMsg("🗑️ Anuncio archivado");
      await load();
    } catch (e: any) {
      showMsg(e?.message ?? "No se pudo rechazar", true);
    } finally {
      setSaving(null);
    }
  };

  const updateCommission = async (id: string) => {
    setSaving(id);
    const pct = parseFloat(commissions[id] ?? "5");
    try {
      await postAdmin({ id, action: "commission", commission_pct: pct });
      showMsg(`✅ Comisión actualizada a ${pct}%`);
      await load();
    } catch (e: any) {
      showMsg(e?.message ?? "No se pudo actualizar la comisión", true);
    } finally {
      setSaving(null);
    }
  };

  const setCalendarSync = async (id: string, enabled: boolean) => {
    setSaving(id);
    try {
      await postAdmin({ id, action: "calendar_sync", calendar_sync_enabled: enabled });
      showMsg(enabled ? "✅ Live calendar sync ON" : "✅ Live calendar sync OFF");
      await load();
    } catch (e: unknown) {
      showMsg(e instanceof Error ? e.message : "No se pudo actualizar", true);
    } finally {
      setSaving(null);
    }
  };

  // ── PIN screen ───────────────────────────────────────────────────────────
  if (!authed) return (
    <main className="min-h-screen bg-[#FDF8F1] flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl border border-[#E5E0D8] p-10 max-w-sm w-full text-center shadow-sm">
        <div className="text-4xl mb-4">🔐</div>
        <h1 className="font-serif text-xl font-bold text-[#1B4332] mb-6">Admin — Naranjogo</h1>
        <div className="relative mb-3">
          <input
            type={showPin ? "text" : "password"}
            value={pin}
            onChange={e => { setPin(e.target.value); setPinError(false); setPinErrorDetail(null); }}
            onKeyDown={e => {
              if (e.key === "Enter" && !pinLoading) void submitPin();
            }}
            placeholder="Admin PIN"
            autoComplete="current-password"
            className="w-full border border-[#E5E0D8] rounded-xl pl-4 pr-[5.5rem] py-3 text-sm outline-none focus:border-[#1B4332] text-left"
          />
          <button
            type="button"
            onClick={() => setShowPin((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#1B4332] hover:underline px-2 py-1 rounded-lg">
            {showPin ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {pinError && (
          <p className="text-xs text-red-600 mb-3 text-left leading-relaxed">
            {pinErrorDetail ?? "PIN incorrecto"}
          </p>
        )}
        <button
          type="button"
          disabled={pinLoading || !pin.trim()}
          onClick={() => void submitPin()}
          className="w-full bg-[#1B4332] text-white font-semibold py-3 rounded-xl text-sm hover:bg-[#2D6A4F] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {pinLoading ? "…" : "Enter"}
        </button>
      </div>
    </main>
  );

  // ── Admin dashboard ──────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#FDF8F1] px-4 py-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="font-serif text-2xl font-bold text-[#1B4332]">Naranjogo Admin</h1>
            <p className="text-sm text-[#6B7280]">Provider approval, verification & trust management</p>
          </div>
          <div className="flex items-center flex-wrap gap-2 justify-end">
            <a href="/" className="text-sm text-[#6B7280] hover:text-[#1B4332]">← Volver al sitio</a>
            <button
              type="button"
              onClick={lockAdminPanel}
              className="text-sm font-medium text-[#6B7280] hover:text-[#1B4332] border border-[#E5E0D8] rounded-lg px-3 py-1.5 bg-white"
            >
              Salir del panel
            </button>
            <button
              type="button"
              onClick={sessionLogout}
              className="text-sm font-semibold text-white bg-[#1B4332] hover:bg-[#2D6A4F] rounded-lg px-3 py-1.5"
            >
              Cerrar sesión
            </button>
          </div>
        </div>

        {/* Main tabs */}
        <div className="flex gap-2 mb-6 border-b border-[#E5E0D8] pb-3">
          <button onClick={() => setTab("listings")}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              tab === "listings" ? "bg-[#1B4332] text-white" : "bg-white border border-[#E5E0D8] text-[#6B7280] hover:border-[#1B4332]"
            }`}>
            📋 Listings
          </button>
          <button onClick={() => setTab("sellers")}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              tab === "sellers" ? "bg-[#1B4332] text-white" : "bg-white border border-[#E5E0D8] text-[#6B7280] hover:border-[#1B4332]"
            }`}>
            👤 Sellers & Trust
          </button>
          <button onClick={() => setTab("reports")}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              tab === "reports" ? "bg-red-600 text-white" : "bg-white border border-[#E5E0D8] text-[#6B7280] hover:border-red-400"
            }`}>
            🚩 Reports
          </button>
          <button onClick={() => setTab("claims")}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              tab === "claims" ? "bg-emerald-600 text-white" : "bg-white border border-[#E5E0D8] text-[#6B7280] hover:border-emerald-400"
            }`}>
            🛡️ Claims
          </button>
        </div>

        {/* Status message */}
        {msg && (
          <div
            className={`rounded-xl px-4 py-3 text-sm font-medium mb-4 border ${
              msgError
                ? "bg-red-50 border-red-200 text-red-800"
                : "bg-[#ECFDF5] border-[#A7F3D0] text-[#065F46]"
            }`}>
            {msg}
          </div>
        )}

        {/* ── SELLERS TAB ─────────────────────────────────────────── */}
        {tab === "sellers" && (
          <>
            {usersLoading ? (
              <div className="text-center py-20 text-[#6B7280]">Loading sellers...</div>
            ) : users.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-[#E5E0D8]">
                <p className="text-[#6B7280] text-sm">No users found</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {users.filter(u => !u.id.startsWith("a1000000")).map(u => {
                  const badge = u.trust_badge ?? "none";
                  const badgeColors: Record<string, { bg: string; text: string }> = {
                    diamond: { bg: "bg-blue-50", text: "text-blue-700" },
                    gold: { bg: "bg-yellow-50", text: "text-yellow-700" },
                    bronze: { bg: "bg-orange-50", text: "text-orange-700" },
                    none: { bg: "bg-gray-50", text: "text-gray-500" },
                  };
                  const bc = badgeColors[badge] ?? badgeColors.none;
                  return (
                    <div key={u.id} className="bg-white rounded-2xl border border-[#E5E0D8] p-5 shadow-sm">
                      <div className="flex flex-wrap gap-4 items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full bg-[#1B4332] flex items-center justify-center text-white text-lg font-bold flex-shrink-0">
                            {u.display_name?.[0] ?? "?"}
                          </div>
                          <div>
                            <p className="font-semibold text-[#1C1917]">{u.display_name || "Sin nombre"}</p>
                            <p className="text-xs text-[#6B7280]">{u.phone ?? "No phone"}</p>
                            <p className="text-[10px] text-[#9CA3AF] mt-0.5">
                              Joined {new Date(u.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                            </p>
                          </div>
                        </div>

                        {/* Current status badges */}
                        <div className="flex flex-wrap gap-2">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${bc.bg} ${bc.text} capitalize`}>
                            {badge}
                          </span>
                          {u.phone_verified && (
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                              ✓ Phone
                            </span>
                          )}
                          {u.ine_verified && (
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
                              ✓ INE
                            </span>
                          )}
                          {u.rfc_verified && (
                            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-800">
                              ✓ RFC
                            </span>
                          )}
                        </div>
                      </div>

                      {/* CURP, RFC & INE verification */}
                      <div className="flex flex-wrap gap-3 items-start mb-3">
                        {u.curp && (
                          <div className="bg-[#ECFDF5] rounded-xl px-3 py-2 text-xs">
                            <span className="font-semibold text-[#065F46]">🪪 CURP:</span>{" "}
                            <span className="font-mono text-[#1C1917] tracking-wide">{u.curp}</span>
                          </div>
                        )}
                        {u.rfc && (
                          <div className="bg-[#ECFDF5] rounded-xl px-3 py-2 text-xs">
                            <span className="font-semibold text-[#065F46]">📋 RFC:</span>{" "}
                            <span className="font-mono text-[#1C1917] tracking-wide">{u.rfc}</span>
                          </div>
                        )}
                        {u.ine_photo_url && (
                          <a href={u.ine_photo_url} target="_blank" rel="noopener noreferrer"
                            className="bg-blue-50 rounded-xl px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors">
                            📸 Ver foto INE →
                          </a>
                        )}
                        {!u.curp && !u.rfc && !u.ine_photo_url && (
                          <span className="text-xs text-[#9CA3AF]">Sin documentos de verificación</span>
                        )}
                      </div>

                      {/* Review stats & auto-promotion */}
                      <div className="flex flex-wrap gap-3 items-center mb-3 text-xs">
                        <span className="text-[#6B7280]">
                          ★ {(u.review_avg ?? 0).toFixed(1)} · {u.review_count ?? 0} reseña{(u.review_count ?? 0) !== 1 ? "s" : ""}
                        </span>
                        {(() => {
                          const rc = u.review_count ?? 0;
                          const ra = u.review_avg ?? 0;
                          let earned = "bronze";
                          if (rc >= 10 && ra >= 4.0) earned = "diamond";
                          else if (rc >= 3 && ra >= 3.5) earned = "gold";
                          const rank: Record<string, number> = { none: 0, bronze: 1, gold: 2, diamond: 3 };
                          const willPromote = (rank[earned] ?? 0) > (rank[badge] ?? 0);
                          if (willPromote) return <span className="text-emerald-600 font-semibold">↑ Auto-promote → {earned}</span>;
                          if (rc < 3) return <span className="text-[#9CA3AF]">{3 - rc} more for Gold</span>;
                          if (rc < 10) return <span className="text-[#9CA3AF]">{10 - rc} more for Diamond</span>;
                          return null;
                        })()}
                      </div>

                      {/* Admin actions */}
                      <div className="flex flex-wrap gap-2 items-center border-t border-[#E5E0D8] pt-3">
                        <span className="text-xs font-semibold text-[#6B7280] mr-1">Trust badge:</span>
                        {(["none", "bronze", "gold", "diamond"] as const).map(b => (
                          <button key={b} onClick={() => updateUser(u.id, { trust_badge: b })}
                            disabled={userSaving === u.id || badge === b}
                            className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-40 capitalize ${
                              badge === b
                                ? "bg-[#1B4332] text-white"
                                : "bg-white border border-[#E5E0D8] text-[#374151] hover:border-[#1B4332]"
                            }`}>
                            {userSaving === u.id ? "…" : b}
                          </button>
                        ))}

                        <div className="w-px h-6 bg-[#E5E0D8] mx-2 hidden sm:block" />

                        <button
                          onClick={() => updateUser(u.id, { ine_verified: !u.ine_verified })}
                          disabled={userSaving === u.id}
                          className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-40 ${
                            u.ine_verified
                              ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                              : "bg-white border border-[#E5E0D8] text-[#6B7280] hover:border-blue-400"
                          }`}>
                          {userSaving === u.id ? "…" : u.ine_verified ? "✓ INE Verified" : "Verify INE"}
                        </button>

                        <button
                          onClick={() => updateUser(u.id, { rfc_verified: !u.rfc_verified })}
                          disabled={userSaving === u.id}
                          className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-40 ${
                            u.rfc_verified
                              ? "bg-indigo-100 text-indigo-800 hover:bg-indigo-200"
                              : "bg-white border border-[#E5E0D8] text-[#6B7280] hover:border-indigo-400"
                          }`}>
                          {userSaving === u.id ? "…" : u.rfc_verified ? "✓ RFC Verified" : "Verify RFC"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── REPORTS TAB ────────────────────────────────────────── */}
        {tab === "reports" && (
          <>
            <div className="flex gap-2 mb-6">
              {(["open", "all"] as const).map(f => (
                <button key={f} onClick={() => setReportFilter(f)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors capitalize ${
                    reportFilter === f
                      ? "bg-red-600 text-white"
                      : "bg-white border border-[#E5E0D8] text-[#6B7280] hover:border-red-400"
                  }`}>
                  {f === "open" ? "Open" : "All"}
                </button>
              ))}
            </div>

            {reportsLoading ? (
              <div className="text-center py-20 text-[#6B7280]">Loading reports...</div>
            ) : reports.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-[#E5E0D8]">
                <p className="text-4xl mb-3">✓</p>
                <p className="text-[#6B7280] text-sm">No {reportFilter === "open" ? "open " : ""}reports</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {reports.map(r => {
                  const reasonLabels: Record<string, string> = {
                    fraud: "Fraude",
                    fake_listing: "Anuncio falso",
                    misleading: "Engañoso",
                    inappropriate: "Inapropiado",
                    spam: "Spam",
                    other: "Otro",
                  };
                  const statusColors: Record<string, string> = {
                    open: "bg-red-50 text-red-700",
                    reviewed: "bg-yellow-50 text-yellow-700",
                    action_taken: "bg-emerald-50 text-emerald-700",
                    dismissed: "bg-gray-50 text-gray-500",
                  };
                  return (
                    <div key={r.id} className="bg-white rounded-2xl border border-[#E5E0D8] p-5 shadow-sm">
                      <div className="flex flex-wrap gap-3 items-start justify-between mb-3">
                        <div>
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusColors[r.status] ?? statusColors.open}`}>
                            {r.status.replace("_", " ")}
                          </span>
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 ml-2">
                            {reasonLabels[r.reason] ?? r.reason}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#9CA3AF]">
                          {new Date(r.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>

                      {r.listing_title && (
                        <p className="text-sm font-semibold text-[#1C1917] mb-1">
                          Anuncio: <a href={`/listing/${r.listing_id}`} className="text-[#1B4332] hover:underline">{r.listing_title}</a>
                        </p>
                      )}
                      <div className="flex flex-wrap gap-4 text-xs text-[#6B7280] mb-2">
                        <span>Reportado por: {r.reporter_name}</span>
                        {r.seller_name && <span>Vendedor: {r.seller_name}</span>}
                      </div>

                      {r.details && (
                        <p className="text-sm text-[#374151] bg-[#F4F0EB] rounded-xl p-3 mb-3">{r.details}</p>
                      )}

                      {r.admin_note && (
                        <p className="text-xs text-[#6B7280] italic mb-3">Admin: {r.admin_note}</p>
                      )}

                      {r.status === "open" && (
                        <div className="flex flex-wrap gap-2 border-t border-[#E5E0D8] pt-3">
                          <button
                            onClick={() => updateReport(r.id, "reviewed")}
                            disabled={reportSaving === r.id}
                            className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-yellow-50 text-yellow-700 hover:bg-yellow-100 disabled:opacity-40 transition-colors">
                            {reportSaving === r.id ? "…" : "Mark Reviewed"}
                          </button>
                          <button
                            onClick={() => updateReport(r.id, "action_taken")}
                            disabled={reportSaving === r.id}
                            className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 transition-colors">
                            {reportSaving === r.id ? "…" : "Action Taken"}
                          </button>
                          <button
                            onClick={() => updateReport(r.id, "dismissed")}
                            disabled={reportSaving === r.id}
                            className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-gray-50 text-gray-500 hover:bg-gray-100 disabled:opacity-40 transition-colors">
                            {reportSaving === r.id ? "…" : "Dismiss"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── CLAIMS TAB ─────────────────────────────────────────── */}
        {tab === "claims" && (
          <>
            <div className="flex gap-2 mb-6">
              {(["open", "all"] as const).map(f => (
                <button key={f} onClick={() => setClaimFilter(f)}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors capitalize ${
                    claimFilter === f
                      ? "bg-emerald-600 text-white"
                      : "bg-white border border-[#E5E0D8] text-[#6B7280] hover:border-emerald-400"
                  }`}>
                  {f === "open" ? "Open" : "All"}
                </button>
              ))}
            </div>

            {claimsLoading ? (
              <div className="text-center py-20 text-[#6B7280]">Loading claims...</div>
            ) : claims.length === 0 ? (
              <div className="text-center py-20 bg-white rounded-2xl border border-[#E5E0D8]">
                <p className="text-4xl mb-3">🛡️</p>
                <p className="text-[#6B7280] text-sm">No {claimFilter === "open" ? "open " : ""}guarantee claims</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {claims.map(c => {
                  const reasonLabels: Record<string, string> = {
                    no_show: "No se presentó",
                    poor_quality: "Mala calidad",
                    incomplete: "Incompleto",
                    overcharged: "Cobro excesivo",
                    safety_issue: "Seguridad",
                    other: "Otro",
                  };
                  const statusColors: Record<string, string> = {
                    open: "bg-amber-50 text-amber-700",
                    under_review: "bg-blue-50 text-blue-700",
                    approved: "bg-emerald-50 text-emerald-700",
                    denied: "bg-red-50 text-red-700",
                    refunded: "bg-emerald-50 text-emerald-700",
                  };
                  return (
                    <div key={c.id} className="bg-white rounded-2xl border border-[#E5E0D8] p-5 shadow-sm">
                      <div className="flex flex-wrap gap-3 items-start justify-between mb-3">
                        <div>
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${statusColors[c.status] ?? statusColors.open}`}>
                            {c.status.replace("_", " ")}
                          </span>
                          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 ml-2">
                            {reasonLabels[c.reason] ?? c.reason}
                          </span>
                        </div>
                        <span className="text-[10px] text-[#9CA3AF]">
                          {new Date(c.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                      </div>

                      {c.listing_title && (
                        <p className="text-sm font-semibold text-[#1C1917] mb-1">
                          Servicio: <a href={`/listing/${c.listing_id}`} className="text-[#1B4332] hover:underline">{c.listing_title}</a>
                        </p>
                      )}
                      <div className="flex flex-wrap gap-4 text-xs text-[#6B7280] mb-2">
                        <span>Comprador: {c.buyer_name}</span>
                        <span>Vendedor: {c.seller_name}</span>
                        <span>Comisión pagada: {fmtMXN(c.commission_cents)}</span>
                      </div>

                      {c.details && (
                        <p className="text-sm text-[#374151] bg-[#F4F0EB] rounded-xl p-3 mb-3">{c.details}</p>
                      )}

                      {c.admin_note && (
                        <p className="text-xs text-[#6B7280] italic mb-3">Admin: {c.admin_note}</p>
                      )}

                      {(c.status === "open" || c.status === "under_review") && (
                        <div className="flex flex-wrap gap-2 border-t border-[#E5E0D8] pt-3">
                          {c.status === "open" && (
                            <button onClick={() => updateClaim(c.id, "under_review")}
                              disabled={claimSaving === c.id}
                              className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-40 transition-colors">
                              {claimSaving === c.id ? "…" : "Review"}
                            </button>
                          )}
                          <button onClick={() => updateClaim(c.id, "approved")}
                            disabled={claimSaving === c.id}
                            className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40 transition-colors">
                            {claimSaving === c.id ? "…" : "Approve"}
                          </button>
                          <button onClick={() => updateClaim(c.id, "denied")}
                            disabled={claimSaving === c.id}
                            className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-40 transition-colors">
                            {claimSaving === c.id ? "…" : "Deny"}
                          </button>
                          <button onClick={() => updateClaim(c.id, "refunded")}
                            disabled={claimSaving === c.id}
                            className="text-xs px-3 py-1.5 rounded-lg font-semibold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 disabled:opacity-40 transition-colors">
                            {claimSaving === c.id ? "…" : "Refund"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── LISTINGS TAB ────────────────────────────────────────── */}
        {tab === "listings" && <>
        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          {(["pending", "verified", "all"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors capitalize ${
                filter === f
                  ? "bg-[#1B4332] text-white"
                  : "bg-white border border-[#E5E0D8] text-[#6B7280] hover:border-[#1B4332]"
              }`}>
              {f === "pending" ? "⏳ Pending approval" : f === "verified" ? "✅ Verified" : "📋 All"}
            </button>
          ))}
        </div>

        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <p className="text-sm font-bold text-amber-950">Posibles duplicados (heurística)</p>
              <p className="text-xs text-amber-900/90">
                Mismo vendedor + título normalizado + precio, o misma foto + precio. Buscar no modifica datos.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadDupes()}
              disabled={dupLoading || !pin.trim()}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-800 text-white hover:bg-amber-900 disabled:opacity-40"
            >
              {dupLoading ? "Analizando…" : "Cargar análisis"}
            </button>
          </div>
          {dupMeta && (
            <p className="text-xs text-amber-900 mb-2">
              Escaneados: {dupMeta.scanned} · Grupos: {dupMeta.groupCount}
            </p>
          )}
          {dupGroups.length > 0 && (
            <div className="space-y-3 max-h-80 overflow-y-auto mt-2">
              {dupGroups.map((g, i) => (
                <div key={`${g.key}-${i}`} className="bg-white rounded-xl border border-amber-200/80 p-3 text-xs">
                  <p className="font-bold text-[#92400E] mb-1">
                    {g.reason === "title_price" ? "Título + precio" : "Foto + precio"} · {g.listings.length}{" "}
                    anuncios
                  </p>
                  <ul className="space-y-1 text-[#374151]">
                    {g.listings.map((x) => (
                      <li key={x.id} className="flex flex-wrap gap-x-2 gap-y-0.5 items-baseline">
                        <a
                          href={`/listing/${x.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[11px] text-[#1B4332] font-semibold underline"
                        >
                          {x.id.slice(0, 8)}…
                        </a>
                        <span>{fmtDate(x.created_at)}</span>
                        <span className="font-semibold">{fmtMXN(x.price_mxn)}</span>
                        <span className="truncate max-w-[200px]">{x.title_es}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          {!dupLoading && dupMeta && dupGroups.length === 0 && (
            <p className="text-xs text-amber-800 mt-1">Sin grupos bajo esta heurística (o sube el límite en API).</p>
          )}
        </div>

        {/* Listings */}
        {loading ? (
          <div className="text-center py-20 text-[#6B7280]">Loading...</div>
        ) : listings.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-[#E5E0D8]">
            <div className="text-4xl mb-3">🎉</div>
            <p className="text-[#6B7280] text-sm">
              {filter === "pending" ? "No pending providers — all caught up!" : "No listings found"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {listings.map(l => (
              <div key={l.id} className={`bg-white rounded-2xl border p-6 shadow-sm ${
                l.is_verified ? "border-[#A7F3D0]" : "border-[#FDE68A]"
              }`}>
                <div className="flex flex-wrap gap-3 items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        l.is_verified
                          ? "bg-[#ECFDF5] text-[#065F46]"
                          : "bg-[#FFFBEB] text-[#92400E]"
                      }`}>
                        {l.is_verified ? "✅ Verified" : "⏳ Pending"}
                      </span>
                      <span className="text-xs text-[#6B7280]">{fmtDate(l.created_at)}</span>
                    </div>
                    <h2 className="font-semibold text-[#1C1917] text-base">{l.title_es}</h2>
                    <p className="text-sm text-[#6B7280] mt-0.5">
                      📍 {l.location_city} · 💰 {fmtMXN(l.price_mxn)}
                    </p>
                  </div>

                  {/* Provider info */}
                  <div className="bg-[#F4F0EB] rounded-xl px-4 py-3 text-sm">
                    <p className="font-semibold text-[#1B4332]">{l.users?.display_name ?? "Unknown"}</p>
                    <p className="text-[#6B7280] text-xs">{l.users?.phone ?? "No phone"}</p>
                    {l.users?.phone && (
                      <a
                        href={`https://wa.me/${(l.users.phone).replace(/\D/g, "")}?text=Hola%20${encodeURIComponent(l.users.display_name ?? "")}%2C%20somos%20Naranjogo%20%E2%80%94%20revisamos%20tu%20solicitud.`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[#25D366] font-semibold mt-1 hover:underline">
                        💬 WhatsApp
                      </a>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-[#374151] bg-[#F4F0EB] rounded-xl px-4 py-3 mb-4 leading-relaxed">
                  {l.description_es?.slice(0, 200)}{l.description_es?.length > 200 ? "..." : ""}
                </p>

                {/* Optional package: N sessions for $X total (commission base) */}
                <div className="mb-4 p-3 rounded-xl bg-amber-50/80 border border-amber-200/80">
                  <p className="text-xs font-semibold text-amber-950 mb-2">Package (optional) — N sessions, total $ MXN (agreed with provider)</p>
                  <div className="flex flex-wrap gap-3 items-end">
                    <div>
                      <label className="text-[10px] text-amber-900 block">Sessions (≥2)</label>
                      <input
                        type="number"
                        min={2}
                        placeholder="—"
                        value={pkgSess[l.id] ?? ""}
                        onChange={(e) => setPkgSess((c) => ({ ...c, [l.id]: e.target.value }))}
                        className="w-20 border border-amber-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-amber-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-amber-900 block">Total MXN</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="e.g. 2400"
                        value={pkgPesos[l.id] ?? ""}
                        onChange={(e) => setPkgPesos((c) => ({ ...c, [l.id]: e.target.value }))}
                        className="w-28 border border-amber-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:border-amber-500 bg-white"
                      />
                    </div>
                    {l.is_verified && (
                      <button
                        type="button"
                        onClick={() => void savePackage(l.id)}
                        disabled={saving === l.id}
                        className="text-xs px-3 py-2 rounded-lg bg-amber-700 text-white font-semibold hover:bg-amber-800 transition-colors disabled:opacity-40"
                      >
                        {saving === l.id ? "…" : "Save package"}
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-amber-800 mt-2">
                    Platform fee uses % commission on this total. Leave both fields empty for single-visit list price only.
                  </p>
                </div>

                {String(l.category_id ?? "").toLowerCase() === "services" && l.is_verified && (
                  <div className="mb-4 p-3 rounded-xl bg-sky-50/90 border border-sky-200/80">
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="mt-1 rounded border-sky-300 text-sky-700 focus:ring-sky-500"
                        checked={Boolean(l.calendar_sync_enabled)}
                        onChange={(e) => void setCalendarSync(l.id, e.target.checked)}
                        disabled={saving === l.id}
                      />
                      <span>
                        <span className="text-sm font-semibold text-sky-950">Live calendar sync</span>
                        <span className="block text-[11px] text-sky-900 mt-0.5 leading-snug">
                          Shows the blue “live openings” block on the public listing when enabled. Populate{" "}
                          <code className="text-[10px] bg-white/80 px-1 rounded">listing_live_availability_slots</code> via your
                          sync job; set <code className="text-[10px] bg-white/80 px-1 rounded">calendar_last_synced_at</code> in
                          SQL or the job.
                        </span>
                        {l.calendar_last_synced_at && (
                          <span className="block text-[10px] text-sky-800 mt-1">
                            Last synced:{" "}
                            {new Date(l.calendar_last_synced_at).toLocaleString("es-MX", {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        )}
                      </span>
                    </label>
                  </div>
                )}

                {/* Commission + Actions */}
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-[#6B7280]">Commission %</label>
                    <input
                      type="number"
                      min="0" max="30" step="0.5"
                      value={commissions[l.id] ?? "5"}
                      onChange={e => setCommissions(c => ({ ...c, [l.id]: e.target.value }))}
                      className="w-16 border border-[#E5E0D8] rounded-lg px-2 py-1.5 text-sm text-center outline-none focus:border-[#1B4332]"
                    />
                    <span className="text-xs text-[#6B7280]">%</span>
                    {l.is_verified && (
                      <button onClick={() => updateCommission(l.id)}
                        disabled={saving === l.id}
                        className="text-xs px-3 py-1.5 rounded-lg bg-[#EFF6FF] text-[#1D4ED8] font-semibold hover:bg-[#DBEAFE] transition-colors disabled:opacity-40">
                        {saving === l.id ? "..." : "Update %"}
                      </button>
                    )}
                  </div>

                  <div className="flex gap-2 ml-auto">
                    {!l.is_verified && (
                      <button onClick={() => approve(l.id)}
                        disabled={saving === l.id}
                        className="px-4 py-2 rounded-xl bg-[#1B4332] text-white text-sm font-semibold hover:bg-[#2D6A4F] transition-colors disabled:opacity-40">
                        {saving === l.id ? "..." : "✓ Approve"}
                      </button>
                    )}
                    <button onClick={() => reject(l.id)}
                      disabled={saving === l.id}
                      className="px-4 py-2 rounded-xl bg-white border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-40">
                      {saving === l.id ? "..." : l.is_verified ? "Remove" : "Reject"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </>}
      </div>
    </main>
  );
}
