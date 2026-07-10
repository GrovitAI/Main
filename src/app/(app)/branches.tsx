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
  Building2,
  Plus,
  Pencil,
  X,
  Check,
  ToggleLeft,
  ToggleRight,
  MapPin,
  Phone,
  Tag,
  Hash,
  FileText,
} from 'lucide-react-native';
import { useSessionStore } from '@/lib/pos/use-session-store';
import {
  fetchBranches,
  createBranch,
  updateBranch,
  type Branch,
  type CreateBranchPayload,
} from '@/lib/pos/branch-service';

// ─── Form State ──────────────────────────────────────────────────────────────

type FormState = {
  name: string;
  code: string;
  address: string;
  phone: string;
  gstin: string;
  invoice_prefix: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  code: '',
  address: '',
  phone: '',
  gstin: '',
  invoice_prefix: '',
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BranchesScreen() {
  const { session } = useSessionStore();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // form state: null = closed, 'new' = creating, branchId = editing
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const canManage = session?.role === 'owner' || session?.role === 'admin';

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchBranches();
    if (err) setError(err);
    else setBranches(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Form helpers ────────────────────────────────────────────────────────────

  const openNew = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditingId('new');
  };

  const openEdit = (b: Branch) => {
    setForm({
      name: b.name,
      code: b.code,
      address: b.address,
      phone: b.phone,
      gstin: b.gstin ?? '',
      invoice_prefix: b.invoice_prefix,
    });
    setFormError(null);
    setEditingId(b.id);
  };

  const closeForm = () => {
    setEditingId(null);
    setFormError(null);
  };

  const validate = (): boolean => {
    if (!form.name.trim()) { setFormError('Branch name is required.'); return false; }
    if (!form.code.trim()) { setFormError('Branch code is required.'); return false; }
    if (!form.address.trim()) { setFormError('Address is required.'); return false; }
    if (!form.phone.trim()) { setFormError('Phone is required.'); return false; }
    if (!form.invoice_prefix.trim()) { setFormError('Invoice prefix is required.'); return false; }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    setFormError(null);

    const payload: CreateBranchPayload = {
      name: form.name,
      code: form.code,
      address: form.address,
      phone: form.phone,
      gstin: form.gstin || undefined,
      invoice_prefix: form.invoice_prefix,
    };

    let err: string | null;

    if (editingId === 'new') {
      const result = await createBranch(payload);
      err = result.error;
    } else {
      const result = await updateBranch(editingId!, payload);
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

  const handleToggleActive = async (b: Branch) => {
    const label = b.is_active ? 'deactivate' : 'activate';
    Alert.alert(
      `${b.is_active ? 'Deactivate' : 'Activate'} Branch`,
      `Are you sure you want to ${label} "${b.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: b.is_active ? 'Deactivate' : 'Activate',
          style: b.is_active ? 'destructive' : 'default',
          onPress: async () => {
            const { error: err } = await updateBranch(b.id, { is_active: !b.is_active });
            if (err) Alert.alert('Error', err);
            else void load();
          },
        },
      ]
    );
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

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Building2 size={20} color="#0066b2" />
          <Text style={styles.headerTitle}>Branch Management</Text>
        </View>
        {canManage && editingId === null && (
          <Pressable style={styles.addBtn} onPress={openNew} id="btn-add-branch">
            <Plus size={16} color="#fff" />
            <Text style={styles.addBtnText}>Add Branch</Text>
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* ── Form (create / edit) ── */}
        {editingId !== null && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>
              {editingId === 'new' ? 'New Branch' : 'Edit Branch'}
            </Text>

            {formError && (
              <View style={styles.formErrorBox}>
                <Text style={styles.formErrorText}>{formError}</Text>
              </View>
            )}

            <FormField
              label="Branch Name *"
              icon={<Building2 size={14} color="#64748b" />}
              value={form.name}
              onChangeText={(v) => setForm({ ...form, name: v })}
              placeholder="e.g. Anna Nagar"
            />
            <FormField
              label="Code *"
              icon={<Hash size={14} color="#64748b" />}
              value={form.code}
              onChangeText={(v) => setForm({ ...form, code: v.toUpperCase() })}
              placeholder="e.g. ANN"
              maxLength={10}
              autoCapitalize="characters"
            />
            <FormField
              label="Invoice Prefix *"
              icon={<Tag size={14} color="#64748b" />}
              value={form.invoice_prefix}
              onChangeText={(v) => setForm({ ...form, invoice_prefix: v.toUpperCase() })}
              placeholder="e.g. ANN"
              maxLength={10}
              autoCapitalize="characters"
            />
            <FormField
              label="Address *"
              icon={<MapPin size={14} color="#64748b" />}
              value={form.address}
              onChangeText={(v) => setForm({ ...form, address: v })}
              placeholder="Full street address"
              multiline
            />
            <FormField
              label="Phone *"
              icon={<Phone size={14} color="#64748b" />}
              value={form.phone}
              onChangeText={(v) => setForm({ ...form, phone: v })}
              placeholder="+91 9876543210"
              keyboardType="phone-pad"
            />
            <FormField
              label="GSTIN (optional)"
              icon={<FileText size={14} color="#64748b" />}
              value={form.gstin}
              onChangeText={(v) => setForm({ ...form, gstin: v.toUpperCase() })}
              placeholder="22AAAAA0000A1Z5"
              maxLength={15}
              autoCapitalize="characters"
            />

            <View style={styles.formActions}>
              <Pressable style={styles.cancelBtn} onPress={closeForm} id="btn-cancel-branch">
                <X size={16} color="#64748b" />
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                id="btn-save-branch"
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Check size={16} color="#fff" />
                )}
                <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Branch'}</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Branch List ── */}
        {branches.length === 0 && editingId === null ? (
          <View style={styles.emptyState}>
            <Building2 size={40} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>No branches yet</Text>
            <Text style={styles.emptySubtitle}>Add your first branch to get started.</Text>
          </View>
        ) : (
          branches.map((b) => (
            <View key={b.id} style={[styles.branchCard, !b.is_active && styles.branchCardInactive]}>
              <View style={styles.branchCardTop}>
                <View style={styles.branchInfo}>
                  <View style={styles.branchNameRow}>
                    <Text style={styles.branchName}>{b.name}</Text>
                    <View style={[styles.statusBadge, b.is_active ? styles.activeBadge : styles.inactiveBadge]}>
                      <Text style={[styles.statusText, b.is_active ? styles.activeText : styles.inactiveText]}>
                        {b.is_active ? 'Active' : 'Inactive'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.branchMeta}>
                    <View style={styles.metaPill}>
                      <Hash size={11} color="#64748b" />
                      <Text style={styles.metaText}>{b.code}</Text>
                    </View>
                    <View style={styles.metaPill}>
                      <Tag size={11} color="#64748b" />
                      <Text style={styles.metaText}>Prefix: {b.invoice_prefix}</Text>
                    </View>
                  </View>
                  <Text style={styles.branchAddress} numberOfLines={1}>{b.address}</Text>
                  <Text style={styles.branchPhone}>{b.phone}</Text>
                  {b.gstin ? <Text style={styles.branchGstin}>GST: {b.gstin}</Text> : null}
                </View>

                {canManage && (
                  <View style={styles.branchActions}>
                    <Pressable
                      style={styles.iconBtn}
                      onPress={() => openEdit(b)}
                      id={`btn-edit-branch-${b.id}`}
                    >
                      <Pencil size={15} color="#0066b2" />
                    </Pressable>
                    <Pressable
                      style={styles.iconBtn}
                      onPress={() => handleToggleActive(b)}
                      id={`btn-toggle-branch-${b.id}`}
                    >
                      {b.is_active
                        ? <ToggleRight size={18} color="#22c55e" />
                        : <ToggleLeft size={18} color="#94a3b8" />
                      }
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ─── FormField helper ─────────────────────────────────────────────────────────

function FormField({
  label,
  icon,
  value,
  onChangeText,
  placeholder,
  multiline,
  maxLength,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
  autoCapitalize?: 'none' | 'characters' | 'words' | 'sentences';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.fieldInput, multiline && styles.fieldInputMulti]}>
        <View style={styles.fieldIcon}>{icon}</View>
        <TextInput
          style={[styles.fieldText, multiline && styles.fieldTextMulti]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#94a3b8"
          multiline={multiline}
          maxLength={maxLength}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
        />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 16, paddingBottom: 40 },

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
  fieldInputMulti: { height: 80, alignItems: 'flex-start', paddingTop: 10 },
  fieldIcon: { width: 20, alignItems: 'center' },
  fieldText: { flex: 1, fontSize: 14, color: '#0F172A' },
  fieldTextMulti: { textAlignVertical: 'top' },

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

  // ── Branch Card ──
  branchCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  branchCardInactive: { opacity: 0.55 },
  branchCardTop: { flexDirection: 'row', padding: 16, gap: 12 },

  branchInfo: { flex: 1, gap: 6 },
  branchNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  branchName: { fontSize: 15, fontWeight: '700', color: '#0F172A' },

  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  activeBadge: { backgroundColor: '#DCFCE7' },
  inactiveBadge: { backgroundColor: '#F1F5F9' },
  statusText: { fontSize: 11, fontWeight: '700' },
  activeText: { color: '#16a34a' },
  inactiveText: { color: '#64748b' },

  branchMeta: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  metaText: { fontSize: 11, fontWeight: '600', color: '#475569' },

  branchAddress: { fontSize: 12, color: '#64748b' },
  branchPhone: { fontSize: 12, color: '#64748b' },
  branchGstin: { fontSize: 11, color: '#94a3b8', fontStyle: 'italic' },

  branchActions: { justifyContent: 'flex-start', gap: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyState: { alignItems: 'center', gap: 10, paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#94A3B8' },
  emptySubtitle: { fontSize: 13, color: '#CBD5E1', textAlign: 'center' },
});
