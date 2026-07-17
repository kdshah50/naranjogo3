# Property Management — progress

**Branch:** `feature/property-management`  
**Spec:** [Naranjogo_PropertyManagement_Spec.pdf](./Naranjogo_PropertyManagement_Spec.pdf)  
**Landing:** `/administracion-de-propiedades`  
**Signup slug:** `administracion_propiedades` (`?service=` on `/unete`)

## Done (foundation)

- [x] Branch from `main`
- [x] Catalog entry + `PROPERTY_MANAGEMENT_SERVICE`
- [x] Hero chip + TrustBar + search trade hints
- [x] Landing page (packages / sub-services / FAQ) + buyer intake before browse
- [x] Únete PM fields (business name, years, insurance, 2 references, sub-services, package tiers)
- [x] PM terms clause (key-holding / cancellation)
- [x] `listings.property_management` jsonb migration
- [x] Provider-signup stores PM profile; listing price = starting monthly MXN
- [x] Listing card / detail: monthly retainer + “Consultation required”

## Still open (from spec §7)

- [ ] Recurring Stripe monthly billing (today: consultation + chat; fee rail unchanged)
- [ ] Admin UI to verify Insured/Bonded + set `insured_verified`
- [ ] Persist buyer intake per account (today: `sessionStorage`)
- [ ] Optional short-term rental registration proof for Rental/Guest Management
- [ ] Insurance document upload at signup (declared fields only in v1)

## Apply migration

Run in Supabase SQL Editor:

`supabase/migrations/20260717120000_listings_property_management.sql`
