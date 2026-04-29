# Service role key (`SUPABASE_SERVICE_ROLE_KEY`)

The Supabase **service role** bypasses Row Level Security (RLS). Treat it like **root database credentials**: it must **never** ship to the browser or appear in `NEXT_PUBLIC_*` variables.

## Allowed patterns in this codebase

| Pattern | API | Module |
|---------|-----|--------|
| Supabase JS admin client | `createAdminSupabase()` | `lib/auth-server.ts` |
| PostgREST `fetch` to `/rest/v1/...` | `getServiceRoleRestHeaders()` | `lib/service-rest.ts` |

Use **`createAdminSupabase()`** for `.from(...).insert/update/select`. Use **`getServiceRoleRestHeaders()`** when issuing raw PostgREST HTTP requests.

Both modules are marked with **`import "server-only"`** so accidental imports from Client Components fail at build time.

## Do not

- Instantiate `createClient(url, SUPABASE_SERVICE_ROLE_KEY)` in random files — use **`createAdminSupabase()`** instead.
- Add new server routes that call Supabase with the service role **without** authenticating the request first (unless the route is intentionally public, e.g. webhooks with their own verification).

## Webhooks and cron

- **Stripe**: authorize with `stripe.webhooks.constructEvent` (`STRIPE_WEBHOOK_SECRET`), then use `createAdminSupabase()`.
- **Cron**: authorize with `Authorization: Bearer ${CRON_SECRET}`, then use `createAdminSupabase()`.

## Rotation

If the service role key leaks, **rotate it in Supabase** and update Vercel/local env immediately. Review audit logs for misuse.
