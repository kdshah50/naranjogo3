# Electrician Service — Progress Log

**Branch:** `electrician-service`  
**Slug:** `electricista`  
**Landing:** `/electricista`  
**Signup:** `/unete?service=electricista`  
**Spec:** `docs/HOME_MAINTENANCE_SERVICES_SPEC.md`

---

## Flow (same as vet / pet care)

| Step | Electrician |
|------|-------------|
| Signup | Menu template (16 reference items) |
| Buyer | Request + address → provider WhatsApp |
| Provider | Visit home → adjust quote → **Enviar cotización al cliente** |
| Buyer | Accept → deposit → lifecycle → balance + tip |

**No new DB migrations.**

---

## Smoke test

1. `/electricista` → Registrarme como electricista
2. Admin approve listing
3. Buyer request → official quote → accept → deposit
4. Completado → pay balance in Mis reservas

---

## Next

- Preview deploy smoke test
- Merge to `main` when approved
