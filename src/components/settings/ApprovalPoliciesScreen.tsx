import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Switch,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { ShieldCheck, Save, RotateCcw, AlertTriangle, CheckCircle2, Lock } from 'lucide-react-native';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { approvalService } from '@/lib/approval/approval.service';
import { ApprovalAction, BranchApprovalPolicies } from '@/lib/approval/approval.types';
import { DEFAULT_APPROVAL_POLICIES, APPROVAL_ACTION_META } from '@/lib/approval/approval-policy-defaults';
import { getErrorMessage } from '../../lib/pos/error-utils';

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
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [approvalEmail, setApprovalEmail] = useState('');
  const [masterEnabled, setMasterEnabled] = useState(true);
  const [policies, setPolicies] = useState<BranchApprovalPolicies>({ ...DEFAULT_APPROVAL_POLICIES });

  const [initialMasterEnabled, setInitialMasterEnabled] = useState(true);
  const [initialPolicies, setInitialPolicies] = useState<BranchApprovalPolicies>({ ...DEFAULT_APPROVAL_POLICIES });

  const hasUnsavedChanges =
    masterEnabled !== initialMasterEnabled ||
    JSON.stringify(policies) !== JSON.stringify(initialPolicies);

  useEffect(() => {
    loadSettings(selectedBranchId);
  }, [tenant_id, selectedBranchId]);

  const loadSettings = async (targetBranchId: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await approvalService.getSettings(targetBranchId);
      if (res.error) {
        setErrorMsg(res.error);
      } else if (res.data) {
        setApprovalEmail(res.data.approval_email || '');
        const enabledVal = res.data.enabled ?? true;
        setMasterEnabled(enabledVal);
        setInitialMasterEnabled(enabledVal);

        const loadedPolicies: BranchApprovalPolicies = {
          ...DEFAULT_APPROVAL_POLICIES,
          ...(res.data.policies || {}),
        };
        setPolicies(loadedPolicies);
        setInitialPolicies(loadedPolicies);
      }
    } catch (err) {
      setErrorMsg(getErrorMessage(err) || 'Failed to load approval settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePolicy = (action: ApprovalAction, value: boolean) => {
    setPolicies((prev) => ({
      ...prev,
      [action]: value,
    }));
  };

  const handleResetToDefaults = () => {
    setPolicies({ ...DEFAULT_APPROVAL_POLICIES });
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const saveRes = await approvalService.saveSettings({
        branchId: selectedBranchId,
        approvalEmail,
        enabled: masterEnabled,
        policies,
      });
      if (saveRes.error) {
        throw new Error(saveRes.error);
      }

      setInitialMasterEnabled(masterEnabled);
      setInitialPolicies({ ...policies });
      setSuccessMsg('Approval policies saved successfully.');

      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setErrorMsg(getErrorMessage(err) || 'Error saving settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOwnerOrAdmin) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center p-6">
        <View className="w-full bg-white border border-slate-200 rounded-2xl p-8 max-w-md items-center shadow-sm">
          <View className="w-12 h-12 rounded-full bg-amber-100 items-center justify-center mb-4">
            <Lock size={24} color="#d97706" />
          </View>
          <Text className="text-base font-bold text-slate-900 mb-1">Access Restricted</Text>
          <Text className="text-xs text-slate-500 text-center leading-relaxed">
            Only users with the Branch Owner or Admin role can view or modify branch approval policies.
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center p-6">
        <ActivityIndicator size="large" color="#0066b2" />
        <Text className="text-xs font-semibold text-slate-500 mt-3">Loading Branch Approval Policies...</Text>
      </View>
    );
  }

  const actionList = Object.values(ApprovalAction);

  return (
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 140, gap: 16 }}
    >
      {/* Header Info & Action Buttons Card */}
      <View className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <View className="flex-row items-center gap-3 mb-3">
          <View className="w-10 h-10 rounded-xl bg-blue-50 items-center justify-center">
            <ShieldCheck size={22} color="#0066b2" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-slate-900">Branch Approval Policies</Text>
            <Text className="text-xs text-slate-500 mt-0.5">
              Require owner OTP verification for sensitive cashier actions
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="flex-row items-center gap-2 pt-2 border-t border-slate-100">
          <Pressable
            onPress={handleResetToDefaults}
            className="flex-1 flex-row items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 active:bg-slate-100 min-h-[42px]"
          >
            <RotateCcw size={14} color="#475569" />
            <Text className="text-xs font-bold text-slate-700">Reset Defaults</Text>
          </Pressable>

          <Pressable
            disabled={!hasUnsavedChanges || saving}
            onPress={handleSave}
            className={`flex-1 flex-row items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#0066b2] active:bg-[#004b87] min-h-[42px] shadow-sm ${
              !hasUnsavedChanges || saving ? 'opacity-50' : 'opacity-100'
            }`}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Save size={14} color="#ffffff" />
                <Text className="text-xs font-bold text-white">Save Changes</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>

      {/* Multi-Branch Selector for Owner Role */}
      {accessibleBranches.length > 1 && (
        <View className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <Text className="text-xs font-bold text-slate-800 mb-1">Target Branch</Text>
          <Text className="text-[11px] text-slate-500 mb-3">Select branch to configure approval policies</Text>
          <View className="flex-row flex-wrap gap-2">
            {accessibleBranches.map((b) => {
              const isSelected = b.id === selectedBranchId;
              return (
                <Pressable
                  key={b.id}
                  onPress={() => setSelectedBranchId(b.id)}
                  className={`px-3.5 py-2 rounded-xl border min-h-[38px] items-center justify-center ${
                    isSelected
                      ? 'bg-blue-50 border-[#0066b2]'
                      : 'bg-slate-50 border-slate-200 active:bg-slate-100'
                  }`}
                >
                  <Text className={`text-xs font-bold ${isSelected ? 'text-[#0066b2]' : 'text-slate-600'}`}>
                    {b.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {/* Success / Error Messages */}
      {successMsg && (
        <View className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex-row items-center gap-2">
          <CheckCircle2 size={16} color="#059669" />
          <Text className="text-xs font-semibold text-emerald-800 flex-1">{successMsg}</Text>
        </View>
      )}

      {errorMsg && (
        <View className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex-row items-center gap-2">
          <AlertTriangle size={16} color="#e11d48" />
          <Text className="text-xs font-semibold text-rose-800 flex-1">{errorMsg}</Text>
        </View>
      )}

      {/* Unsaved Changes Banner */}
      {hasUnsavedChanges && (
        <View className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2 flex-1 pr-2">
            <AlertTriangle size={16} color="#d97706" />
            <Text className="text-xs font-bold text-amber-900">You have unsaved policy changes.</Text>
          </View>
          <Pressable onPress={handleSave} className="bg-amber-600 px-3.5 py-1.5 rounded-lg active:bg-amber-700">
            <Text className="text-xs font-bold text-white">Save Now</Text>
          </Pressable>
        </View>
      )}

      {/* Master Switch Card */}
      <View className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text className="text-sm font-bold text-slate-900">Enable Approval System</Text>
            <Text className="text-xs text-slate-500 mt-0.5">
              Master switch for branch approvals. Turning this off bypasses OTP verification for ALL actions.
            </Text>
          </View>
          <Switch
            value={masterEnabled}
            onValueChange={setMasterEnabled}
            trackColor={{ false: '#cbd5e1', true: '#0066b2' }}
            thumbColor={masterEnabled ? '#ffffff' : '#f8fafc'}
          />
        </View>

        {!masterEnabled && (
          <View className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <Text className="text-xs text-amber-800 font-medium leading-relaxed">
              ⚠️ Approval System is currently disabled. Sensitive POS actions will execute immediately without requiring owner OTP verification.
            </Text>
          </View>
        )}
      </View>

      {/* Individual Action Toggles Section */}
      <View className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Protected POS Actions
        </Text>

        <View>
          {actionList.map((action, idx) => {
            const meta = APPROVAL_ACTION_META[action];
            const isChecked = policies[action] ?? true;
            const isLast = idx === actionList.length - 1;

            return (
              <View
                key={action}
                className={`py-3.5 ${!isLast ? 'border-b border-slate-100' : ''}`}
              >
                <View className="flex-row items-center justify-between mb-1">
                  <View className="flex-row items-center gap-2 flex-1 pr-3">
                    <Text className="text-xs font-bold text-slate-800">{meta.title}</Text>
                    {meta.isEnforced ? (
                      <View className="bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <Text className="text-[9px] font-bold text-emerald-700">ACTIVE</Text>
                      </View>
                    ) : (
                      <View className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        <Text className="text-[9px] font-bold text-slate-500">UPCOMING</Text>
                      </View>
                    )}
                  </View>
                  <Switch
                    disabled={!masterEnabled}
                    value={masterEnabled && isChecked}
                    onValueChange={(val) => handleTogglePolicy(action, val)}
                    trackColor={{ false: '#cbd5e1', true: '#0066b2' }}
                    thumbColor={masterEnabled && isChecked ? '#ffffff' : '#f8fafc'}
                  />
                </View>
                <Text className="text-[11px] text-slate-500 leading-relaxed pr-8">
                  {meta.description}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}
