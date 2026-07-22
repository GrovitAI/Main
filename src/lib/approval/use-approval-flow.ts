import { useContext } from 'react';
import { ApprovalContext, ApprovalContextType, TriggerApprovalInput } from './ApprovalContext';

export type { TriggerApprovalInput };

export function useApprovalFlow(): ApprovalContextType {
  const context = useContext(ApprovalContext);

  if (!context) {
    throw new Error('useApprovalFlow must be used within an <ApprovalProvider>');
  }

  return context;
}
