export enum ApprovalAction {
  REPRINT_BILL = 'REPRINT_BILL',
  CANCEL_BILL = 'CANCEL_BILL',
  APPLY_DISCOUNT = 'APPLY_DISCOUNT',
  COMPLIMENTARY_BILL = 'COMPLIMENTARY_BILL',
}

export type ResourceType = 'bill' | 'order' | 'settlement' | string;

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

export interface BranchApprovalSettings {
  id?: string;
  tenant_id: string;
  branch_id: string;
  approval_email: string;
  approval_email_verified?: boolean;
  approval_email_verified_at?: string | null;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ApprovalRequestRecord {
  id: string;
  tenant_id: string;
  branch_id: string;
  request_uuid: string;
  action: ApprovalAction;
  resource_type: ResourceType;
  resource_id: string;
  requested_by: string;
  cashier_id?: string | null;
  cashier_name?: string | null;
  branch_name?: string | null;
  approval_email?: string | null;
  approved_by_email?: string | null;
  reason: string;
  approval_code_hash: string;
  attempts: number;
  expires_at: string;
  verified_at?: string | null;
  code_verified_at?: string | null;
  completed_at?: string | null;
  status: ApprovalStatus;
  created_at: string;
  updated_at?: string;
}

export interface RequestApprovalApiInput {
  tenantId: string;
  branchId: string;
  action: ApprovalAction;
  resourceType: ResourceType;
  resourceId: string;
  requestedBy: string;
  reason: string;
  restaurantName?: string;
  branchName?: string;
}

export interface RequestApprovalApiResponse {
  required: boolean;
  approved?: boolean;
  requestId?: string;
  expiresAt?: string;
  error?: string;
}

export interface VerifyApprovalApiInput {
  requestId: string;
  approvalCode: string;
  tenantId: string;
  branchId: string;
}

export interface VerifyApprovalApiResponse {
  success: boolean;
  error?: string;
  attemptsRemaining?: number;
  isExpired?: boolean;
}

export interface ResendApprovalApiInput {
  requestId: string;
  tenantId: string;
  branchId: string;
  restaurantName?: string;
  branchName?: string;
}

export interface ResendApprovalApiResponse {
  success: boolean;
  expiresAt?: string;
  error?: string;
}

export interface CompleteApprovalApiInput {
  requestId: string;
  tenantId: string;
  branchId: string;
}

export interface CompleteApprovalApiResponse {
  success: boolean;
  error?: string;
}
