import { inferProviderSlugFromListingTitle } from "@/lib/infer-listing-provider-slug";
import { TRANSPORT_APP_SERVICE } from "@/lib/provider-services";
import { isRidesEnabled } from "@/lib/rides/flags";

/** Taxi listings on preview use live dispatch (/viaje) — not service_bookings checkout. */
export function transportListingUsesViajeFlow(providerSlug: string | null | undefined): boolean {
  return isRidesEnabled() && providerSlug === TRANSPORT_APP_SERVICE;
}

export function transportViajeFlowForListingTitle(titleEs: string | null | undefined): boolean {
  return transportListingUsesViajeFlow(inferProviderSlugFromListingTitle(titleEs));
}

export const TRANSPORT_VIAJE_ONLY_ERROR =
  "Los viajes de taxi se solicitan en /viaje (carga saldo en /saldo y pide el viaje ahí).";
