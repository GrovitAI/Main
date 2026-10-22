import React, { createContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { ApprovalDialogContainer, ApprovalDialogState } from '@/components/approval/ApprovalDialogContainer';
import { useSessionStore } from '@/lib/pos/use-session-store';
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
  // Task 291: only the session, so other session-store changes do not redraw the app.
  const session = useSessionStore((s) => s.session);
  const [approvalDialogState, setApprovalDialogState] = useState<ApprovalDialogState | null>(null);

  const requestApproval = useCallback(
    (input: TriggerApprovalInput) => {
      const cashierName = session?.displayName || 'Cashier';
      const branchName = session?.branchName || 'Anna Nagar';
      if (!session) {
        console.error('[ApprovalProvider] requestApproval called without an active session.');
        return;
      }
      const tenantId = session.tenantId;
      const branchId = session.branchId;

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

  // Task 291: the same value until a function changes. A new object on every navigation redrew
  // every screen that asks for approvals, the POS ten times on each tab change.
  const value = useMemo(() => ({ requestApproval, closeApprovalDialog }), [requestApproval, closeApprovalDialog]);

  return (
    <ApprovalContext.Provider value={value}>
      {children}
      <ApprovalDialogContainer state={approvalDialogState} onClose={closeApprovalDialog} />
    </ApprovalContext.Provider>
  );
}
