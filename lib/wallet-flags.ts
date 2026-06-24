import { isRidesEnabled } from "@/lib/rides/flags";

/**
 * Wallet top-up (`/saldo`) and service deposit payments.
 *
 * `WALLET_ENABLED=true` turns on wallet without enabling rides.
 * When unset, wallet follows `RIDES_ENABLED` for backward compatibility.
 */
export function isWalletEnabled(): boolean {
  const explicit = String(process.env.WALLET_ENABLED ?? "").trim().toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return isRidesEnabled();
}
