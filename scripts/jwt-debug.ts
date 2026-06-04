import { loadDotenv } from "./lib/rides-test-helpers";
loadDotenv();

import { SignJWT } from "jose";

async function main() {
  const secret = process.env.JWT_SECRET?.trim() ?? "";
  console.log("After loadDotenv - secret length:", secret.length, "| first 10:", secret.slice(0, 10));
  console.log("RIDES_STAGING_BASE_URL:", process.env.RIDES_STAGING_BASE_URL);

  if (!secret) { console.error("JWT_SECRET empty - loadDotenv failed to find it"); return; }

  const key = new TextEncoder().encode(secret);
  const token = await new SignJWT({ sub: '3d5522b3-aedf-4625-80a1-8a79708bb893', phone: '524151816902', badge: 'bronze' })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('1h')
    .setIssuedAt()
    .sign(key);

  const base = process.env.RIDES_STAGING_BASE_URL?.trim();
  const r = await fetch(base + '/api/rides/wallet', {
    headers: { Cookie: `tianguis_token=${token}`, Accept: 'application/json' }
  });
  console.log('wallet status:', r.status);
  console.log('wallet body:', (await r.text()).slice(0, 300));
}
main().catch(console.error);
