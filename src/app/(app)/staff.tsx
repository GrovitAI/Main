import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import {
  Users,
  Plus,
  Pencil,
  X,
  Check,
  Mail,
  Lock,
  User,
  Building2,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react-native';
import { useSessionStore } from '@/lib/pos/use-session-store';
import {
  fetchStaff,
  createStaff,
  updateStaff,
  deactivateStaff,
  type StaffMember,
  type CreateStaffPayload,
  type UpdateStaffPayload,
} from '@/lib/pos/staff-service';
import { fetchBranches, type Branch } from '@/lib/pos/branch-service';
import type { UserRole } from '@/lib/pos/session-context';

// ─── Types ────────────────────────────────────────────────────────────────────

type FormMode = 'new' | 'edit';

type FormState = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  branch_id: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  email: '',
  password: '',
  role: 'cashier',
  branch_id: '',
};

const ROLES: { value: UserRole; label: string; description: string }[] = [
  { value: 'owner',   label: 'Owner',   description: 'Full access, all branches' },
  { value: 'admin',   label: 'Admin',   description: 'Full access, selected branches' },
  { value: 'manager', label: 'Manager', description: 'POS + reports for own branch' },
  { value: 'cashier', label: 'Cashier', description: 'POS + orders for own branch' },
  { value: 'kitchen', label: 'Kitchen', description: 'Kitchen display only' },
];

