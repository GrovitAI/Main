/**
 * The kitchen screens' shared pieces: one header, one card, one chip, one
 * button, one row, so every screen reads the same. Colours come from
 * brand.ts; money is green in, red out, amber for a buy.
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Search, X, Check, Minus, Plus, type LucideIcon } from 'lucide-react-native';
import { colors, semantic } from '@/lib/pos/brand';
import { useResponsive } from '@/lib/pos/useResponsive';
import { formatMoney, matchesSearch } from '@/lib/pos/kitchen-utils';

export type Tone = 'neutral' | 'in' | 'out' | 'buy' | 'primary';

export const toneColor: Record<Tone, string> = {
  neutral: colors.textPrimary,
  in: semantic.success,
  out: semantic.danger,
  buy: semantic.warning,
  primary: colors.primary,
};
export const toneSoft: Record<Tone, string> = {
  neutral: semantic.neutralSoft,
  in: semantic.successSoft,
  out: semantic.dangerSoft,
  buy: semantic.warningSoft,
  primary: colors.accentSoft,
};

// ─── Screen and header ───────────────────────────────────────────────────────

type ScreenProps = {
  children: React.ReactNode;
  /** Scrolls by default; a FlatList screen passes false and scrolls itself. */
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Pinned under the content, above the tab bar: a save button, a total. */
  footer?: React.ReactNode;
  /** Room for a floating tab bar or a sheet. */
  bottomPad?: number;
};

export function KScreen({ children, scroll = true, refreshing = false, onRefresh, footer, bottomPad = 24 }: ScreenProps) {
  const { isTablet } = useResponsive();
  const inner = (
    <View style={{ width: '100%', maxWidth: isTablet ? 720 : undefined, alignSelf: 'center', paddingHorizontal: 16, paddingBottom: bottomPad }}>
      {children}
    </View>
  );
  return (
    <View className="flex-1 bg-surface-tint">
      {scroll ? (
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
        >
          {inner}
        </ScrollView>
      ) : (
        <View className="flex-1">{children}</View>
      )}
      {footer ? (
        <View className="border-t border-border-soft bg-surface-elevated" style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }}>
          <View style={{ width: '100%', maxWidth: isTablet ? 720 : undefined, alignSelf: 'center' }}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

type HeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  /** Large title on a top-level screen; inline when the screen has a back button. */
  large?: boolean;
};

export function KHeader({ title, subtitle, onBack, right, large = !onBack }: HeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 12 : 0) + 8, paddingBottom: 8 }}>
      <View className="flex-row items-center" style={{ minHeight: 44, gap: 8 }}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            className="items-center justify-center rounded-full"
            style={({ pressed }) => ({ width: 44, height: 44, marginLeft: -8, opacity: pressed ? 0.6 : 1 })}
          >
            <ChevronLeft size={26} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        <View className="flex-1" style={{ minWidth: 0 }}>
          <Text
            className="font-extrabold text-text-primary"
            style={{ fontSize: large ? 28 : 20, letterSpacing: -0.4, lineHeight: large ? 32 : 24 }}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', marginTop: 2 }} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}

export function IconButton({ icon: Icon, label, onPress, tone = 'primary' }: { icon: LucideIcon; label: string; onPress: () => void; tone?: Tone }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      className="items-center justify-center rounded-2xl border border-border-soft bg-surface-elevated"
      style={({ pressed }) => ({ width: 44, height: 44, opacity: pressed ? 0.6 : 1 })}
    >
      <Icon size={20} color={toneColor[tone]} />
    </Pressable>
  );
}

// ─── Surfaces ────────────────────────────────────────────────────────────────

