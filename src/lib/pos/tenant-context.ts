export const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
export const BRANCH_ID = 'bbbbbbbb-0000-0000-0000-000000000001';

export type TenantContext = {
  tenant_id: string;
  branch_id: string;
};

export function getTenantContext(): TenantContext {
  return {
    tenant_id: TENANT_ID,
    branch_id: BRANCH_ID,
  };
}
