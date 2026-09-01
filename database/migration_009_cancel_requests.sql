-- migration_009_cancel_requests.sql
-- A customer cancelling is a REQUEST, not the cancellation itself.
--
-- migration_008 flipped orders.status straight to 'cancelled' when a customer
-- cancelled, and only then asked staff to confirm the kitchen was told. That is
-- backwards: the customer's screen said "Cancelled" while the kitchen was still
-- cooking, and the confirmation could never actually change the outcome — the
-- order was already cancelled before anyone looked at it.
--
-- Now the customer records a REQUEST. The order keeps its real status, and the
-- customer is shown "waiting for the kitchen to confirm". A staff confirmation
-- is what actually cancels it and notifies the customer.
--
-- A rep cancelling from the admin is unchanged: they are the kitchen's own
-- side, so status flips immediately; their confirmation only records that the
-- kitchen was told and releases the customer's notification.

ALTER TABLE orders
  ADD COLUMN cancel_requested_at    DATETIME NULL AFTER is_complimentary,
  ADD COLUMN cancel_requested_by    INT UNSIGNED NULL AFTER cancel_requested_at,
  ADD COLUMN cancel_requested_label VARCHAR(120) NULL AFTER cancel_requested_by;
