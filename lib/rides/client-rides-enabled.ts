/** Client probe — same origin as the page (works on *.vercel.app and naranjogo.com.mx). */
export async function fetchRidesEnabledOnServer(): Promise<boolean> {
  try {
    const r = await fetch("/api/rides/enabled", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!r.ok) return false;
    const j = (await r.json()) as { enabled?: boolean };
    return j.enabled === true;
  } catch {
    return false;
  }
}
