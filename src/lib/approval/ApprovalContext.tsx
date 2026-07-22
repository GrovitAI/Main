import React, { createContext, useState, useCallback, ReactNode } from 'react';
import { ApprovalDialogContainer, ApprovalDialogState } from '@/components/approval/ApprovalDialogContainer';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { TENANT_ID, BRANCH_ID } from '@/lib/pos/tenant-context';
import type { ApprovalAction, ResourceType } from './approval.types';

export interface TriggerApprovalInput {
  action: ApprovalAction;
  actionTitle: string;
  resourceType: ResourceType;
  resourceId: string;
  onApproved: () => void | Promise<void>;
  onCancelled?: () => void;
}

export interface ApprovalContextType {
  requestApproval: (input: TriggerApprovalInput) => void;
  closeApprovalDialog: () => void;
}

export const ApprovalContext = createContext<ApprovalContextType | null>(null);

export interface ApprovalProviderProps {
  children: ReactNode;
}

export function ApprovalProvider({ children }: ApprovalProviderProps) {
  const { session } = useSessionStore();
  const [approvalDialogState, setApprovalDialogState] = useState<ApprovalDialogState | null>(null);

  const requestApproval = useCallback(
    (input: TriggerApprovalInput) => {
      const cashierName = session?.displayName || 'Cashier';
      const branchName = session?.branchName || 'Anna Nagar';

      setApprovalDialogState({
        visible: true,
        action: input.action,
        actionTitle: input.actionTitle,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        requestedBy: cashierName,
        restaurantName: 'Le Laban',
        branchName,
        onApproved: input.onApproved,
        onCancelled: input.onCancelled,
      });
    },
    [session]
  );

  const closeApprovalDialog = useCallback(() => {
    setApprovalDialogState(null);
  }, []);

  return (
    <ApprovalContext.Provider value={{ requestApproval, closeApprovalDialog }}>
      {children}
      <ApprovalDialogContainer state={approvalDialogState} onClose={closeApprovalDialog} />
    </ApprovalContext.Provider>
  );
}
