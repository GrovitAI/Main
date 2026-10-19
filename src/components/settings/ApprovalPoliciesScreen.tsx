import React, { useState, useEffect } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { colors } from '@/lib/pos/brand';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { approvalService } from '@/lib/approval/approval.service';
import { ApprovalAction, BranchApprovalPolicies } from '@/lib/approval/approval.types';
import { DEFAULT_APPROVAL_POLICIES, APPROVAL_ACTION_META } from '@/lib/approval/approval-policy-defaults';
import { getErrorMessage } from '../../lib/pos/error-utils';
import { Card, Empty, LinkButton, Notice, PrimaryButton, Section, SelectRow, Toggle } from '@/components/kitchen/ui';

/** What each action is called on this page, in the till's words (task 272). */
const ACTION_LABELS: Record<ApprovalAction, string> = {
  [ApprovalAction.REPRINT_BILL]: 'Re-print a bill',
  [ApprovalAction.CANCEL_BILL]: 'Cancel a bill',
  [ApprovalAction.APPLY_DISCOUNT]: 'Give a discount',
  [ApprovalAction.COMPLIMENTARY_BILL]: 'Make a bill complimentary',
  [ApprovalAction.EDIT_UNPAID_BILL]: 'Change items on an unpaid bill',
  [ApprovalAction.REMOVE_SENT_ITEMS]: 'Remove items already sent to the kitchen',
  [ApprovalAction.VOID_PAYMENT]: 'Void a payment',
  [ApprovalAction.EDIT_CUSTOMER]: 'Change the customer on a bill',
  [ApprovalAction.REOPEN_BILL]: 'Reopen a paid bill',
  [ApprovalAction.DELETE_DRAFT_ORDER]: 'Discard a draft order',
};
const ACTIONS = Object.values(ApprovalAction);
const ENFORCED = ACTIONS.filter((a) => APPROVAL_ACTION_META[a].isEnforced);
const LATER = ACTIONS.filter((a) => !APPROVAL_ACTION_META[a].isEnforced);

/**
 * Approvals, in Settings A's style (task 272): one switch for the branch, then each till action
 * that needs the owner's code as its own switch. The till checks only the first group today; the
 * rest are kept for when it does. Save shows only after a change.
 */
