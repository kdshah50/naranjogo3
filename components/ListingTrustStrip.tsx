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
  const completed = stats.sellerCompletedPaid;
  const paidJobs = stats.sellerPaidBookings;

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
        <li className="flex flex-wrap gap-x-1">
          <span className="font-bold text-[#1B4332]">
            {lang === "en" ? "Completed on Naranjogo:" : "Completados en Naranjogo:"}
          </span>
          <span>
            {completed > 0
              ? lang === "en"
                ? `${completed} job${completed === 1 ? "" : "s"} (platform booking marked done)`
                : `${completed} trabajo${completed === 1 ? "" : "s"} (reserva marcada completada)`
              : lang === "en"
                ? "Building track record — be the first to leave a review."
                : "Construyendo historial — sé el primero en dejar reseña."}
          </span>
        </li>
        {paidJobs > 0 && (
          <li className="flex flex-wrap gap-x-1 text-xs text-[#6B7280]">
            <span className="font-semibold text-[#374151]">
              {lang === "en" ? "Paid platform bookings (seller):" : "Reservas pagadas en la app (proveedor):"}
            </span>
            {paidJobs}
          </li>
        )}
        {stats.listingCompletedPaid > 0 && (
          <li className="flex flex-wrap gap-x-1 text-xs text-[#6B7280]">
            <span className="font-semibold text-[#374151]">
              {lang === "en" ? "Completed for this listing:" : "Completados en este anuncio:"}
            </span>
            {stats.listingCompletedPaid}
          </li>
        )}
      </ul>

      <p className="text-xs text-[#6B7280] leading-relaxed border-t border-emerald-200/60 pt-3 italic">
        {trustMicrocopy(lang)}
      </p>
    </section>
  );
}
