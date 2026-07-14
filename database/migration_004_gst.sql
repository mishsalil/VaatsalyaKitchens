-- migration_004_gst.sql
-- Tax-exclusive GST on billing: snapshot the breakdown per order so past
-- orders never change when the rate is edited, and surface it on bills/receipts.
-- Menu prices stay pre-tax; the grand total (subtotal + GST) is what the
-- customer pays and is stored in the existing total_estimate column.
--
-- gst_rate = 0 for pre-existing orders → the UI falls back to showing only
-- total_estimate (no breakdown). New orders snapshot the rate active at checkout.

ALTER TABLE orders
  ADD COLUMN subtotal  DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER total_estimate,
  ADD COLUMN cgst      DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER subtotal,
  ADD COLUMN sgst      DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER cgst,
  ADD COLUMN gst_rate  DECIMAL(5,2)  NOT NULL DEFAULT 0 AFTER sgst;

-- Editable GST rate (percent), split equally SGST/CGST. Default 5%.
INSERT IGNORE INTO settings (`key`, `value`) VALUES ('gst_rate', '5');