export function ApprovalPoliciesScreen() {
  // Derived from the session store so a sign-out mid-render never throws.
  const session = useSessionStore((state) => state.session);
  const tenant_id = session?.tenantId ?? '';
  const branch_id = session?.branchId ?? '';
  const isOwnerOrAdmin = session?.role === 'owner' || session?.role === 'admin';
  const accessibleBranches = session?.accessibleBranches || [];

  const [selectedBranchId, setSelectedBranchId] = useState<string>(branch_id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [approvalEmail, setApprovalEmail] = useState('');
  const [masterEnabled, setMasterEnabled] = useState(true);
  const [policies, setPolicies] = useState<BranchApprovalPolicies>({ ...DEFAULT_APPROVAL_POLICIES });
  const [initialMasterEnabled, setInitialMasterEnabled] = useState(true);
  const [initialPolicies, setInitialPolicies] = useState<BranchApprovalPolicies>({ ...DEFAULT_APPROVAL_POLICIES });

  const changes = (masterEnabled !== initialMasterEnabled ? 1 : 0) + ACTIONS.filter((a) => policies[a] !== initialPolicies[a]).length;
  const isDefault = ACTIONS.every((a) => policies[a] === DEFAULT_APPROVAL_POLICIES[a]);

  useEffect(() => {
    void loadSettings(selectedBranchId);
  }, [tenant_id, selectedBranchId]);

  const loadSettings = async (targetBranchId: string) => {
    setLoading(true);
    setErrorMsg(null);
    setSavedMsg(null);
    try {
      const res = await approvalService.getSettings(targetBranchId);
      if (res.error) {
        setErrorMsg(res.error);
      } else if (res.data) {
        setApprovalEmail(res.data.approval_email || '');
        const enabledVal = res.data.enabled ?? true;
        setMasterEnabled(enabledVal);
        setInitialMasterEnabled(enabledVal);
        const loadedPolicies: BranchApprovalPolicies = { ...DEFAULT_APPROVAL_POLICIES, ...(res.data.policies || {}) };
        setPolicies(loadedPolicies);
        setInitialPolicies(loadedPolicies);
      }
    } catch (err) {
      setErrorMsg(getErrorMessage(err) || 'Could not load the approval settings.');
    } finally {
      setLoading(false);
    }
  };

  const setPolicy = (action: ApprovalAction, value: boolean) => {
    setSavedMsg(null);
    setPolicies((prev) => ({ ...prev, [action]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSavedMsg(null);
    try {
      const saveRes = await approvalService.saveSettings({ branchId: selectedBranchId, approvalEmail, enabled: masterEnabled, policies });
      if (saveRes.error) throw new Error(saveRes.error);
      setInitialMasterEnabled(masterEnabled);
      setInitialPolicies({ ...policies });
      setSavedMsg('Saved. The till uses these from its next approval check.');
    } catch (err) {
      setErrorMsg(getErrorMessage(err) || 'Could not save. Check the connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOwnerOrAdmin) {
    return <Card><Empty title="Only the owner or an admin can change approvals" body="Ask the owner if a till action should need their code." /></Card>;
  }
  if (loading) {
    return <View className="items-center py-10"><ActivityIndicator color={colors.primary} accessibilityLabel="Loading approvals" /></View>;
  }

  const branchName = accessibleBranches.find((b) => b.id === selectedBranchId)?.name ?? session?.branchName ?? 'This branch';
  const group = (actions: ApprovalAction[], later: boolean) => (
    <Card padded={false} style={{ overflow: 'hidden' }}>
      <View style={{ marginTop: -1 }}>
        {actions.map((a) => (
          <Toggle key={a} label={ACTION_LABELS[a]} hint={later ? 'The till does not ask for this one yet' : undefined}
            on={policies[a]} disabled={!masterEnabled || saving} onChange={(on) => setPolicy(a, on)} />
        ))}
      </View>
    </Card>
  );

  return (
    <View className="flex-1">
    <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: changes > 0 ? 200 : 140 }} keyboardShouldPersistTaps="handled">
      <Card padded={false} style={{ overflow: 'hidden' }}>
        <View style={{ marginTop: -1 }}>
          {accessibleBranches.length > 1 ? (
            <SelectRow label="Branch" value={selectedBranchId} options={accessibleBranches.map((b) => ({ value: b.id, label: b.name }))}
              onChange={(id) => { if (changes === 0) setSelectedBranchId(id); else setErrorMsg('Save or undo the changes first, then choose another branch.'); }} />
          ) : null}
          <Toggle label="Ask for the owner’s code" disabled={saving}
            hint={masterEnabled ? `At ${branchName}, the actions below need a code${approvalEmail ? ` sent to ${approvalEmail}` : ''}` : 'Every action below goes through without a code'}
            on={masterEnabled} onChange={(on) => { setSavedMsg(null); setMasterEnabled(on); }} />
        </View>
      </Card>
      {masterEnabled && !approvalEmail ? (
        <Notice tone="out" text={`${branchName} has no approval email yet, so the till cannot send a code. Add one under More › Branches.`} />
      ) : null}
      {errorMsg ? <Notice text={errorMsg} /> : null}
      {savedMsg ? <Notice tone="in" text={savedMsg} /> : null}

      <Section title="Needs the owner’s code">{group(ENFORCED, false)}</Section>
      {LATER.length ? (
        <Section title="Coming to the till later">
          <Text className="mb-2 text-xs font-semibold leading-[18px] text-text-secondary">Set these now; the till starts asking once it supports them.</Text>
          {group(LATER, true)}
        </Section>
      ) : null}

      {!isDefault ? <View className="mt-4 items-start"><LinkButton label="Back to the usual settings" onPress={() => { setSavedMsg(null); setPolicies({ ...DEFAULT_APPROVAL_POLICIES }); }} /></View> : null}
    </ScrollView>
    {/* Pinned while there is something to save, above the tab bar, so a change near the top never hides Save. */}
    {changes > 0 ? (
      <View className="absolute left-0 right-0 flex-row items-center gap-3 rounded-2xl border border-border-soft bg-surface-elevated px-3 py-2.5"
        style={{ bottom: 96, shadowColor: colors.primaryNavy, shadowOpacity: 0.12, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
        <LinkButton label="Undo" onPress={() => { setMasterEnabled(initialMasterEnabled); setPolicies({ ...initialPolicies }); setErrorMsg(null); }} />
        <View className="min-w-0 flex-1"><PrimaryButton label={`Save ${changes} ${changes === 1 ? 'change' : 'changes'}`} onPress={() => void handleSave()} loading={saving} /></View>
      </View>
    ) : null}
    </View>
  );
}
