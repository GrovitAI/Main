import React, { createContext, useState, useCallback, ReactNode } from 'react';
import { ApprovalDialogContainer, ApprovalDialogState } from '@/components/approval/ApprovalDialogContainer';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { TENANT_ID, BRANCH_ID } from '@/lib/pos/tenant-context';
import { approvalService } from './approval.service';
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
    async (input: TriggerApprovalInput) => {
      const cashierName = session?.displayName || 'Cashier';
      const branchName = session?.branchName || 'Anna Nagar';
      const tenantId = session?.tenantId || TENANT_ID;
      const branchId = session?.branchId || BRANCH_ID;

      // 1. Pre-check if approval is required for this action/branch before opening dialog
      try {
        const checkResult = await approvalService.checkPolicyRequired(tenantId, branchId, input.action);
        if (!checkResult.required) {
          // Approval system disabled or specific policy toggle OFF -> auto-pass immediately!
          void input.onApproved();
          return;
        }
      } catch (err) {
        console.warn('[ApprovalContext] Policy pre-check exception, falling back to dialog:', err);
      }

      setApprovalDialogState({
        visible: true,
        action: input.action,
        actionTitle: input.actionTitle,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        tenantId,
        branchId,
        requestedBy: cashierName,
        restaurantName: session?.tenantName || 'Le Laban',
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
