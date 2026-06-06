-- =========================================================================
-- GROVIT INVENTORY SUPPLY CHAIN MIGRATION SCRIPT (PHASE 1 & PHASE 2)
-- =========================================================================

-- 1. DROP OLD EMPTY/INCOMPLETE TABLES IF THEY EXIST TO RE-ESTABLISH CORRECT COLUMNS
DROP TABLE IF EXISTS public.inventory_transfer_events CASCADE;
DROP TABLE IF EXISTS public.inventory_transfer_variances CASCADE;
DROP TABLE IF EXISTS public.inventory_dispatch_items CASCADE;
DROP TABLE IF EXISTS public.inventory_dispatches CASCADE;
DROP TABLE IF EXISTS public.inventory_transfer_request_items CASCADE;
DROP TABLE IF EXISTS public.inventory_transfer_requests CASCADE;
DROP TABLE IF EXISTS public.inventory_recipe_items CASCADE;
DROP TABLE IF EXISTS public.inventory_recipes CASCADE;
DROP TABLE IF EXISTS public.inventory_consumption_jobs CASCADE;
DROP TABLE IF EXISTS public.inventory_consumption_batches CASCADE;

-- 2. ADD BRANCH TYPE ENHANCEMENT
ALTER TABLE public.branches 
ADD COLUMN IF NOT EXISTS branch_type text NOT NULL DEFAULT 'RESTAURANT' 
CHECK (branch_type IN ('RESTAURANT', 'CENTRAL_KITCHEN', 'WAREHOUSE'));


-- 3. POSTGRESQL SEQUENCES FOR ATOMIC SEQUENCE NUMBER GENERATION
DROP SEQUENCE IF EXISTS public.transfer_request_seq CASCADE;
DROP SEQUENCE IF EXISTS public.dispatch_seq CASCADE;

CREATE SEQUENCE public.transfer_request_seq START WITH 1;
CREATE SEQUENCE public.dispatch_seq START WITH 1;

-- Function & Trigger: Auto-generate TRF-YYYY-XXXX on INSERT
CREATE OR REPLACE FUNCTION public.generate_transfer_request_number() 
RETURNS trigger AS $$
DECLARE
    seq_val int;
    year_val text;
