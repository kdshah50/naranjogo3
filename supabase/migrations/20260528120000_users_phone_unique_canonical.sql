-- One canonical phone per user (E.164 digits, no + prefix).
-- Run scripts/merge-duplicate-users-by-phone.ts --apply BEFORE this migration.

COMMENT ON COLUMN public.users.phone IS
  'WhatsApp login phone: E.164 digits without + (e.g. 17326908527, 524151816902). UNIQUE when set.';

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique
  ON public.users (phone)
  WHERE phone IS NOT NULL AND btrim(phone) <> '';

COMMENT ON INDEX public.users_phone_unique IS
  'Prevents duplicate OTP accounts for the same WhatsApp number. Merge legacy rows before applying.';
