import React, { useState } from 'react';
import { ReasonDialog } from './ReasonDialog';
import { ApprovalCodeDialog } from './ApprovalCodeDialog';
import { approvalService } from '@/lib/approval/approval.service';
import type { ApprovalAction, ResourceType } from '@/lib/approval/approval.types';

export interface ApprovalDialogState {
  visible: boolean;
  action: ApprovalAction;
  actionTitle: string;
  resourceType: ResourceType;
  resourceId: string;
  tenantId: string;
  branchId: string;
  requestedBy: string;
  restaurantName?: string;
  branchName?: string;
  onApproved: () => void | Promise<void>;
  onCancelled?: () => void;
}

interface ApprovalDialogContainerProps {
  state: ApprovalDialogState | null;
  onClose: () => void;
}

export function ApprovalDialogContainer({ state, onClose }: ApprovalDialogContainerProps) {
  const [step, setStep] = useState<'reason' | 'code' | null>('reason');
  const [isSubmittingReason, setIsSubmittingReason] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  if (!state || !state.visible) {
    return null;
  }

  const handleCloseAll = () => {
    setStep('reason');
    setIsSubmittingReason(false);
    setRequestId(null);
    setExpiresAt(null);
    if (state.onCancelled) {
      state.onCancelled();
    }
    onClose();
  };

  const handleReasonSubmit = async (reason: string) => {
    setIsSubmittingReason(true);
    const result = await approvalService.requestApproval({
      tenantId: state.tenantId,
      branchId: state.branchId,
      action: state.action,
      resourceType: state.resourceType,
      resourceId: state.resourceId,
      requestedBy: state.requestedBy,
      reason,
      restaurantName: state.restaurantName,
      branchName: state.branchName,
    });

    setIsSubmittingReason(false);

    if (result.error) {
      alert(`Approval Request Error: ${result.error}`);
      return;
    }

    if (!result.required || result.approved) {
      // Branch approval disabled or auto-approved
      onClose();
      void state.onApproved();
      return;
    }

    if (result.requestId) {
      setRequestId(result.requestId);
      setExpiresAt(result.expiresAt || null);
      setStep('code');
    }
  };

  const handleVerifyCode = async (code: string) => {
    if (!requestId) {
      return { success: false, error: 'Invalid approval request state.' };
    }

    const result = await approvalService.verifyApproval({
      requestId,
      approvalCode: code,
      tenantId: state.tenantId,
      branchId: state.branchId,
    });

    if (result.success) {
      // Mark as completed in background
      void approvalService.completeApproval({
        requestId,
        tenantId: state.tenantId,
        branchId: state.branchId,
      });

      onClose();
      void state.onApproved();
    }

    return result;
  };

  const handleResendCode = async () => {
    if (!requestId) {
      return { success: false, error: 'No active request.' };
    }

    return await approvalService.resendApproval({
      requestId,
      tenantId: state.tenantId,
      branchId: state.branchId,
      restaurantName: state.restaurantName,
      branchName: state.branchName,
    });
  };

  return (
    <>
      <ReasonDialog
        visible={step === 'reason'}
        actionTitle={state.actionTitle}
        onClose={handleCloseAll}
        onSubmit={handleReasonSubmit}
        isSubmitting={isSubmittingReason}
      />

      {requestId && (
        <ApprovalCodeDialog
          visible={step === 'code'}
          actionTitle={state.actionTitle}
          onClose={handleCloseAll}
          onVerify={handleVerifyCode}
          onResend={handleResendCode}
        />
      )}
    </>
  );
}