BEGIN
    seq_val := nextval('public.transfer_request_seq');
    year_val := to_char(now(), 'YYYY');
    NEW.request_number := 'TRF-' || year_val || '-' || lpad(seq_val::text, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function & Trigger: Auto-generate DSP-YYYY-XXXX on INSERT
CREATE OR REPLACE FUNCTION public.generate_dispatch_number() 
RETURNS trigger AS $$
DECLARE
    seq_val int;
    year_val text;
BEGIN
    seq_val := nextval('public.dispatch_seq');
    year_val := to_char(now(), 'YYYY');
    NEW.dispatch_number := 'DSP-' || year_val || '-' || lpad(seq_val::text, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- 4. CREATE TRANSFER REQUESTS & ITEMS
CREATE TABLE public.inventory_transfer_requests (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE, -- creator branch
    request_number text UNIQUE, -- generated automatically by trigger
    from_branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE, -- supplying branch (CK/Warehouse)
    to_branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE, -- requesting branch (Restaurant)
    request_date timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL CHECK (status IN (
        'Pending', 'Approved', 'Partially Dispatched', 'Dispatched', 
        'Partially Received', 'Completed', 'Rejected', 'Cancelled'
    )),
    remarks text,
    created_by text,
    approved_by uuid, -- approval tracking metadata
    approved_at timestamptz,
    rejected_by uuid, -- rejection tracking metadata
    rejected_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventory_transfer_requests_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_transfer_request_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    transfer_request_id uuid NOT NULL public.inventory_transfer_requests(id) ON DELETE CASCADE,
    material_id uuid NOT NULL REFERENCES public.inventory_materials(id) ON DELETE CASCADE,
    requested_quantity numeric NOT NULL CHECK (requested_quantity > 0),
    approved_quantity numeric CHECK (approved_quantity >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventory_transfer_request_items_pkey PRIMARY KEY (id)
);

CREATE TRIGGER trg_generate_transfer_request_number
BEFORE INSERT ON public.inventory_transfer_requests
FOR EACH ROW
WHEN (NEW.request_number IS NULL)
EXECUTE FUNCTION public.generate_transfer_request_number();


-- 5. CREATE DISPATCHES & ITEMS
CREATE TABLE public.inventory_dispatches (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE, -- supplying branch
    dispatch_number text UNIQUE, -- generated automatically by trigger
    transfer_request_id uuid REFERENCES public.inventory_transfer_requests(id) ON DELETE SET NULL,
    from_branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    to_branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    dispatch_date timestamptz NOT NULL DEFAULT now(),
    status text NOT NULL CHECK (status IN ('Dispatched', 'Received')),
    remarks text,
    created_by text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventory_dispatches_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_dispatch_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    dispatch_id uuid NOT NULL public.inventory_dispatches(id) ON DELETE CASCADE,
    material_id uuid NOT NULL REFERENCES public.inventory_materials(id) ON DELETE CASCADE,
    dispatched_quantity numeric NOT NULL CHECK (dispatched_quantity > 0),
    received_quantity numeric CHECK (received_quantity >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventory_dispatch_items_pkey PRIMARY KEY (id)
);

CREATE TRIGGER trg_generate_dispatch_number
BEFORE INSERT ON public.inventory_dispatches
FOR EACH ROW
WHEN (NEW.dispatch_number IS NULL)
EXECUTE FUNCTION public.generate_dispatch_number();


-- 6. CREATE TRANSFER VARIANCES TABLE
CREATE TABLE public.inventory_transfer_variances (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    dispatch_item_id uuid NOT NULL REFERENCES public.inventory_dispatch_items(id) ON DELETE CASCADE,
    material_id uuid NOT NULL REFERENCES public.inventory_materials(id) ON DELETE CASCADE,
    dispatched_qty numeric NOT NULL,
    received_qty numeric NOT NULL,
    variance_qty numeric NOT NULL, -- (dispatched_qty - received_qty)
    reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventory_transfer_variances_pkey PRIMARY KEY (id)
);


-- 7. CREATE TRANSFER EVENTS TABLE (AUDIT TRAIL)
CREATE TABLE public.inventory_transfer_events (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    transfer_request_id uuid NOT NULL REFERENCES public.inventory_transfer_requests(id) ON DELETE CASCADE,
    event_type text NOT NULL, -- 'Created', 'Approved', 'Dispatched', 'Received', 'Cancelled', 'Rejected'
    performed_by text NOT NULL,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventory_transfer_events_pkey PRIMARY KEY (id)
);


-- 8. CREATE RECIPES & RECIPE ITEMS
CREATE TABLE public.inventory_recipes (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    yield_quantity numeric NOT NULL DEFAULT 1 CHECK (yield_quantity > 0), -- recipe output yield
    yield_unit text NOT NULL DEFAULT 'portion', -- e.g., 'portion', 'batch', 'kg'
    cost_snapshot numeric NOT NULL DEFAULT 0, -- cost average snapshot
    version_no integer NOT NULL DEFAULT 1, -- version control
    effective_from timestamptz NOT NULL DEFAULT now(), -- validity date
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventory_recipes_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_recipe_items (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    recipe_id uuid NOT NULL REFERENCES public.inventory_recipes(id) ON DELETE CASCADE,
    material_id uuid NOT NULL REFERENCES public.inventory_materials(id) ON DELETE CASCADE,
    quantity numeric NOT NULL CHECK (quantity > 0), -- material input qty required for the yield
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inventory_recipe_items_pkey PRIMARY KEY (id)
);

-- Link recipes to menu products
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS inventory_tracking_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS recipe_id uuid REFERENCES public.inventory_recipes(id) ON DELETE SET NULL;


-- 9. CREATE RECIPE CONSUMPTION BATCHES & QUEUE
CREATE TABLE public.inventory_consumption_batches (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Processed', 'Failed')),
    total_cost_snapshot numeric NOT NULL DEFAULT 0, -- sum of ingredient costs in this batch
    created_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    CONSTRAINT inventory_consumption_batches_pkey PRIMARY KEY (id)
);

CREATE TABLE public.inventory_consumption_jobs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    batch_id uuid NOT NULL REFERENCES public.inventory_consumption_batches(id) ON DELETE CASCADE,
    material_id uuid NOT NULL REFERENCES public.inventory_materials(id) ON DELETE CASCADE,
    quantity_to_deduct numeric NOT NULL CHECK (quantity_to_deduct > 0),
    status text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Processed', 'Failed')),
    attempt_count integer NOT NULL DEFAULT 0,
    last_attempt_at timestamptz,
    processed_by text,
    retry_after timestamptz,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz,
    CONSTRAINT inventory_consumption_jobs_pkey PRIMARY KEY (id)
);


-- =========================================================================
-- 10. PERFORMANCE INDEXES
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_transfer_requests_tenant_branch ON public.inventory_transfer_requests(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_dispatches_tenant_branch ON public.inventory_dispatches(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_variances_tenant ON public.inventory_transfer_variances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transfer_events_req ON public.inventory_transfer_events(transfer_request_id);
CREATE INDEX IF NOT EXISTS idx_recipes_tenant ON public.inventory_recipes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_consumption_batches_bill ON public.inventory_consumption_batches(bill_id);
CREATE INDEX IF NOT EXISTS idx_consumption_jobs_batch ON public.inventory_consumption_jobs(batch_id);
