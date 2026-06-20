-- Quick check: driver online state + ride NG-D97FC9EB (preview SQL Editor)
SELECT dp.user_id, dp.is_online, dp.is_active_driver, dp.last_lat, dp.last_lng, dp.last_location_at, dp.vehicle_plates
FROM public.driver_profiles dp
ORDER BY dp.updated_at DESC
LIMIT 5;

SELECT id, ticket_code, status, driver_id, buyer_id, pickup_address, dropoff_address, updated_at
FROM public.ride_bookings
WHERE ticket_code ILIKE '%D97FC9EB%'
   OR ticket_code = 'NG-D97FC9EB'
ORDER BY created_at DESC
LIMIT 3;
