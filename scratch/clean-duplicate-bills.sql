-- ==============================================================================
-- Data Migration & DDL: Clean Duplicate Bills & Enforce UNIQUE(open_order_id)
-- Run this script in the Supabase SQL Editor for Grovit AI POS (Le Laban)
-- ==============================================================================

-- Step 1: Preview duplicate bills before deletion
SELECT open_order_id, COUNT(*) as duplicate_count
FROM bills
GROUP BY open_order_id
HAVING COUNT(*) > 1;

-- Step 2: Delete duplicate bill items belonging to secondary duplicate bills
DELETE FROM bill_items
WHERE bill_id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
            PARTITION BY open_order_id 
            ORDER BY created_at ASC, id ASC
        ) as row_num
        FROM bills
    ) duplicates
    WHERE row_num > 1
);

-- Step 3: Delete duplicate settlements belonging to secondary duplicate bills
DELETE FROM settlements
WHERE bill_id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
            PARTITION BY open_order_id 
            ORDER BY created_at ASC, id ASC
        ) as row_num
        FROM bills
    ) duplicates
    WHERE row_num > 1
);

-- Step 4: Delete secondary duplicate bills (retaining the earliest created bill per open_order_id)
DELETE FROM bills
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (
            PARTITION BY open_order_id 
            ORDER BY created_at ASC, id ASC
        ) as row_num
        FROM bills
    ) duplicates
    WHERE row_num > 1
);

-- Step 5: Verify 0 duplicates remain
SELECT open_order_id, COUNT(*) as remaining_duplicates
FROM bills
GROUP BY open_order_id
HAVING COUNT(*) > 1;

-- Step 6: Apply the unique constraint on open_order_id
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'unique_open_order_id'
    ) THEN
        ALTER TABLE bills ADD CONSTRAINT unique_open_order_id UNIQUE (open_order_id);
    END IF;
END $$;
