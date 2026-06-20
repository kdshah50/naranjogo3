"use client";
import { useState, Suspense, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { withLang } from "@/lib/i18n-lang";
import type { Lang } from "@/lib/i18n-lang";
import HeaderWeather from "./HeaderWeather";
import TianguisWordmark from "./TianguisWordmark";

const SellModal = dynamic(() => import("./SellModal"), { ssr: false });
const CartHeaderLink = dynamic(() => import("@/components/cart/CartHeaderLink"), { ssr: false });

function LangToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const lang = (params.get("lang") === "en" ? "en" : "es") as Lang;
  const toggle = (l: string) => {
    try {
      localStorage.setItem("naranjo_lang", l);
    } catch {
      /* ignore */
    }
    const p = new URLSearchParams(params.toString());
    p.set("lang", l);
    router.push(`${pathname}?${p.toString()}`);
  };
  return (
    <div className="flex bg-[#F4F0EB] rounded-lg p-0.5 gap-0.5">
      {["es", "en"].map((l) => (
        <button key={l} onClick={() => toggle(l)}
          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
            lang === l ? "bg-white text-[#1B4332] shadow-sm" : "text-[#6B7280] hover:text-[#1B4332]"
          }`}
        >{l.toUpperCase()}</button>
      ))}
    </div>
  );
}

function HeaderInner() {
  const [showSell, setShowSell] = useState(false);
  const [user, setUser] = useState<{ phone: string; badge: string } | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const params = useSearchParams();
  const lang = (params.get("lang") === "en" ? "en" : "es") as Lang;
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/auth/session", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d: { loggedIn?: boolean; phone?: string; badge?: string }) => {
        if (d.loggedIn && d.phone && d.badge != null) {
          setUser({ phone: d.phone, badge: d.badge });
        } else {
          setUser(null);
        }
      })
      .catch(() => setUser(null));
  }, [pathname]);

  const handleLogout = () => {
    void fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).finally(() => {
      setUser(null);
      setShowMenu(false);
      router.push("/");
    });
  };

  const badgeIcon = (b: string) => b === "diamond" ? "💎" : b === "gold" ? "🥇" : "🥉";

  return (
    <>
      <header className="bg-white border-b border-[#E5E0D8] sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <TianguisWordmark variant="header" />

          <div className="flex items-center gap-3 ml-auto">
            <Suspense fallback={<div className="w-16 h-7 bg-[#F4F0EB] rounded-lg" />}>
              <LangToggle />
            </Suspense>

            {user ? (
              /* Logged-in user: avatar opens menu; trust emoji links straight to bookings */
              <div className="relative flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowMenu(!showMenu)}
                  className="flex items-center justify-center px-2.5 py-1.5 rounded-xl bg-[#F4F0EB] hover:bg-[#E5E0D8] transition-colors"
                  aria-expanded={showMenu}
                  aria-haspopup="menu"
                  aria-label={lang === "en" ? "Account menu" : "Menú de cuenta"}
                >
                  <div className="w-6 h-6 rounded-full bg-[#1B4332] flex items-center justify-center text-white text-[10px] font-bold">
                    {(user.phone.length >= 2 ? user.phone.slice(-2) : "••").toUpperCase()}
                  </div>
                </button>
                <Link
                  href={withLang("/my-bookings", lang)}
                  className="flex items-center justify-center min-w-[2.25rem] px-2 py-1.5 rounded-xl bg-[#F4F0EB] hover:bg-[#E5E0D8] transition-colors border border-transparent hover:border-[#E5E0D8]"
                  title={lang === "en" ? "My bookings — reservations & reviews" : "Mis reservas y reseñas"}
                  aria-label={lang === "en" ? "My bookings" : "Mis reservas"}
                  onClick={() => setShowMenu(false)}
                >
                  <span className="text-sm leading-none" aria-hidden>
                    {badgeIcon(user.badge)}
                  </span>
                </Link>
                {showMenu && (
                  <div className="absolute right-0 top-full mt-2 w-44 bg-white border border-[#E5E0D8] rounded-xl shadow-lg overflow-hidden z-50">
                <Link
                  href={withLang("/messages", lang)}
                  className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-[#F4F0EB] transition-colors"
                  onClick={() => setShowMenu(false)}
                >
                  {lang === "en" ? "Messages" : "Mensajes"}
                </Link>
                <Link
                  href={withLang("/my-bookings", lang)}
                  className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-[#F4F0EB] transition-colors"
                  onClick={() => setShowMenu(false)}
                >
                  📋 {lang === "en" ? "My bookings" : "Mis reservas"}
                </Link>
                <Link
                  href={withLang("/profile#loyalty-section", lang)}
                  className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-[#F4F0EB] transition-colors"
                  onClick={() => setShowMenu(false)}
                >
                  ⭐ {lang === "en" ? "Loyalty & points" : "Lealtad y puntos"}
                </Link>
                <Link href={withLang("/profile", lang)}
                      className="flex items-center gap-2 px-4 py-3 text-sm hover:bg-[#F4F0EB] transition-colors"
                      onClick={() => setShowMenu(false)}>
                      👤 {lang === "en" ? "My profile" : "Mi perfil"}
                    </Link>
                    <button onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors">
                      🚪 {lang === "en" ? "Log out" : "Cerrar sesión"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Not logged in — show Login link */
              <Link href={withLang("/auth/login", lang)}
                className="text-sm font-semibold text-[#1B4332] hover:underline px-2">
                {lang === "en" ? "Log in" : "Entrar"}
              </Link>
            )}
            <Link href={withLang("/unete", lang)}
              className="text-sm font-semibold px-4 py-2 rounded-xl border border-[#1B4332] text-[#1B4332] hover:bg-[#1B4332] hover:text-white transition-colors hidden sm:inline-flex">
              {lang === "en" ? "List your service" : "Únete"}
            </Link>
            <CartHeaderLink />
            <button onClick={() => setShowSell(true)}
              className="bg-[#D4A017] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#C4900D] transition-colors">
              + {lang === "en" ? "Sell" : "Vender"}
            </button>
          </div>
        </div>
      </header>
      {user && <HeaderWeather lang={lang === "en" ? "en" : "es"} />}
      {showSell && <SellModal onClose={() => setShowSell(false)} />}
    </>
  );
}

export default function Header() {
  return (
    <Suspense fallback={
      <header className="bg-white border-b border-[#E5E0D8] sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center">
          <TianguisWordmark variant="header" />
        </div>
      </header>
    }>
      <HeaderInner />
    </Suspense>
  );
}
