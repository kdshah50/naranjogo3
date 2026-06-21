# Handyman / Home Maintenance — Progress Log

**Branch:** `handyman-service`  
**Slug:** `mantenimiento_hogar`  
**Landing:** `/mantenimiento-del-hogar`  
**Signup:** `/unete?service=mantenimiento_hogar`  
**Spec:** `docs/HOME_MAINTENANCE_SERVICES_SPEC.md`

---

## Flow (same as vet / pet care)

| Step | Handyman |
|------|----------|
| Signup | Menu template (19 reference items) |
| Buyer | Request + address → provider WhatsApp |
| Provider | Visit home → adjust quote → **Enviar cotización al cliente** |
| Buyer | Accept → deposit → lifecycle → balance + tip |

**No new DB migrations.**

---

## Smoke test

1. `/mantenimiento-del-hogar` → Registrarme como handyman
2. Admin approve listing
3. Buyer request → official quote → accept → deposit
4. Completado → pay balance in Mis reservas

---

## Next

- Preview deploy smoke test
- Merge to `main` when approved