const ROLE_COLORS: Record<UserRole, string> = {
  owner: '#7C3AED',
  admin: '#0066b2',
  manager: '#0891b2',
  cashier: '#16a34a',
  kitchen: '#ea580c',
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function StaffScreen() {
  const { session } = useSessionStore();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<FormMode>('new');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const canManage = session?.role === 'owner' || session?.role === 'admin';

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [staffResult, branchResult] = await Promise.all([
      fetchStaff(),
      fetchBranches(),
    ]);
    if (staffResult.error) setError(staffResult.error);
    else setStaff(staffResult.data);
    if (!branchResult.error) setBranches(branchResult.data.filter((b) => b.is_active));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Form helpers ────────────────────────────────────────────────────────────

  const openNew = () => {
    setMode('new');
    setEditingId(null);
    setForm({ ...EMPTY_FORM, branch_id: branches[0]?.id ?? '' });
    setFormError(null);
    setShowPassword(false);
    setShowForm(true);
  };

  const openEdit = (s: StaffMember) => {
    setMode('edit');
    setEditingId(s.id);
    setForm({ name: s.name, email: s.email, password: '', role: s.role, branch_id: s.branch_id });
    setFormError(null);
    setShowPassword(false);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setFormError(null);
  };

  const validate = (): boolean => {
    if (!form.name.trim()) { setFormError('Name is required.'); return false; }
    if (mode === 'new' && !form.email.trim()) { setFormError('Email is required.'); return false; }
    if (mode === 'new' && form.password.length < 6) { setFormError('Password must be at least 6 characters.'); return false; }
    if (!form.branch_id) { setFormError('Please select a branch.'); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setFormError(null);

    let err: string | null = null;

    if (mode === 'new') {
      const payload: CreateStaffPayload = {
        name: form.name,
        email: form.email,
        password: form.password,
        role: form.role,
        branch_id: form.branch_id,
      };
      const result = await createStaff(payload);
      err = result.error;
    } else {
      const payload: UpdateStaffPayload = {
        name: form.name,
        role: form.role,
        branch_id: form.branch_id,
      };
      const result = await updateStaff(editingId!, payload);
      err = result.error;
    }

    setSaving(false);

    if (err) {
      setFormError(err);
    } else {
      closeForm();
      void load();
    }
  };

  const handleDeactivate = (s: StaffMember) => {
    Alert.alert(
      'Deactivate Staff',
      `Are you sure you want to deactivate "${s.name}"? They will not be able to log in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            const { error: err } = await deactivateStaff(s.id);
            if (err) Alert.alert('Error', err);
            else void load();
          },
        },
      ]
    );
  };

  const handleReactivate = async (s: StaffMember) => {
    const { error: err } = await updateStaff(s.id, { status: 'active' });
    if (err) Alert.alert('Error', err);
    else void load();
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0066b2" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryBtn} onPress={load}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const activeStaff = staff.filter((s) => s.status === 'active');
  const inactiveStaff = staff.filter((s) => s.status !== 'active');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Users size={20} color="#0066b2" />
          <Text style={styles.headerTitle}>Staff Management</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{activeStaff.length} active</Text>
          </View>
        </View>
        {canManage && !showForm && (
          <Pressable style={styles.addBtn} onPress={openNew} id="btn-add-staff">
            <Plus size={16} color="#fff" />
            <Text style={styles.addBtnText}>Add Staff</Text>
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ── Form ── */}
        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>{mode === 'new' ? 'New Staff Member' : 'Edit Staff'}</Text>

            {formError && (
              <View style={styles.formErrorBox}>
                <Text style={styles.formErrorText}>{formError}</Text>
              </View>
            )}

            {/* Name */}
            <FieldRow label="Full Name *" icon={<User size={14} color="#64748b" />}>
              <TextInput
                style={styles.fieldText}
                value={form.name}
                onChangeText={(v) => setForm({ ...form, name: v })}
                placeholder="e.g. Kumar Arun"
                placeholderTextColor="#94a3b8"
              />
            </FieldRow>

            {/* Email (only for new) */}
            {mode === 'new' && (
              <FieldRow label="Email *" icon={<Mail size={14} color="#64748b" />}>
                <TextInput
                  style={styles.fieldText}
                  value={form.email}
                  onChangeText={(v) => setForm({ ...form, email: v.toLowerCase() })}
                  placeholder="kumar@lelabn.com"
                  placeholderTextColor="#94a3b8"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </FieldRow>
            )}

            {/* Password (only for new) */}
            {mode === 'new' && (
              <FieldRow label="Password *" icon={<Lock size={14} color="#64748b" />}>
                <TextInput
                  style={[styles.fieldText, { flex: 1 }]}
                  value={form.password}
                  onChangeText={(v) => setForm({ ...form, password: v })}
                  placeholder="Min 6 characters"
                  placeholderTextColor="#94a3b8"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <Pressable onPress={() => setShowPassword(!showPassword)}>
                  {showPassword
                    ? <EyeOff size={16} color="#94a3b8" />
                    : <Eye size={16} color="#94a3b8" />
                  }
                </Pressable>
              </FieldRow>
            )}

            {/* Role Picker */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Role *</Text>
              <View style={styles.rolePicker}>
                {ROLES.map((r) => (
                  <Pressable
                    key={r.value}
                    style={[
                      styles.roleOption,
                      form.role === r.value && { borderColor: ROLE_COLORS[r.value], backgroundColor: `${ROLE_COLORS[r.value]}12` },
                    ]}
                    onPress={() => setForm({ ...form, role: r.value })}
                    id={`role-option-${r.value}`}
                  >
                    <ShieldCheck size={14} color={form.role === r.value ? ROLE_COLORS[r.value] : '#94a3b8'} />
                    <View>
                      <Text style={[styles.roleLabel, form.role === r.value && { color: ROLE_COLORS[r.value] }]}>
                        {r.label}
                      </Text>
                      <Text style={styles.roleDesc} numberOfLines={1}>{r.description}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Branch Picker */}
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Branch *</Text>
              {branches.length === 0 ? (
                <Text style={styles.noBranchWarning}>No active branches found. Create a branch first.</Text>
              ) : (
                <View style={styles.branchPicker}>
                  {branches.map((b) => (
                    <Pressable
                      key={b.id}
                      style={[
                        styles.branchOption,
                        form.branch_id === b.id && styles.branchOptionActive,
                      ]}
                      onPress={() => setForm({ ...form, branch_id: b.id })}
                      id={`branch-option-${b.id}`}
                    >
                      <Building2 size={13} color={form.branch_id === b.id ? '#0066b2' : '#64748b'} />
                      <Text style={[
                        styles.branchOptionText,
                        form.branch_id === b.id && styles.branchOptionTextActive,
                      ]}>
                        {b.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Actions */}
            <View style={styles.formActions}>
              <Pressable style={styles.cancelBtn} onPress={closeForm} id="btn-cancel-staff">
                <X size={16} color="#64748b" />
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                id="btn-save-staff"
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Check size={16} color="#fff" />
                )}
                <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Active Staff ── */}
        {activeStaff.length === 0 && !showForm ? (
          <View style={styles.emptyState}>
            <Users size={40} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>No staff members yet</Text>
            <Text style={styles.emptySubtitle}>Add your first staff member to get started.</Text>
          </View>
        ) : (
          <>
            {activeStaff.map((s) => (
              <StaffCard
                key={s.id}
                member={s}
                canManage={canManage}
                onEdit={() => openEdit(s)}
                onDeactivate={() => handleDeactivate(s)}
              />
            ))}

            {inactiveStaff.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Inactive</Text>
                {inactiveStaff.map((s) => (
                  <StaffCard
                    key={s.id}
                    member={s}
                    canManage={canManage}
                    onEdit={() => openEdit(s)}
                    onReactivate={() => handleReactivate(s)}
                    inactive
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── StaffCard ────────────────────────────────────────────────────────────────

function StaffCard({
  member,
  canManage,
  onEdit,
  onDeactivate,
  onReactivate,
  inactive,
}: {
  member: StaffMember;
  canManage: boolean;
  onEdit: () => void;
  onDeactivate?: () => void;
  onReactivate?: () => void;
  inactive?: boolean;
}) {
  const roleColor = ROLE_COLORS[member.role] ?? '#64748b';

  return (
    <View style={[styles.staffCard, inactive && styles.staffCardInactive]}>
      <View style={[styles.staffAvatar, { backgroundColor: `${roleColor}18` }]}>
        <User size={18} color={roleColor} />
      </View>

      <View style={styles.staffInfo}>
        <Text style={styles.staffName}>{member.name}</Text>
        <Text style={styles.staffEmail}>{member.email}</Text>
        <View style={styles.staffMeta}>
          <View style={[styles.roleBadge, { backgroundColor: `${roleColor}18` }]}>
            <Text style={[styles.roleBadgeText, { color: roleColor }]}>
              {member.role.toUpperCase()}
            </Text>
          </View>
          <View style={styles.branchBadge}>
            <Building2 size={10} color="#64748b" />
            <Text style={styles.branchBadgeText}>{member.branch_name}</Text>
          </View>
        </View>
      </View>

      {canManage && (
        <View style={styles.staffActions}>
          {!inactive && (
            <Pressable style={styles.iconBtn} onPress={onEdit} id={`btn-edit-staff-${member.id}`}>
              <Pencil size={14} color="#0066b2" />
            </Pressable>
          )}
          {inactive
            ? (
              <Pressable style={[styles.iconBtn, styles.activateBtn]} onPress={onReactivate} id={`btn-reactivate-${member.id}`}>
                <Check size={14} color="#16a34a" />
              </Pressable>
            )
            : (
              <Pressable style={[styles.iconBtn, styles.deactivateBtn]} onPress={onDeactivate} id={`btn-deactivate-${member.id}`}>
                <X size={14} color="#ef4444" />
              </Pressable>
            )
          }
        </View>
      )}
    </View>
  );
}

// ─── FieldRow helper ──────────────────────────────────────────────────────────

function FieldRow({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldInput}>
        <View style={styles.fieldIcon}>{icon}</View>
        {children}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 14, paddingBottom: 40 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  countBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countText: { fontSize: 12, fontWeight: '700', color: '#1E40AF' },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0066b2',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  errorText: { fontSize: 14, color: '#ef4444', textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#0066b2', borderRadius: 8 },
  retryBtnText: { color: '#fff', fontWeight: '700' },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
  },

  // ── Form ──
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    shadowColor: '#0066b2',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  formTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  formErrorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  formErrorText: { fontSize: 13, color: '#DC2626', fontWeight: '500' },

  field: { gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#475569', letterSpacing: 0.3 },
  fieldInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    height: 44,
    paddingHorizontal: 12,
    gap: 8,
  },
  fieldIcon: { width: 20, alignItems: 'center' },
  fieldText: { flex: 1, fontSize: 14, color: '#0F172A' },

  rolePicker: { gap: 6 },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  roleLabel: { fontSize: 13, fontWeight: '700', color: '#334155' },
  roleDesc: { fontSize: 11, color: '#94A3B8', marginTop: 1 },

  branchPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  branchOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  branchOptionActive: {
    borderColor: '#0066b2',
    backgroundColor: '#EFF6FF',
  },
  branchOptionText: { fontSize: 13, fontWeight: '600', color: '#475569' },
  branchOptionTextActive: { color: '#0066b2' },
  noBranchWarning: { fontSize: 13, color: '#ef4444', fontStyle: 'italic' },

  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#0066b2',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // ── Staff Card ──
  staffCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 12,
  },
  staffCardInactive: { opacity: 0.5 },
  staffAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffInfo: { flex: 1, gap: 3 },
  staffName: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  staffEmail: { fontSize: 12, color: '#64748b' },
  staffMeta: { flexDirection: 'row', gap: 6, marginTop: 2 },
  roleBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  roleBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  branchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  branchBadgeText: { fontSize: 10, fontWeight: '600', color: '#64748b' },

  staffActions: { gap: 6 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activateBtn: { borderColor: '#DCFCE7', backgroundColor: '#F0FDF4' },
  deactivateBtn: { borderColor: '#FEE2E2', backgroundColor: '#FFF5F5' },

  emptyState: { alignItems: 'center', gap: 10, paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#94A3B8' },
  emptySubtitle: { fontSize: 13, color: '#CBD5E1', textAlign: 'center' },
});
