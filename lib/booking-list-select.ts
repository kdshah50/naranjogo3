/** Shared column list for booking list APIs (buyer + seller). */
export const SERVICE_BOOKING_LIST_COLUMNS =
  "id,listing_id,seller_id,buyer_id,commission_amount_cents,payment_status,paid_at,status,created_at,package_session_count,ticket_code,cancelled_at,cancelled_by_role,cancel_reason_code" as const;
