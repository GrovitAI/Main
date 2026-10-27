-- Task 288: an optional customer name and phone number on a POS order, printed on its bill.
-- The settled bill keeps open_order_id, so the order carries them for the bill as well; nothing
-- else changes. The table's existing grants and row security cover the new columns.

ALTER TABLE public.open_orders ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE public.open_orders ADD COLUMN IF NOT EXISTS customer_phone text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'open_orders_customer_name_check') THEN
    ALTER TABLE public.open_orders ADD CONSTRAINT open_orders_customer_name_check
      CHECK (customer_name IS NULL OR (length(btrim(customer_name)) BETWEEN 1 AND 80));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'open_orders_customer_phone_check') THEN
    -- Digits with an optional leading +, 6 to 15 digits (stored without spaces).
    ALTER TABLE public.open_orders ADD CONSTRAINT open_orders_customer_phone_check
      CHECK (customer_phone IS NULL OR customer_phone ~ '^\+?[0-9]{6,15}$');
  END IF;
END $$;
