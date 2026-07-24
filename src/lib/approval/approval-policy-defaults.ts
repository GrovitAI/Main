import { ApprovalAction, BranchApprovalPolicies } from './approval.types';

/**
 * Default approval policy toggles for all sensitive POS actions.
 * By default, all actions require approval if approval system is enabled.
 */
export const DEFAULT_APPROVAL_POLICIES: BranchApprovalPolicies = {
  [ApprovalAction.REPRINT_BILL]: true,
  [ApprovalAction.CANCEL_BILL]: true,
  [ApprovalAction.COMPLIMENTARY_BILL]: true,
  [ApprovalAction.APPLY_DISCOUNT]: true,
  [ApprovalAction.EDIT_UNPAID_BILL]: true,
  [ApprovalAction.REMOVE_SENT_ITEMS]: true,
  [ApprovalAction.VOID_PAYMENT]: true,
  [ApprovalAction.EDIT_CUSTOMER]: true,
  [ApprovalAction.REOPEN_BILL]: true,
  [ApprovalAction.DELETE_DRAFT_ORDER]: true,
};

/**
 * Human-readable labels and descriptions for each approval action.
 */
export const APPROVAL_ACTION_META: Record<ApprovalAction, { title: string; description: string }> = {
  [ApprovalAction.REPRINT_BILL]: {
    title: 'Require OTP for Bill Reprint',
    description: 'Require owner approval before re-printing a customer bill.',
  },
  [ApprovalAction.CANCEL_BILL]: {
    title: 'Require OTP for Bill Cancellation',
    description: 'Require owner approval before cancelling an open or issued bill.',
  },
  [ApprovalAction.COMPLIMENTARY_BILL]: {
    title: 'Require OTP for Complimentary Bills',
    description: 'Require owner approval before settling an order as complimentary ($0).',
  },
  [ApprovalAction.APPLY_DISCOUNT]: {
    title: 'Require OTP for Discounts',
    description: 'Require owner approval before applying custom fixed or percentage discounts.',
  },
  [ApprovalAction.EDIT_UNPAID_BILL]: {
    title: 'Require OTP for Editing Unpaid Bills',
    description: 'Require owner approval before modifying items on an unpaid bill.',
  },
  [ApprovalAction.REMOVE_SENT_ITEMS]: {
    title: 'Require OTP for Removing Sent Kitchen Items',
    description: 'Require owner approval before cancelling items already sent to the kitchen.',
  },
  [ApprovalAction.VOID_PAYMENT]: {
    title: 'Require OTP for Payment Void',
    description: 'Require owner approval before voiding or reversing a completed payment.',
  },
  [ApprovalAction.EDIT_CUSTOMER]: {
    title: 'Require OTP for Editing Customer Details',
    description: 'Require owner approval before changing customer profile on an existing bill.',
  },
  [ApprovalAction.REOPEN_BILL]: {
    title: 'Require OTP for Reopening Closed Bills',
    description: 'Require owner approval before reopening a settled/paid bill.',
  },
  [ApprovalAction.DELETE_DRAFT_ORDER]: {
    title: 'Require OTP for Deleting Draft Orders',
    description: 'Require owner approval before discarding an open draft order.',
  },
};
