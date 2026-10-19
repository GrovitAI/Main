import React, { memo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View, type PressableStateCallbackType, type StyleProp, type ViewStyle } from 'react-native';
import { X } from 'lucide-react-native';
import { Text, TextInput } from '@/components/ui/Typography';
import { colors, semantic } from '@/lib/pos/brand';
import { hoverLink, ownHover } from '@/lib/pos/web-hover';
import { buzz } from '@/lib/pos/kitchen-haptics';
import type { MenuProduct } from '@/lib/pos/menu-service';
import { menuPrice, parsePrice } from '@/lib/pos/menu-utils';

export const CARD_HEIGHT = 104;

const tabular = { fontVariant: ['tabular-nums' as const] };
const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {};

type MenuCardProps = {
  product: MenuProduct;
  selected: boolean;
  /** A laptop: a pointer over the card shows its on-sale switch and makes the price editable. */
  quick: boolean;
  onOpen: (id: string) => void;
  /** A phone: holding the card opens the quick sheet. */
  onHold?: (id: string) => void;
  onToggle: (id: string, next: boolean) => void;
  onSavePrice: (id: string, price: number) => Promise<boolean>;
};

function Tag({ label, tone }: { label: string; tone: 'neutral' | 'warn' }) {
  return (
    <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: tone === 'warn' ? semantic.warningSoft : colors.surfaceTint }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: tone === 'warn' ? semantic.warning : colors.textSecondary }}>{label}</Text>
    </View>
  );
}

/** The small switch drawn on a card under the pointer; the editor carries the full-size one. */
function MiniSwitch({ on, name, onChange, onHover }: { on: boolean; name: string; onChange: (next: boolean) => void; onHover: (over: boolean) => void }) {
  return (
    <Pressable {...ownHover} onPress={() => onChange(!on)} accessibilityRole="switch" accessibilityLabel={`${name} on sale`} accessibilityState={{ checked: on }} aria-checked={on} hitSlop={11}
      onHoverIn={() => onHover(true)} onHoverOut={() => onHover(false)}
      style={{ width: 36, height: 22, borderRadius: 11, padding: 2, backgroundColor: on ? colors.primary : colors.border, alignItems: on ? 'flex-end' : 'flex-start' }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.surfaceElevated }} />
    </Pressable>
  );
}

/**
 * One menu item, drawn as on the till (task 276, menu C): its name and price, and a tag when it is
 * sold out or has no price. A tap opens the editor. On a phone a hold opens the quick sheet; on a
 * laptop the pointer shows the on-sale switch and the price turns into a field when clicked.
 */
export const MenuCard = memo(function MenuCard({ product, selected, quick, onOpen, onHold, onToggle, onSavePrice }: MenuCardProps) {
  const [hovered, setHovered] = useState(false);
  // A Pressable ends its hover when the pointer moves onto a Pressable inside it (react-native-web
  // hands the hover to the inner one), so the card counts the pointer over its own controls too.
  const [overControl, setOverControl] = useState(false);
  const pointed = hovered || overControl;
  const [priceText, setPriceText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const onSale = product.is_available !== false;
  const editing = priceText !== null;
  const showQuick = quick && (pointed || editing);
  const typed = editing ? parsePrice(priceText) : null;
  const changed = typed !== null && typed !== product.price;

  const save = async () => {
    if (typed === null || saving) return;
    setSaving(true);
    const ok = await onSavePrice(product.id, typed);
    setSaving(false);
    if (ok) setPriceText(null);
  };

  const flag = !onSale ? <Tag label="Sold out" tone="neutral" /> : product.price === 0 ? <Tag label="No price" tone="warn" /> : null;
  const muted = !onSale;

  return (
    <Pressable
      {...ownHover}
      onPress={() => onOpen(product.id)}
      onLongPress={onHold ? () => { buzz('select'); onHold(product.id); } : undefined}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${product.price === 0 ? 'no price' : menuPrice(product.price)}${onSale ? '' : ', sold out'}`}
      accessibilityHint={onHold ? 'Hold to change the price or sale' : undefined}
      accessibilityState={selected ? { selected: true } : undefined}
      aria-selected={selected ? true : undefined}
      style={({ pressed }: PressableStateCallbackType): StyleProp<ViewStyle> => ({
        flex: 1,
        height: CARD_HEIGHT,
        borderRadius: 18,
        // The selected card's border is thicker; the padding gives the width back so nothing moves.
        borderWidth: selected ? 2 : 1,
        padding: selected ? 13 : 14,
        borderColor: selected ? colors.primary : pointed ? colors.border : colors.borderSoft,
        backgroundColor: muted ? semantic.neutralSoft : colors.surfaceElevated,
        justifyContent: 'space-between',
        shadowColor: colors.primaryNavy,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: selected ? 0.12 : pointed ? 0.08 : 0,
        shadowRadius: 20,
        transform: [{ scale: pressed && !quick ? 0.98 : 1 }],
      })}
    >
      <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: '700', lineHeight: 19, color: muted ? colors.textSecondary : colors.textPrimary }}>{product.name}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, minHeight: 26 }}>
        {editing ? (
          // Claims the press so typing in the field never opens the editor behind it.
          <View onStartShouldSetResponder={() => true} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', width: 96, height: 36, borderRadius: 10, borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.surfaceElevated, paddingHorizontal: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textSecondary, marginRight: 4 }}>₹</Text>
              <TextInput value={priceText} onChangeText={setPriceText} autoFocus keyboardType="decimal-pad" inputMode="decimal" accessibilityLabel={`${product.name} price`}
                style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: '700', color: colors.textPrimary, paddingVertical: 4, ...tabular, ...webNoOutline }} />
            </View>
            {saving ? <ActivityIndicator size="small" color={colors.primary} /> : changed ? (
              <Pressable {...hoverLink} onPress={() => void save()} accessibilityRole="button" accessibilityLabel={`Save ${product.name} price`} hitSlop={8} style={{ minHeight: 36, justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: colors.primary }}>Save</Text>
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }} />
            <Pressable onPress={() => setPriceText(null)} accessibilityRole="button" accessibilityLabel="Keep the price" hitSlop={6}
              className="h-8 w-8 items-center justify-center rounded-lg hover:bg-surface-tint">
              <X size={16} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : showQuick ? (
          <>
            <Pressable {...hoverLink} onPress={() => { setOverControl(false); setPriceText(product.price === 0 ? '' : String(product.price)); }} accessibilityRole="button" accessibilityLabel={`Change ${product.name} price`} hitSlop={8}
              onHoverIn={() => setOverControl(true)} onHoverOut={() => setOverControl(false)}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: muted ? colors.textSecondary : colors.primary, textDecorationLine: 'underline', textDecorationStyle: 'dotted', ...tabular }}>
                {product.price === 0 ? 'Add price' : menuPrice(product.price)}
              </Text>
            </Pressable>
            <MiniSwitch on={onSale} name={product.name} onChange={(next) => onToggle(product.id, next)} onHover={setOverControl} />
          </>
        ) : (
          <>
            <Text style={{ fontSize: 16, fontWeight: '700', color: muted ? colors.textSecondary : colors.primary, ...tabular }}>{product.price === 0 ? '—' : menuPrice(product.price)}</Text>
            {flag}
          </>
        )}
      </View>
    </Pressable>
  );
});
