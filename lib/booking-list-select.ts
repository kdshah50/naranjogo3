/** Shared column list for booking list APIs (buyer + seller). */
export const SERVICE_BOOKING_LIST_COLUMNS =
  "id,listing_id,seller_id,buyer_id,commission_amount_cents,commission_pct,pricing_base_mxn_cents,payment_status,paid_at,status,created_at,updated_at,package_session_count,ticket_code,cancelled_at,cancelled_by_role,cancel_reason_code,appointment_at,balance_due_mxn_cents,balance_payment_status,balance_paid_at,tip_mxn_cents,tip_payment_status,tip_paid_at" as const;
