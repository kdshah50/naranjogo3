import type { Lang } from "@/lib/i18n-lang";
import type { SellerPlatformJobStats } from "@/lib/seller-platform-stats";
import { isVerifiedProviderProfile, trustMicrocopy } from "@/lib/provider-trust";

type Props = {
  lang: Lang;
  isService: boolean;
  displayName: string;
  trustBadge: string;
  ineVerified: boolean;
  rfcVerified: boolean;
  phoneVerified: boolean;
  listingAdminVerified: boolean;
  stats: SellerPlatformJobStats;
};

export default function ListingTrustStrip({
  lang,
  isService,
  displayName,
  trustBadge,
  ineVerified,
  rfcVerified,
  phoneVerified,
  listingAdminVerified,
  stats,
}: Props) {
  if (!isService) return null;

  const verifiedProvider = isVerifiedProviderProfile({ ineVerified, rfcVerified, trustBadge });
  const hasPhoneSignal = phoneVerified || listingAdminVerified;

  const thisListingPaid = stats.listingPaidBookings;
  const thisListingDone = stats.listingCompletedPaid;
  const thisListingActive = stats.listingActivePaidBookings;
  const sellerAllPaid = stats.sellerPaidBookings;
  const sellerAllDone = stats.sellerCompletedPaid;

  return (
    <section
      className="mb-6 rounded-2xl border-2 border-[#1B4332]/20 bg-gradient-to-br from-[#ECFDF5] via-white to-[#FDF8F1] p-4 sm:p-5 shadow-sm"
      aria-labelledby="trust-strip-heading"
    >
      <h2 id="trust-strip-heading" className="sr-only">
        {lang === "en" ? "Trust and verification" : "Confianza y verificación"}
      </h2>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {verifiedProvider ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1B4332] text-white text-xs font-bold px-3 py-1.5 shadow-sm">
            <span className="text-sm" aria-hidden>
              ✓
            </span>
            {lang === "en" ? "Verified provider" : "Proveedor verificado"}
          </span>
        ) : hasPhoneSignal ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold px-3 py-1.5">
            {lang === "en" ? "Active on Naranjogo" : "Activo en Naranjogo"}
          </span>
        ) : null}

        <span
          className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-950 border border-amber-300 text-[11px] font-bold px-2.5 py-1"
          title={
            lang === "en"
              ? "Service fee is paid through Naranjogo; you get guarantee eligibility on that booking."
              : "La tarifa del servicio se paga por Naranjogo; esa reserva puede tener garantía."
          }
        >
          💳 {lang === "en" ? "Paid via platform" : "Pago por la app"}
        </span>
      </div>

      <p className="text-sm font-semibold text-[#1C1917] mb-1">
        {lang === "en" ? `About ${displayName}` : `Sobre ${displayName}`}
      </p>

      <ul className="text-sm text-[#374151] space-y-1.5 mb-3">
        {thisListingPaid === 0 && thisListingDone === 0 && sellerAllPaid === 0 && (
          <li className="flex flex-wrap gap-x-1">
            <span className="font-bold text-[#1B4332]">
              {lang === "en" ? "Completed on Naranjogo:" : "Completados en Naranjogo:"}
            </span>
            <span>
              {lang === "en"
                ? "Building track record — be the first to leave a review."
                : "Construyendo historial — sé el primero en dejar reseña."}
            </span>
          </li>
        )}
        {thisListingPaid === 0 && sellerAllPaid > 0 && (
          <li className="text-xs text-[#6B7280] leading-snug">
            {lang === "en"
              ? "No paid platform bookings on this specific ad yet — provider totals below include their other listings."
              : "Aún no hay reservas pagadas por la app en este anuncio — los totales del proveedor abajo incluyen sus otros anuncios."}
          </li>
        )}
        {(thisListingPaid > 0 || thisListingDone > 0) && (
          <li className="flex flex-col gap-0.5">
            <span className="font-bold text-[#1B4332]">
              {lang === "en" ? "On this listing (all buyers):" : "En este anuncio (todos los clientes):"}
            </span>
            <span>
              {lang === "en" ? (
                <>
                  {thisListingPaid} paid via platform · {thisListingDone} marked completed
                  {thisListingActive > 0
                    ? ` · ${thisListingActive} still active (not completed yet)`
                    : ""}
                </>
              ) : (
                <>
                  {thisListingPaid} pagadas por la app · {thisListingDone} marcadas completadas
                  {thisListingActive > 0
                    ? ` · ${thisListingActive} siguen activas (aún no completadas)`
                    : ""}
                </>
              )}
            </span>
          </li>
        )}
        {(sellerAllPaid > 0 || sellerAllDone > 0) && (
          <li className="flex flex-col gap-0.5 text-xs text-[#6B7280]">
            <span className="font-semibold text-[#374151]">
              {lang === "en" ? "Provider total (all their ads):" : "Total del proveedor (todos sus anuncios):"}
            </span>
            <span>
              {lang === "en" ? (
                <>
                  {sellerAllPaid} paid · {sellerAllDone} completed
                </>
              ) : (
                <>
                  {sellerAllPaid} pagadas · {sellerAllDone} completadas
                </>
              )}
            </span>
          </li>
        )}
        <li className="text-[11px] text-[#6B7280] leading-snug border-t border-emerald-200/60 pt-2">
          {lang === "en"
            ? "“My bookings” shows only your own reservations. Figures above for “this listing” include every buyer; provider totals include all of their ads."
            : "«Mis reservas» muestra solo tus reservas. Las cifras de «este anuncio» incluyen a todos los compradores; los totales del proveedor incluyen todos sus anuncios."}
        </li>
      </ul>

      <p className="text-xs text-[#6B7280] leading-relaxed border-t border-emerald-200/60 pt-3 italic">
        {trustMicrocopy(lang)}
      </p>
    </section>
  );
}
