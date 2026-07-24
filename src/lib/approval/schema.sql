-- Migration: Branch Approval System for Grovit AI POS (v1.0 Production Hardened)

-- 1. PostgreSQL ENUM Types
DO $$ BEGIN
    CREATE TYPE approval_action_enum AS ENUM (
        'REPRINT_BILL',
        'CANCEL_BILL',
        'APPLY_DISCOUNT',
        'COMPLIMENTARY_BILL'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE approval_status_enum AS ENUM (
        'PENDING',
        'APPROVED',
        'COMPLETED',
        'FAILED',
        'EXPIRED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE approval_resource_type_enum AS ENUM (
        'bill',
        'order',
        'settlement'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Automatic updated_at Trigger Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Branch Approval Settings Table
CREATE TABLE IF NOT EXISTS branch_approval_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  approval_email TEXT NOT NULL,
  approval_email_verified BOOLEAN NOT NULL DEFAULT false,
  approval_email_verified_at TIMESTAMPTZ NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  policies JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_branch_approval_settings UNIQUE (tenant_id, branch_id),
  CONSTRAINT check_valid_approval_email CHECK (approval_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX IF NOT EXISTS idx_branch_approval_settings_tenant_branch 
  ON branch_approval_settings(tenant_id, branch_id);

DROP TRIGGER IF EXISTS trigger_branch_approval_settings_updated_at ON branch_approval_settings;
CREATE TRIGGER trigger_branch_approval_settings_updated_at
  BEFORE UPDATE ON branch_approval_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 4. Branch Approval Settings History Audit Table
CREATE TABLE IF NOT EXISTS branch_approval_settings_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  changed_by TEXT NOT NULL,
  previous_email TEXT NULL,
  new_email TEXT NOT NULL,
  previous_enabled BOOLEAN NULL,
  new_enabled BOOLEAN NOT NULL,
  previous_policies JSONB NULL,
  new_policies JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branch_approval_settings_history 
  ON branch_approval_settings_history(tenant_id, branch_id);

-- 5. Approval Requests & Audit Log Table
CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  request_uuid UUID NOT NULL UNIQUE,
  action approval_action_enum NOT NULL,
  resource_type approval_resource_type_enum NOT NULL,
  resource_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  cashier_id TEXT NULL,
  cashier_name TEXT NULL,
  branch_name TEXT NULL,
  approval_email TEXT NULL,
  approved_by_email TEXT NULL,
  reason TEXT NOT NULL,
  approval_code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NULL,
  code_verified_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  status approval_status_enum NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_approval_attempts CHECK (attempts >= 0 AND attempts <= 5)
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_branch 
  ON approval_requests(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_uuid 
  ON approval_requests(request_uuid);
CREATE INDEX IF NOT EXISTS idx_approval_requests_action_resource 
  ON approval_requests(tenant_id, branch_id, action, resource_type, resource_id);

DROP TRIGGER IF EXISTS trigger_approval_requests_updated_at ON approval_requests;
CREATE TRIGGER trigger_approval_requests_updated_at
  BEFORE UPDATE ON approval_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6. Email Verification Codes Table
CREATE TABLE IF NOT EXISTS approval_email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  approval_email TEXT NOT NULL,
  verification_code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT check_verification_attempts CHECK (attempts >= 0 AND attempts <= 5)
);

CREATE INDEX IF NOT EXISTS idx_approval_email_verifications 
  ON approval_email_verifications(tenant_id, branch_id, approval_email);
