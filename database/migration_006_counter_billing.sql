-- migration_006_counter_billing.sql
-- Counter billing adjustments: percentage discount, delivery charge, and
-- complimentary orders. All three are entered by a rep on the New Order screen
-- (customer checkout never sets them), and — like the GST columns added in
-- migration_004 — the resolved amounts are SNAPSHOTTED on the order so editing
-- anything later never rewrites a past bill.
--
-- Billing order is fixed and mirrored in includes/gst.php::compute_order_total:
--   discount_amount = subtotal * discount_pct / 100
--   taxable         = subtotal - discount_amount
--   GST is charged on `taxable`, never on the pre-discount subtotal
--   delivery_charge is added AFTER tax (it is not taxed here)
--   is_complimentary = 1 zeroes every billable line; subtotal is kept as the
--   notional value of the food given away, so comps stay reportable.
--
-- Defaults of 0 mean every pre-existing order reads back exactly as before.

ALTER TABLE orders
  ADD COLUMN discount_pct     DECIMAL(5,2)  NOT NULL DEFAULT 0 AFTER gst_rate,
  ADD COLUMN discount_amount  DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER discount_pct,
  ADD COLUMN delivery_charge  DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER discount_amount,
  ADD COLUMN is_complimentary TINYINT(1)    NOT NULL DEFAULT 0 AFTER delivery_charge;
