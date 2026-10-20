import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ChevronRight, Plus, UserRound } from 'lucide-react-native';
import { Text } from '@/components/ui/Typography';
import { colors } from '@/lib/pos/brand';
import { useOrdersStore } from '@/lib/pos/use-orders-store';
import { Field, LinkButton, Notice, PrimaryButton, Sheet, TextField } from '@/components/kitchen/ui';
import { cleanPhone, showPhone, validPhone } from '@/lib/pos/customer-utils';

/**
 * Task 288: the customer's name and number on the bill, both optional. A row under the items;
 * a tap opens a small sheet. Shown once the order exists (after the first item), and read-only
 * when the order can no longer be changed.
 */
export function CustomerRow({ canEdit }: { canEdit: boolean }) {
  const activeOrderId = useOrdersStore((s) => s.activeOrderId);
  const order = useOrdersStore((s) => s.orders.find((o) => o.id === s.activeOrderId) ?? null);
  const setCustomer = useOrdersStore((s) => s.setCustomer);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!activeOrderId || !order) return null;
  const savedName = order.customer_name ?? '';
  const savedPhone = order.customer_phone ?? '';
  const has = !!(savedName || savedPhone);
  if (!canEdit && !has) return null;

  const shown = [savedName, savedPhone ? showPhone(savedPhone) : ''].filter(Boolean).join(' · ');
  const nextName = name.trim();
  const nextPhone = cleanPhone(phone);
  const changed = nextName !== savedName || nextPhone !== savedPhone;
  const why = nextName.length > 80 ? 'Name is too long' : nextPhone && !validPhone(nextPhone) ? 'Check the number' : undefined;

  const start = () => { setName(savedName); setPhone(savedPhone ? showPhone(savedPhone) : ''); setError(null); setOpen(true); };
  const save = async (clear = false) => {
    setSaving(true);
    setError(null);
    const message = await setCustomer(clear ? null : nextName || null, clear ? null : nextPhone || null);
    setSaving(false);
    if (message) { setError(message); return; }
    setOpen(false);
  };

  return (
    <>
      <Pressable onPress={canEdit ? start : undefined} disabled={!canEdit} accessibilityRole="button"
        accessibilityLabel={has ? `Customer: ${shown}` : 'Add customer name and number'}
        className={`min-h-[44px] flex-row items-center gap-2.5 rounded-xl border border-border-soft bg-surface-elevated px-3 py-2 ${canEdit ? 'hover:bg-surface-tint active:bg-surface-tint' : ''}`}>
        <UserRound size={16} color={colors.textSecondary} />
        <Text className="text-[13px] font-bold text-text-primary">Customer</Text>
        <Text className={`min-w-0 flex-1 text-right text-[13px] font-semibold ${has ? 'text-text-primary' : 'text-text-secondary'}`} numberOfLines={1}>{has ? shown : 'Add'}</Text>
        {canEdit ? (has ? <ChevronRight size={16} color={colors.textSecondary} /> : <Plus size={16} color={colors.textSecondary} />) : null}
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Customer" dirty={changed}>
        <View style={{ gap: 10 }}>
          <Field label="Name" optional>
            <TextField label="Customer name" value={name} onChange={setName} placeholder="Name" autoFocus={!has} />
          </Field>
          <Field label="Number" optional>
            <TextField label="Customer number" value={phone} onChange={setPhone} placeholder="98765 43210" keyboardType="phone-pad" />
          </Field>
        </View>
        {error ? <Notice text={error} /> : null}
        {changed ? <View className="mt-4"><PrimaryButton label="Save" onPress={() => void save()} disabled={!!why} loading={saving} reason={why} /></View> : null}
        {has ? <View className="mt-1 items-center"><LinkButton label="Remove customer" onPress={() => void save(true)} /></View> : null}
      </Sheet>
    </>
  );
}
