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
import { getTenantContext } from '@/lib/pos/tenant-context';
import { useSessionStore } from '@/lib/pos/use-session-store';
import { getBranchApprovalSettings } from '@/lib/approval/approval-service';
import { ApprovalAction, BranchApprovalPolicies } from '@/lib/approval/approval.types';
import { DEFAULT_APPROVAL_POLICIES, APPROVAL_ACTION_META } from '@/lib/approval/approval-policy-defaults';

export function ApprovalPoliciesScreen() {
  const { tenant_id, branch_id, isOwnerOrAdmin } = getTenantContext();
  const session = useSessionStore((state) => state.session);
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
      const res = await getBranchApprovalSettings(tenant_id, targetBranchId);
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
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load approval settings.');
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
      const baseUrl = typeof window !== 'undefined' && window.location ? window.location.origin : '';
      const res = await fetch(`${baseUrl}/api/approval/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: tenant_id,
          branchId: selectedBranchId,
          approvalEmail,
          enabled: masterEnabled,
          policies,
          changedBy: useSessionStore.getState().session?.displayName || useSessionStore.getState().session?.userId || 'Owner',
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to save approval policies.');
      }

      setInitialMasterEnabled(masterEnabled);
      setInitialPolicies({ ...policies });
      setSuccessMsg('Approval policies saved successfully.');

      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving settings.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOwnerOrAdmin) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center p-6">
        <View className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md items-center shadow-sm">
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
        <ActivityIndicator size="large" color="#0284c7" />
        <Text className="text-xs font-semibold text-slate-500 mt-3">Loading Branch Approval Policies...</Text>
      </View>
    );
  }

  const actionList = Object.values(ApprovalAction);

  return (
    <ScrollView className="flex-1 bg-slate-50 p-4 md:p-6">
      <View className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <View className="flex-row items-center justify-between border-b border-slate-200 pb-4">
          <View className="flex-row items-center space-x-3">
            <View className="w-10 h-10 rounded-xl bg-blue-100 items-center justify-center">
              <ShieldCheck size={22} color="#0284c7" />
            </View>
            <View>
              <Text className="text-lg font-bold text-slate-900">Branch Approval Policies</Text>
              <Text className="text-xs text-slate-500">Configure which sensitive POS actions require owner OTP verification</Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View className="flex-row items-center space-x-2">
            <Pressable
              onPress={handleResetToDefaults}
              className="flex-row items-center space-x-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white active:bg-slate-100"
            >
              <RotateCcw size={14} color="#475569" />
              <Text className="text-xs font-semibold text-slate-700">Reset Defaults</Text>
            </Pressable>

            <Pressable
              disabled={!hasUnsavedChanges || saving}
              onPress={handleSave}
              className={`flex-row items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 active:bg-blue-700 ${
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
          <View className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex-row items-center justify-between">
            <View>
              <Text className="text-xs font-bold text-slate-800">Target Branch</Text>
              <Text className="text-[11px] text-slate-500">Select which branch to configure approval policies for</Text>
            </View>
            <View className="flex-row items-center space-x-2">
              {accessibleBranches.map((b) => {
                const isSelected = b.id === selectedBranchId;
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => setSelectedBranchId(b.id)}
                    className={`px-3 py-1.5 rounded-xl border ${
                      isSelected
                        ? 'bg-blue-50 border-blue-600'
                        : 'bg-slate-50 border-slate-200 active:bg-slate-100'
                    }`}
                  >
                    <Text className={`text-xs font-bold ${isSelected ? 'text-blue-700' : 'text-slate-600'}`}>
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
          <View className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex-row items-center space-x-2">
            <CheckCircle2 size={16} color="#059669" />
            <Text className="text-xs font-semibold text-emerald-800 flex-1">{successMsg}</Text>
          </View>
        )}

        {errorMsg && (
          <View className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 flex-row items-center space-x-2">
            <AlertTriangle size={16} color="#e11d48" />
            <Text className="text-xs font-semibold text-rose-800 flex-1">{errorMsg}</Text>
          </View>
        )}

        {/* Unsaved Changes Banner */}
        {hasUnsavedChanges && (
          <View className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex-row items-center justify-between">
            <View className="flex-row items-center space-x-2 flex-1">
              <AlertTriangle size={16} color="#d97706" />
              <Text className="text-xs font-bold text-amber-900">You have unsaved policy changes.</Text>
            </View>
            <Pressable onPress={handleSave} className="bg-amber-600 px-3 py-1.5 rounded-lg active:bg-amber-700">
              <Text className="text-[11px] font-bold text-white">Save Now</Text>
            </Pressable>
          </View>
        )}

        {/* Master Switch Card */}
        <View className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-4">
              <Text className="text-sm font-bold text-slate-900">Enable Approval System</Text>
              <Text className="text-xs text-slate-500 mt-0.5">
                Master switch for branch approvals. Turning this off bypasses OTP verification for ALL actions.
              </Text>
            </View>
            <Switch
              value={masterEnabled}
              onValueChange={setMasterEnabled}
              trackColor={{ false: '#cbd5e1', true: '#2563eb' }}
              thumbColor={masterEnabled ? '#ffffff' : '#f8fafc'}
            />
          </View>

          {!masterEnabled && (
            <View className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <Text className="text-xs text-amber-800 font-medium">
                ⚠️ Approval System is currently disabled. Sensitive POS actions will execute immediately without requiring owner OTP verification.
              </Text>
            </View>
          )}
        </View>

        {/* Individual Action Toggles Section */}
        <View className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Protected POS Actions</Text>

          <View className="divide-y divide-slate-100">
            {actionList.map((action) => {
              const meta = APPROVAL_ACTION_META[action];
              const isChecked = policies[action] ?? true;

              return (
                <View key={action} className="py-3.5 flex-row items-center justify-between space-x-4">
                  <View className="flex-1 pr-4">
                    <View className="flex-row items-center space-x-2">
                      <Text className="text-xs font-bold text-slate-800">{meta.title}</Text>
                      {meta.isEnforced ? (
                        <View className="bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <Text className="text-[10px] font-bold text-emerald-700">ACTIVE</Text>
                        </View>
                      ) : (
                        <View className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          <Text className="text-[10px] font-bold text-slate-500">UPCOMING</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-[11px] text-slate-500 mt-0.5">{meta.description}</Text>
                  </View>
                  <Switch
                    disabled={!masterEnabled}
                    value={masterEnabled && isChecked}
                    onValueChange={(val) => handleTogglePolicy(action, val)}
                    trackColor={{ false: '#cbd5e1', true: '#2563eb' }}
                    thumbColor={masterEnabled && isChecked ? '#ffffff' : '#f8fafc'}
                  />
                </View>
              );
            })}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