export function Card({ children, style, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  return (
    <View className="rounded-2xl border border-border-soft bg-surface-elevated" style={[padded ? { padding: 14 } : null, style]}>
      {children}
    </View>
  );
}

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <View style={{ marginTop: 18 }}>
      <View className="flex-row items-end justify-between" style={{ marginBottom: 8, minHeight: 24 }}>
        <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Label({ children }: { children: string }) {
  return (
    <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>
      {children}
    </Text>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <View style={{ marginTop: 16 }}>
      <Label>{label}</Label>
      {children}
      {hint ? <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', marginTop: 6, lineHeight: 18 }}>{hint}</Text> : null}
    </View>
  );
}

export function StatTile({ label, value, tone = 'neutral', onPress }: { label: string; value: number; tone?: Tone; onPress?: () => void }) {
  const body = (
    <>
      <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.3, marginTop: 2, color: toneColor[tone], fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
        {formatMoney(value)}
      </Text>
    </>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${formatMoney(value)}`} className="flex-1 rounded-2xl border border-border-soft bg-surface-elevated" style={({ pressed }) => ({ padding: 12, minHeight: 66, opacity: pressed ? 0.7 : 1 })}>
        {body}
      </Pressable>
    );
  }
  return <View className="flex-1 rounded-xl bg-surface-tint" style={{ padding: 10, minHeight: 60 }}>{body}</View>;
}

export function ActionTile({ icon: Icon, label, caption, tone, onPress }: { icon: LucideIcon; label: string; caption: string; tone: Tone; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${caption}`}
      className="flex-1 rounded-2xl border border-border-soft bg-surface-elevated"
      style={({ pressed }) => ({ padding: 14, minHeight: 100, justifyContent: 'space-between', opacity: pressed ? 0.7 : 1 })}
    >
      <View className="items-center justify-center rounded-xl" style={{ width: 36, height: 36, backgroundColor: toneSoft[tone] }}>
        <Icon size={20} color={toneColor[tone]} />
      </View>
      <View>
        <Text className="text-text-primary" style={{ fontSize: 17, fontWeight: '800' }}>{label}</Text>
        <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>{caption}</Text>
      </View>
    </Pressable>
  );
}

// ─── Rows and lists ──────────────────────────────────────────────────────────

type RowProps = {
  title: string;
  subtitle?: string;
  right?: string;
  rightSub?: string;
  tone?: Tone;
  icon?: LucideIcon;
  iconTone?: Tone;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
  muted?: boolean;
  accessibilityLabel?: string;
};

export function Row({ title, subtitle, right, rightSub, tone = 'neutral', icon: Icon, iconTone = 'neutral', onPress, onLongPress, selected, muted, accessibilityLabel }: RowProps) {
  const content = (
    <>
      {Icon ? (
        <View className="items-center justify-center rounded-xl" style={{ width: 36, height: 36, backgroundColor: toneSoft[iconTone] }}>
          <Icon size={18} color={toneColor[iconTone]} />
        </View>
      ) : null}
      <View className="flex-1" style={{ minWidth: 0 }}>
        <Text className="text-text-primary" style={[{ fontSize: 15, fontWeight: '700' }, selected ? { color: colors.primary } : null, muted ? { textDecorationLine: 'line-through', color: colors.textSecondary } : null]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '600', marginTop: 2 }} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: muted ? colors.textSecondary : toneColor[tone], fontVariant: ['tabular-nums'] }}>{right}</Text>
          {rightSub ? <Text className="text-text-secondary" style={{ fontSize: 11, fontWeight: '700', marginTop: 1 }}>{rightSub}</Text> : null}
        </View>
      ) : null}
    </>
  );
  const base: ViewStyle = { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 58 };
  if (!onPress && !onLongPress) return <View className="border-b border-border-soft" style={base}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={selected ? { selected: true } : undefined}
      className="border-b border-border-soft"
      style={({ pressed }) => [base, { opacity: pressed ? 0.6 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <View className="items-center" style={{ paddingVertical: 28, paddingHorizontal: 12, gap: 6 }}>
      <Text className="text-text-primary" style={{ fontSize: 15, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
      {body ? <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 19, maxWidth: 300 }}>{body}</Text> : null}
      {action ? <View style={{ marginTop: 10 }}>{action}</View> : null}
    </View>
  );
}

export function Notice({ text, tone = 'out', action }: { text: string; tone?: Tone; action?: React.ReactNode }) {
  return (
    <View className="flex-row items-center rounded-2xl" style={{ backgroundColor: toneSoft[tone], padding: 12, gap: 10, marginTop: 12 }} accessibilityRole="alert">
      <Text className="flex-1" style={{ color: toneColor[tone], fontSize: 13, fontWeight: '700', lineHeight: 18 }}>{text}</Text>
      {action}
    </View>
  );
}

export function Skeleton({ height = 60, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return <View className="rounded-2xl bg-border-soft" style={[{ height, opacity: 0.7 }, style]} accessibilityElementsHidden />;
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

export function SearchBox({ value, onChange, placeholder = 'Search', autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <View className="flex-row items-center rounded-2xl border border-border bg-surface-elevated" style={{ minHeight: 46, paddingHorizontal: 12, gap: 8 }}>
      <Search size={18} color={colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        autoFocus={autoFocus}
        autoCorrect={false}
        accessibilityLabel={placeholder}
        className="flex-1 text-text-primary"
        style={{ fontSize: 15, fontWeight: '600', paddingVertical: 10, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }}
        returnKeyType="search"
      />
      {value ? (
        <Pressable onPress={() => onChange('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
          <X size={16} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export type ChipOption<T extends string> = { value: T; label: string; hint?: string; searchText?: string };

type ChipsProps<T extends string> = {
  options: readonly ChipOption<T>[];
  value: T | null;
  onChange: (v: T) => void;
  /** Shows a search box once the list is long. */
  searchable?: boolean;
  searchPlaceholder?: string;
  trailing?: React.ReactNode;
  emptyText?: string;
};

export function Chips<T extends string>({ options, value, onChange, searchable, searchPlaceholder = 'Search', trailing, emptyText }: ChipsProps<T>) {
  const [query, setQuery] = useState('');
  const showSearch = searchable && options.length > 6;
  const shown = useMemo(
    () => (showSearch && query ? options.filter((o) => matchesSearch(query, o.label, o.hint, o.searchText) || o.value === value) : options),
    [options, query, showSearch, value],
  );
  return (
    <View style={{ gap: 10 }}>
      {showSearch ? <SearchBox value={query} onChange={setQuery} placeholder={searchPlaceholder} /> : null}
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {shown.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={o.hint ? `${o.label}, ${o.hint}` : o.label}
              className="flex-row items-center rounded-full border"
              style={({ pressed }) => ({
                minHeight: 40,
                paddingHorizontal: 14,
                gap: 6,
                backgroundColor: on ? colors.primary : colors.surfaceElevated,
                borderColor: on ? colors.primary : colors.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: on ? colors.textOnPrimary : colors.textPrimary }}>{o.label}</Text>
              {o.hint ? <Text style={{ fontSize: 12, fontWeight: '600', color: on ? colors.textOnPrimary : colors.textSecondary, opacity: 0.85 }}>{o.hint}</Text> : null}
            </Pressable>
          );
        })}
        {trailing}
        {shown.length === 0 && emptyText ? <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', paddingVertical: 10 }}>{emptyText}</Text> : null}
      </View>
    </View>
  );
}

export function AddChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} className="flex-row items-center rounded-full border border-dashed border-border bg-surface-tint" style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: 14, gap: 4, opacity: pressed ? 0.7 : 1 })}>
      <Plus size={14} color={colors.primary} />
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>{label}</Text>
    </Pressable>
  );
}

export function TextField({ value, onChange, placeholder, label, keyboardType, autoFocus, multiline, big, prefix }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  keyboardType?: 'default' | 'decimal-pad' | 'numeric' | 'phone-pad';
  autoFocus?: boolean;
  multiline?: boolean;
  big?: boolean;
  prefix?: string;
}) {
  return (
    <View className="flex-row items-center rounded-2xl border border-border bg-surface-elevated" style={{ minHeight: big ? 64 : 48, paddingHorizontal: 14 }}>
      {prefix ? <Text className="text-text-secondary" style={{ fontSize: big ? 26 : 16, fontWeight: '800', marginRight: 6 }}>{prefix}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        keyboardType={keyboardType}
        inputMode={keyboardType === 'decimal-pad' || keyboardType === 'numeric' ? 'decimal' : undefined}
        autoFocus={autoFocus}
        multiline={multiline}
        accessibilityLabel={label}
        className="flex-1 text-text-primary"
        style={{ fontSize: big ? 30 : 16, fontWeight: big ? '800' : '600', paddingVertical: multiline ? 12 : 10, letterSpacing: big ? -0.5 : 0, fontVariant: ['tabular-nums'], ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }}
      />
    </View>
  );
}

export function QtyStepper({ value, onChange, step, unit, label }: { value: number; onChange: (v: number) => void; step: number; unit: string; label: string }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value > 0 ? String(value) : '');
  const commit = (raw: string) => {
    setText(raw);
    const n = parseFloat(raw);
    onChange(Number.isFinite(n) && n >= 0 ? n : 0);
  };
  const bump = (d: number) => {
    const next = Math.max(0, Math.round((value + d) * 1000) / 1000);
    setText(null);
    onChange(next);
  };
  return (
    <View className="flex-row items-center overflow-hidden rounded-xl border border-border" style={{ height: 44 }}>
      <Pressable onPress={() => bump(-step)} accessibilityRole="button" accessibilityLabel={`Less ${label}`} className="items-center justify-center bg-surface-tint" style={({ pressed }) => ({ width: 44, height: 44, opacity: pressed ? 0.6 : 1 })}>
        <Minus size={18} color={colors.textPrimary} />
      </Pressable>
      <TextInput
        value={shown}
        onChangeText={commit}
        onBlur={() => setText(null)}
        placeholder="0"
        placeholderTextColor={colors.textSecondary}
        keyboardType="decimal-pad"
        inputMode="decimal"
        accessibilityLabel={`${label} quantity in ${unit}`}
        className="text-text-primary bg-surface-elevated"
        style={{ width: 64, height: 44, textAlign: 'center', fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'], ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }}
      />
      <Pressable onPress={() => bump(step)} accessibilityRole="button" accessibilityLabel={`More ${label}`} className="items-center justify-center bg-surface-tint" style={({ pressed }) => ({ width: 44, height: 44, opacity: pressed ? 0.6 : 1 })}>
        <Plus size={18} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

export function Tick({ on }: { on: boolean }) {
  return (
    <View className="items-center justify-center rounded-lg border-2" style={{ width: 26, height: 26, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : 'transparent' }}>
      {on ? <Check size={16} color={colors.textOnPrimary} strokeWidth={3} /> : null}
    </View>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

export function PrimaryButton({ label, onPress, disabled, loading, tone = 'primary', icon: Icon }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean; tone?: Tone; icon?: LucideIcon }) {
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: loading }}
      className="flex-row items-center justify-center rounded-2xl"
      style={({ pressed }) => ({ minHeight: 52, paddingHorizontal: 18, gap: 8, backgroundColor: toneColor[tone], opacity: off ? 0.45 : pressed ? 0.8 : 1 })}
    >
      {loading ? <ActivityIndicator color={colors.textOnPrimary} /> : Icon ? <Icon size={18} color={colors.textOnPrimary} /> : null}
      <Text style={{ color: colors.textOnPrimary, fontSize: 16, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

export function GhostButton({ label, onPress, icon: Icon, tone = 'neutral', small }: { label: string; onPress: () => void; icon?: LucideIcon; tone?: Tone; small?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center justify-center rounded-2xl border border-border bg-surface-elevated"
      style={({ pressed }) => ({ minHeight: small ? 40 : 52, paddingHorizontal: small ? 14 : 18, gap: 8, opacity: pressed ? 0.7 : 1 })}
    >
      {Icon ? <Icon size={small ? 16 : 18} color={toneColor[tone]} /> : null}
      <Text style={{ color: toneColor[tone], fontSize: small ? 13 : 15, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={({ pressed }) => ({ minHeight: 36, justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View className="flex-row rounded-2xl border border-border bg-surface-tint" style={{ padding: 3 }} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: on }} className="flex-1 items-center justify-center rounded-xl" style={{ minHeight: 42, backgroundColor: on ? colors.surfaceElevated : 'transparent', borderWidth: on ? 1 : 0, borderColor: colors.border }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: on ? colors.primary : colors.textSecondary }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Sheet ───────────────────────────────────────────────────────────────────

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel="Close" className="flex-1" style={{ backgroundColor: colors.overlay, justifyContent: isTablet ? 'center' : 'flex-end', alignItems: 'center' }}>
        <Pressable onPress={() => undefined} className="bg-surface-elevated" style={{ width: '100%', maxWidth: isTablet ? 520 : undefined, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomLeftRadius: isTablet ? 24 : 0, borderBottomRightRadius: isTablet ? 24 : 0, padding: 18, paddingBottom: Math.max(insets.bottom, 12) + 8, maxHeight: '88%' }}>
          <View className="flex-row items-center justify-between" style={{ marginBottom: 12 }}>
            <Text className="text-text-primary" style={{ fontSize: 18, fontWeight: '800' }}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A short confirmation at the foot of a screen that fades after a moment. */
export function Toast({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 96, alignItems: 'center' }}>
      <View className="rounded-2xl" style={{ backgroundColor: colors.textPrimary, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 420 }} accessibilityLiveRegion="polite">
        <Text style={{ color: colors.textOnPrimary, fontSize: 13, fontWeight: '700' }}>{text}</Text>
      </View>
    </View>
  );
}
