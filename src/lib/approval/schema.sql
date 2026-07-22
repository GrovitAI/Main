-- Migration: Branch Approval System for Grovit AI POS (Refined)

-- 1. Branch Approval Settings Table
CREATE TABLE IF NOT EXISTS branch_approval_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  approval_email TEXT NOT NULL,
  approval_email_verified BOOLEAN NOT NULL DEFAULT false,
  approval_email_verified_at TIMESTAMPTZ NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_branch_approval_settings UNIQUE (tenant_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_approval_settings_tenant_branch 
  ON branch_approval_settings(tenant_id, branch_id);

-- 2. Approval Requests & Audit Log Table
CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  request_uuid UUID NOT NULL UNIQUE,
  action TEXT NOT NULL, -- REPRINT_BILL, CANCEL_BILL, APPLY_DISCOUNT, COMPLIMENTARY_BILL
  resource_type TEXT NOT NULL, -- bill, order, settlement
  resource_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  cashier_id TEXT NULL,
  cashier_name TEXT NULL,
  branch_name TEXT NULL,
  approval_email TEXT NULL,
  reason TEXT NOT NULL,
  approval_code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NULL,
  code_verified_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  status TEXT NOT NULL, -- PENDING, APPROVED, COMPLETED, FAILED, EXPIRED
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_tenant_branch 
  ON approval_requests(tenant_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_uuid 
  ON approval_requests(request_uuid);
CREATE INDEX IF NOT EXISTS idx_approval_requests_action_resource 
  ON approval_requests(tenant_id, branch_id, action, resource_type, resource_id);

-- 3. Email Verification Codes Table
CREATE TABLE IF NOT EXISTS approval_email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  approval_email TEXT NOT NULL,
  verification_code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_email_verifications 
  ON approval_email_verifications(tenant_id, branch_id, approval_email);
