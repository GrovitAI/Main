/**
 * The kitchen screens' shared pieces: one header, one card, one chip, one
 * button, one row, so every screen reads the same. Colours come from
 * brand.ts; money is green in, red out, amber for a buy, on figures and
 * icons only. Every action, filled or outlined, is Le Laban blue.
 *
 * Legacy Pressables with function styles must not also take className:
 * NativeWind drops that function. Class-styled controls use active variants.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, FlatList, Modal, Platform, Pressable, RefreshControl, ScrollView, View, useWindowDimensions, type LayoutChangeEvent, type PressableStateCallbackType, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Text, TextInput } from '@/components/ui/Typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, ChevronLeft, ChevronRight, Delete, MoreHorizontal, Search, WifiOff, X, Check, Minus, Plus, type LucideIcon } from 'lucide-react-native';
import { avatar as avatarTones, colors, semantic } from '@/lib/pos/brand';
import { useResponsive } from '@/lib/pos/useResponsive';
import { amountReadBack, formatMoney, formatQty, matchesSearch, padDisplay, padPress, type PadKey } from '@/lib/pos/kitchen-utils';
import { buzz } from '@/lib/pos/kitchen-haptics';
import { hoverFace, hoverFaceMark, hoverLink } from '@/lib/pos/web-hover';
import { useOnline } from '@/lib/pos/use-online';

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

const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {};
const tabular: TextStyle = { fontVariant: ['tabular-nums'] };
/** The smallest thing a finger may be asked to hit: 44 pt on iOS and the web, 48 dp on Android. */
const TARGET = Platform.select({ android: 48, default: 44 }) ?? 44;
/**
 * Option C (owner, 2026-10-14): small controls are drawn 36 high, and an invisible
 * hit slop above and below brings the finger target back to TARGET.
 */
const VISUAL = 36;
/** The transparent band above and below a drawn control that keeps the whole target tappable. */
const BAND = Math.ceil((TARGET - VISUAL) / 2);

/** A resting style plus the pressed dim, for every Pressable in these screens. */
function pressed(base: StyleProp<ViewStyle>, dim = 0.65): (state: PressableStateCallbackType) => StyleProp<ViewStyle> {
  return (state) => [base, { opacity: state.pressed ? dim : 1 }];
}

const cardStyle: ViewStyle = { borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 18, backgroundColor: colors.surfaceElevated };

/** Compact browser controls on desktop; retain the phone/tablet touch layout. */
export function useDesktopDensity(): boolean {
  const { isDesktop } = useResponsive();
  return Platform.OS === 'web' && isDesktop;
}

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
  /** Overview/list surfaces may use more width; entry forms stay readable. */
  wide?: boolean;
  /** The footer floats on the canvas instead of a white strip (a phone's SummaryBar, task 231). */
  floatingFooter?: boolean;
};

export function KScreen({ children, scroll = true, refreshing = false, onRefresh, footer, bottomPad = 24, wide = false, floatingFooter = false }: ScreenProps) {
  const { isTablet } = useResponsive();
  const compact = useDesktopDensity();
  const widthClass = compact && wide ? 'max-w-[1120px] self-center' : isTablet ? 'max-w-[720px] self-center' : 'self-center';
  const inner = (
    <View className={`w-full px-4 ${widthClass}`} style={{ paddingBottom: bottomPad }}>
      {children}
    </View>
  );
  return (
    <View className="flex-1 bg-kitchen-canvas">
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
        <View className={floatingFooter ? 'bg-kitchen-canvas' : 'border-t border-border-soft bg-surface-elevated'} style={{ paddingHorizontal: floatingFooter ? 12 : 16, paddingTop: floatingFooter ? 6 : 10, paddingBottom: 10 }}>
          <View className={`w-full ${widthClass}`}>{footer}</View>
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
  const compact = useDesktopDensity();
  return (
    <View style={{ paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 12 : 0) + (compact ? 0 : 8), paddingBottom: 8 }}>
      <View className="flex-row items-center" style={{ minHeight: 44, gap: 8 }}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            style={pressed({ width: 44, height: 44, marginLeft: -8, borderRadius: 22, alignItems: 'center', justifyContent: 'center' })}
          >
            <ChevronLeft size={26} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        <View className="flex-1" style={{ minWidth: 0 }}>
          <Text
            className={`font-extrabold text-text-primary ${large ? compact ? 'text-2xl leading-7' : 'text-[28px] leading-8' : compact ? 'text-lg leading-6' : 'text-xl leading-6'}`}
            style={{ letterSpacing: -0.4 }}
            numberOfLines={2}
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
      style={pressed({ ...cardStyle, borderRadius: 16, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' })}
    >
      <Icon size={20} color={toneColor[tone]} />
    </Pressable>
  );
}

// ─── Surfaces ────────────────────────────────────────────────────────────────

export function Card({ children, style, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const compact = useDesktopDensity();
  return <View className={`border border-border-soft bg-surface-elevated ${compact ? 'rounded-xl' : 'rounded-[18px]'} ${padded ? compact ? 'p-3' : 'p-3.5' : ''}`} style={style}>{children}</View>;
}

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children?: React.ReactNode }) {
  const compact = useDesktopDensity();
  return (
    <View className={compact ? 'mt-3' : 'mt-[18px]'}>
      <View className="flex-row items-center justify-between" style={{ marginBottom: 4, minHeight: 24 }}>
        <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>
          {title}
        </Text>
        {action}
      </View>
      {children}
    </View>
  );
}

/**
 * A settings section (task 222, Polaris annotated layout). On a desktop its name and a one-line
 * description sit in a narrow column, with the settings beside them at a readable width, so a
 * switch never ends up a screen away from its label. `side={false}` keeps the name above a
 * section that needs the full width. On a phone it is an ordinary Section.
 */
export function SettingsSection({ title, description, side = true, children }: { title: string; description?: string; side?: boolean; children: React.ReactNode }) {
  const desktop = useDesktopDensity();
  if (!desktop) return <Section title={title}>{children}</Section>;
  const heading = (
    <View>
      <Text className="text-[15px] font-extrabold leading-5 text-text-primary">{title}</Text>
      {description ? <Text className="mt-0.5 text-[13px] leading-5 text-text-secondary">{description}</Text> : null}
    </View>
  );
  if (!side) return <View className="mt-6 gap-3">{heading}{children}</View>;
  return (
    <View className="mt-6 flex-row items-start gap-6">
      <View className="w-60 shrink-0 pt-1">{heading}</View>
      <View className="min-w-0 max-w-[640px] flex-1">{children}</View>
    </View>
  );
}

/**
 * A field's name. An optional field says so in its name (task 222, GOV.UK question pages), in
 * plain lower case after the capitals, rather than in a placeholder that vanishes on typing.
 */
export function Label({ children, optional = false }: { children: string; optional?: boolean }) {
  return (
    <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 }}>
      {children}
      {optional ? <Text style={{ fontSize: 12, fontWeight: '600', letterSpacing: 0, textTransform: 'none' }}> (optional)</Text> : null}
    </Text>
  );
}

/** A labelled field. Its hint is one short sentence under the box. */
export function Field({ label, children, hint, optional = false }: { label: string; children: React.ReactNode; hint?: string; optional?: boolean }) {
  return (
    <View style={{ marginTop: 10 }}>
      <Label optional={optional}>{label}</Label>
      {children}
      {hint ? <Text className="text-text-secondary" style={{ fontSize: 12, fontWeight: '600', marginTop: 4, lineHeight: 17 }}>{hint}</Text> : null}
    </View>
  );
}

export function StatTile({ label, value, tone = 'neutral', onPress }: { label: string; value: number; tone?: Tone; onPress?: () => void }) {
  const compact = useDesktopDensity();
  const body = (
    <>
      <View className="flex-row items-center gap-0.5">
        <Text className="shrink text-text-secondary" style={{ fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{label}</Text>
        {onPress ? <ChevronRight size={13} color={colors.textSecondary} /> : null}
      </View>
      <Text className={`mt-0.5 font-extrabold ${compact ? 'text-xl leading-6' : 'text-[22px] leading-[26px]'}`} style={{ letterSpacing: -0.3, color: toneColor[tone], ...tabular }} numberOfLines={1} adjustsFontSizeToFit>
        {formatMoney(value)}
      </Text>
    </>
  );
  // Task 222: a tappable figure is a cell of its card too, not a box of its own. A small chevron
  // says it opens; the tint reaches a little past the text, which stays in line with plain cells.
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}, ${formatMoney(value)}`} className="-m-1.5 min-h-[44px] min-w-0 flex-1 rounded-lg p-1.5 hover:bg-surface-tint active:bg-surface-tint">
        {body}
      </Pressable>
    );
  }
  // Inside a card it is a plain cell; the card draws the dividers, so there is no card within a card.
  return <View style={{ flex: 1, minWidth: 0 }}>{body}</View>;
}

/** From this width a desktop detail page or pane puts its summary in a column of its own (task 222). */
export const SPLIT_FROM = 640;
/** That summary column stays in view while the list beside it scrolls (browsers only). */
export const stickySide: ViewStyle = Platform.OS === 'web' ? ({ position: 'sticky', top: 0 } as object) : {};

/** A hairline between two cells of one card: vertical between columns, horizontal between rows. */
export function Divider({ vertical }: { vertical?: boolean }) {
  return <View style={vertical ? { width: 1, alignSelf: 'stretch', backgroundColor: colors.borderSoft, marginHorizontal: 12 } : { height: 1, backgroundColor: colors.borderSoft, marginVertical: 10 }} />;
}

export function ActionTile({ icon: Icon, label, caption, tone, onPress }: { icon: LucideIcon; label: string; caption: string; tone: Tone; onPress: () => void }) {
  const compact = useDesktopDensity();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${caption}`}
      className={`flex-1 border border-border-soft bg-surface-elevated active:opacity-60 ${compact ? 'min-h-[76px] flex-row items-center gap-2.5 rounded-xl p-3' : 'min-h-[100px] justify-between rounded-[18px] p-3.5'}`}
    >
      <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: toneSoft[tone] }}>
        <Icon size={compact ? 18 : 20} color={toneColor[tone]} />
      </View>
      <View className={compact ? 'min-w-0 flex-1' : ''}>
        <Text className={`font-extrabold leading-5 text-text-primary ${compact ? 'text-sm' : 'text-[17px]'}`}>{label}</Text>
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
  /** Lines the title may use before it is cut; long item names use two. */
  titleLines?: number;
  /** Drawn before the text in place of an icon, such as a name's circle (task 233). */
  lead?: React.ReactNode;
};

/**
 * The side padding of the card a list row sits in (task 226). The row reaches back across it, so
 * its hover and press tint run from card edge to card edge while its text and divider stay inset.
 * A card whose sides differ from 14 says so with a Provider.
 */
export const RowInset = React.createContext(14);

export function Row({ title, subtitle, right, rightSub, tone = 'neutral', icon: Icon, iconTone = 'neutral', onPress, onLongPress, selected, muted, accessibilityLabel, titleLines = 1, lead }: RowProps) {
  const compact = useDesktopDensity();
  const inset = React.useContext(RowInset);
  const reach: ViewStyle = { marginHorizontal: -inset, paddingHorizontal: inset };
  const rowClass = `flex-row items-center gap-3 border-b border-border-soft ${compact ? 'min-h-[52px] py-2' : 'min-h-[58px] py-3'}`;
  const content = (
    <>
      {lead ?? null}
      {Icon && !lead ? (
        <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: toneSoft[iconTone] }}>
          <Icon size={18} color={toneColor[iconTone]} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text className={`font-bold ${compact ? 'text-sm' : 'text-[15px]'}`} style={[{ color: colors.textPrimary }, selected ? { color: colors.primary } : null, muted ? { textDecorationLine: 'line-through', color: colors.textSecondary } : null]} numberOfLines={titleLines}>{title}</Text>
        {subtitle ? <Text style={{ fontSize: 12, fontWeight: '600', marginTop: 2, color: colors.textSecondary }} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right || rightSub ? (
        <View style={{ alignItems: 'flex-end' }}>
          {right ? <Text style={{ fontSize: 15, fontWeight: '800', color: muted ? colors.textSecondary : toneColor[tone], ...tabular }}>{right}</Text> : null}
          {rightSub ? <Text style={{ fontSize: 12, fontWeight: '700', marginTop: 1, color: colors.textSecondary, ...tabular }}>{rightSub}</Text> : null}
        </View>
      ) : null}
    </>
  );
  if (!onPress && !onLongPress) return <View style={reach}><View className={rowClass}>{content}</View></View>;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={selected ? { selected: true } : undefined}
      aria-selected={selected ? true : undefined}
      className="active:opacity-60"
      style={reach}
    >
      <View className={rowClass}>{content}</View>
    </Pressable>
  );
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  const compact = useDesktopDensity();
  return (
    <View className={`items-center gap-1.5 px-3 ${compact ? 'py-5' : 'py-7'}`}>
      <Text className="text-text-primary" style={{ fontSize: 15, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
      {body ? <Text className="text-text-secondary" style={{ fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 19, maxWidth: 300 }}>{body}</Text> : null}
      {action ? <View style={{ marginTop: 10 }}>{action}</View> : null}
    </View>
  );
}

export function Notice({ text, tone = 'out', action }: { text: string; tone?: Tone; action?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 16, backgroundColor: toneSoft[tone], padding: 12, gap: 10, marginTop: 12 }} accessibilityRole="alert">
      <Text style={{ flex: 1, color: toneColor[tone], fontSize: 13, fontWeight: '700', lineHeight: 18 }}>{text}</Text>
      {action}
    </View>
  );
}

export function Skeleton({ height = 60, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  // A slow pulse says "loading" in the shape of what is coming (task 216); still with Reduce Motion.
  const reduce = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.7)).current;
  useEffect(() => {
    if (reduce) { pulse.setValue(0.7); return; }
    const step = (toValue: number) => Animated.timing(pulse, { toValue, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER });
    const loop = Animated.loop(Animated.sequence([step(0.4), step(0.85)]));
    loop.start();
    return () => loop.stop();
  }, [reduce, pulse]);
  return <Animated.View style={[{ height, borderRadius: 16, backgroundColor: colors.borderSoft, opacity: pulse }, style]} accessibilityElementsHidden />;
}

/** Placeholder rows in the shape of a list, for a first load (task 216). */
export function SkeletonRows({ count = 4, height = 52, label }: { count?: number; height?: number; label: string }) {
  const widths = ['100%', '86%', '94%', '78%', '90%', '82%'] as const;
  return (
    <View style={{ gap: 8, paddingVertical: 8 }} accessible accessibilityLabel={label} accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} height={height} style={{ width: widths[i % widths.length], borderRadius: 12 }} />)}
    </View>
  );
}

// ─── Inputs ──────────────────────────────────────────────────────────────────

export function SearchBox({ value, onChange, placeholder = 'Search', autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, minHeight: 44, paddingHorizontal: 12, gap: 8 }}>
      <Search size={18} color={colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        autoFocus={autoFocus}
        autoCorrect={false}
        accessibilityLabel={placeholder}
        style={{ flex: 1, color: colors.textPrimary, fontSize: 15, fontWeight: '600', paddingVertical: 10, ...webNoOutline }}
        returnKeyType="search"
      />
      {value ? (
        <Pressable onPress={() => onChange('')} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} style={pressed({ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' })}>
          <X size={16} color={colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export type ChipOption<T extends string> = { value: T; label: string; hint?: string; searchText?: string };

/**
 * Same-size choices (owner rule, tasks 218 and 223): every option in a row of choices takes the
 * width of the widest one, so the highlight keeps one size as it moves. Each label is measured
 * from an invisible copy (`MeasureLabels`), which re-measures once the font has loaded.
 * - When all of them fit on one line, each gets the widest label plus `pad`, or an equal share
 *   of the line when that is narrower (never below the label plus `tightPad`).
 * - Otherwise they wrap as a grid of equal cells (`fallback: 'grid'`), or keep their own widths
 *   on a very narrow screen (`fallback: 'natural'`, for tabs that must stay on one line).
 * `width` is undefined until both the labels and the line have been measured.
 */
export function useEqualChoices(count: number, { gap, pad, tightPad = pad, fallback = 'grid' }: { gap: number; pad: number; tightPad?: number; fallback?: 'grid' | 'natural' }): {
  measure: (i: number) => (e: LayoutChangeEvent) => void; onLine: (e: LayoutChangeEvent) => void; width: number | undefined; widest: number;
} {
  const sizes = useRef<number[]>([]);
  const [widest, setWidest] = useState(0);
  const [line, setLine] = useState(0);
  const measure = useCallback((i: number) => (e: LayoutChangeEvent) => {
    sizes.current[i] = e.nativeEvent.layout.width;
    // Two pixels of slack so rounding never wraps or clips the widest label.
    const max = Math.ceil(Math.max(0, ...sizes.current.slice(0, count).filter((w) => w !== undefined))) + 2;
    setWidest((w) => (w === max ? w : max));
  }, [count]);
  const onLine = useCallback((e: LayoutChangeEvent) => { const w = Math.floor(e.nativeEvent.layout.width); setLine((old) => (old === w ? old : w)); }, []);
  let width: number | undefined;
  if (widest > 0 && line > 0 && count > 0) {
    const share = Math.floor((line - gap * (count - 1)) / count);
    if (share >= widest + tightPad) width = Math.min(widest + pad, share);
    else if (fallback === 'grid') width = Math.min(widest + pad, line);
  }
  return { measure, onLine, width, widest };
}

/** Draws its children invisibly and out of the layout, only so their natural widths can be measured. */
export function MeasureLabels({ children }: { children: React.ReactNode }) {
  return (
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none"
      style={{ position: 'absolute', left: 0, top: 0, height: 0, overflow: 'hidden', opacity: 0, alignItems: 'flex-start' }}>
      {children}
    </View>
  );
}

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
  const slide = useSlidingRect(shown.findIndex((o) => o.value === value));
  // Every chip is as wide as the widest of all the options (task 223), so the highlight keeps one
  // size and the widths hold while a search narrows the list. A list with an add chip after it
  // always wraps as a grid.
  const equal = useEqualChoices(options.length, { gap: 6, pad: 28, tightPad: trailing ? Number.POSITIVE_INFINITY : 16 });
  const chipFace = (o: ChipOption<T>, on: boolean) => (
    <>
      <Text style={{ fontSize: 13, fontWeight: '700', color: on ? colors.textOnPrimary : colors.textPrimary }} numberOfLines={1}>{o.label}</Text>
      {o.hint ? <Text style={{ fontSize: 12, fontWeight: '600', color: on ? colors.textOnPrimary : colors.textSecondary, opacity: 0.85 }} numberOfLines={1}>{o.hint}</Text> : null}
    </>
  );
  return (
    <View style={{ gap: 10 }}>
      {showSearch ? <SearchBox value={query} onChange={setQuery} placeholder={searchPlaceholder} /> : null}
      <View onLayout={equal.onLine} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 6, alignItems: 'center' }}>
        <MeasureLabels>
          {options.map((o, i) => <View key={o.value} onLayout={equal.measure(i)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{chipFace(o, false)}</View>)}
        </MeasureLabels>
        <Animated.View pointerEvents="none" style={{ position: 'absolute', height: TARGET, paddingVertical: BAND, ...slide.style, top: slide.top }}>
          <View style={{ flex: 1, borderRadius: 999, backgroundColor: colors.primary }} />
        </Animated.View>
        {shown.map((o, i) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              onLayout={slide.measure(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              aria-selected={on}
              accessibilityLabel={o.hint ? `${o.label}, ${o.hint}` : o.label}
              {...hoverFace}
              style={pressed({ minHeight: TARGET, justifyContent: 'center', ...(equal.width ? { width: equal.width } : {}) })}
            >
              <View {...hoverFaceMark} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderWidth: 1, minHeight: VISUAL, paddingHorizontal: equal.width ? 6 : 14, gap: 6, backgroundColor: 'transparent', borderColor: on ? colors.primary : colors.border }}>
                {chipFace(o, on)}
              </View>
            </Pressable>
          );
        })}
        {trailing}
        {shown.length === 0 && emptyText ? <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600', paddingVertical: 10 }}>{emptyText}</Text> : null}
      </View>
    </View>
  );
}

export function AddChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} {...hoverFace} style={pressed({ minHeight: TARGET, justifyContent: 'center' })}>
      <View {...hoverFaceMark} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.surfaceTint, minHeight: VISUAL, paddingHorizontal: 14, gap: 4 }}>
        <Plus size={14} color={colors.primary} />
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary }}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function TextField({ value, onChange, placeholder, label, keyboardType, autoFocus, multiline, big, prefix, flat }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  keyboardType?: 'default' | 'decimal-pad' | 'numeric' | 'phone-pad';
  autoFocus?: boolean;
  multiline?: boolean;
  big?: boolean;
  prefix?: string;
  /** Inside a card: a tinted well instead of a bordered box, so there is no box within a box. */
  flat?: boolean;
}) {
  // A rupee field reads a large amount back under the box (task 221), so a
  // missing or extra zero shows before the save. The flat in-row price fields
  // are small figures and skip it.
  const readBack = prefix === '₹' && !flat;
  const shell: ViewStyle = flat
    ? { borderRadius: 12, backgroundColor: colors.surfaceTint, minHeight: TARGET, paddingHorizontal: 12 }
    : { borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, minHeight: 44, paddingHorizontal: 12, ...(big ? { maxWidth: 360, width: '100%' } : {}) };
  const box = (
    <View style={{ flexDirection: 'row', alignItems: 'center', ...shell }}>
      {prefix ? <Text style={{ color: colors.textSecondary, fontSize: big ? 17 : 16, fontWeight: '800', marginRight: 6 }}>{prefix}</Text> : null}
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
        className={big ? 'text-xl' : undefined}
        style={{ flex: 1, minWidth: 0, color: colors.textPrimary, fontSize: big ? 20 : value ? 16 : 15, fontWeight: value ? (big ? '800' : '600') : '400', paddingVertical: multiline ? 12 : 8, letterSpacing: big && value ? -0.3 : 0, ...tabular, ...webNoOutline }}
      />
    </View>
  );
  if (!readBack) return box;
  // Always wrapped, so the field keeps its focus when the line appears.
  const spoken = amountReadBack(value);
  return (
    <View>
      {box}
      <Reveal open={spoken !== null}>
        <Text accessibilityLiveRegion="polite" className="text-text-secondary" style={{ fontSize: 13, fontWeight: '700', marginTop: 4, ...tabular }}>{spoken}</Text>
      </Reveal>
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
  const side: ViewStyle = { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceTint };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: colors.border, height: 44 }}>
      <Pressable onPress={() => bump(-step)} accessibilityRole="button" accessibilityLabel={`Less ${label}`} style={pressed(side)}>
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
        style={{ width: 64, height: 44, textAlign: 'center', fontSize: 15, fontWeight: '800', color: colors.textPrimary, backgroundColor: colors.surfaceElevated, ...tabular, ...webNoOutline }}
      />
      <Pressable onPress={() => bump(step)} accessibilityRole="button" accessibilityLabel={`More ${label}`} style={pressed(side)}>
        <Plus size={18} color={colors.textPrimary} />
      </Pressable>
    </View>
  );
}

export function Tick({ on, size = 26 }: { on: boolean; size?: number }) {
  // The blue fades in and the tick pops (a slight overshoot); unticking just fades.
  const reduce = useReducedMotion();
  const progress = useRef(new Animated.Value(on ? 1 : 0)).current;
  const before = useRef(on);
  useEffect(() => {
    if (before.current !== on) buzz('select');
    before.current = on;
    if (reduce) { progress.setValue(on ? 1 : 0); return; }
    const run = Animated.timing(progress, { toValue: on ? 1 : 0, duration: on ? 200 : 120, easing: on ? Easing.out(Easing.back(1.6)) : Easing.out(Easing.quad), useNativeDriver: NATIVE_DRIVER });
    run.start();
    return () => run.stop();
  }, [on, reduce, progress]);
  const fill = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.3), borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderColor: on ? colors.primary : colors.border }}>
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.primary, opacity: fill }} />
      <Animated.View style={{ opacity: fill, transform: [{ scale }] }}>
        <Check size={Math.round(size * 0.62)} color={colors.textOnPrimary} strokeWidth={3} />
      </Animated.View>
    </View>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────────────

export function PrimaryButton({ label, onPress, disabled, loading, tone = 'primary', icon: Icon, done = false, reason }: {
  label: string; onPress: () => void; disabled?: boolean; loading?: boolean; tone?: Tone; icon?: LucideIcon;
  /** The save went through: green with a tick and "Saved" for a moment (task 216). */
  done?: boolean;
  /** What is missing, shown on the button while it is disabled (task 216). */
  reason?: string;
}) {
  const compact = useDesktopDensity();
  const off = disabled || loading || done;
  const why = disabled && !loading && !done && reason ? reason : null;
  const text = done ? 'Saved' : why ?? label;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={why ? `${label}: ${why}` : text}
      accessibilityState={{ disabled: off, busy: loading }}
      className={`flex-row items-center justify-center gap-2 px-[18px] min-h-11 rounded-xl ${(disabled || loading) && !done ? 'opacity-50' : 'active:opacity-80'}`}
      style={{ backgroundColor: done ? semantic.success : toneColor[tone] }}
    >
      {done ? <Check size={18} color={colors.textOnPrimary} strokeWidth={3} /> : loading ? <ActivityIndicator color={colors.textOnPrimary} /> : Icon && !why ? <Icon size={18} color={colors.textOnPrimary} /> : null}
      <Text className={`font-extrabold text-text-on-primary ${compact ? 'text-sm' : 'text-[15px]'}`} numberOfLines={1}>{text}</Text>
    </Pressable>
  );
}

/**
 * After a confirmed save (task 216): `mark()` turns the button to "Saved" with a
 * tick at once (and the phone buzzes), so it cannot be pressed twice while the
 * lists reload; `finish(next)` then runs `next`, usually leaving the form, once
 * the tick has shown for 650 ms.
 */
export function useSavedThen(): { saved: boolean; mark: () => void; finish: (next: () => void) => void } {
  const [saved, setSaved] = useState(false);
  const since = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const mark = useCallback(() => {
    if (since.current) return;
    since.current = Date.now();
    buzz('success');
    setSaved(true);
  }, []);
  const finish = useCallback((next: () => void) => {
    mark();
    timer.current = setTimeout(() => { timer.current = null; next(); }, Math.max(0, 650 - (Date.now() - since.current)));
  }, [mark]);
  return { saved, mark, finish };
}

export function GhostButton({ label, onPress, icon: Icon, tone = 'neutral', small, disabled = false }: { label: string; onPress: () => void; icon?: LucideIcon; tone?: Tone; small?: boolean; disabled?: boolean }) {
  const compact = useDesktopDensity();
  const content = (
    <>
      {Icon ? <Icon size={small ? 16 : 18} color={toneColor[tone]} /> : null}
      <Text style={{ color: toneColor[tone], fontSize: small ? 13 : compact ? 14 : 15, fontWeight: '800' }}>{label}</Text>
    </>
  );
  const face: ViewStyle = { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, minHeight: small ? VISUAL : 44, paddingHorizontal: small ? 12 : 16, gap: 8 };
  if (compact) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }}
        className="min-h-11 flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface-elevated px-3.5 active:opacity-60">
        {content}
      </Pressable>
    );
  }
  // A small button is drawn 36 high inside a full-height target.
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{ disabled }}
      {...(small ? hoverFace : {})} style={pressed(small ? { minHeight: TARGET, justifyContent: 'center' } : face)}>
      {small ? <View {...hoverFaceMark} style={face}>{content}</View> : content}
    </Pressable>
  );
}

export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} {...hoverLink} style={pressed({ minHeight: TARGET, justifyContent: 'center' })}>
      <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

// ─── Settings rows and menus (task 219) ──────────────────────────────────────
// Lighter than buttons. An on/off setting is a switch, a one-of-many choice is
// a row that shows its value and opens a short list, and occasional actions
// (edit, remove) share one menu. Rows sit in a SettingsGroup, which draws one
// card with a hairline between rows.

/** One white card of rows separated by hairlines; rows draw their own top line. */
export function SettingsGroup({ children }: { children: React.ReactNode }) {
  return <Card padded={false} style={{ overflow: 'hidden' }}><View style={{ marginTop: -1 }}>{children}</View></Card>;
}

const rowClass = 'min-h-[56px] flex-row items-center gap-3 border-t border-border-soft px-3.5 py-2.5 hover:bg-surface-tint active:bg-surface-tint';

function RowText({ label, hint }: { label: string; hint?: string }) {
  return (
    <View className="min-w-0 flex-1 gap-0.5">
      <Text className="text-[15px] font-bold leading-5 text-text-primary">{label}</Text>
      {hint ? <Text className="text-xs leading-[17px] text-text-secondary">{hint}</Text> : null}
    </View>
  );
}

/** A whole-row on/off switch. The thumb glides across and the track fills blue. */
export function Toggle({ label, hint, on, onChange, disabled = false }: { label: string; hint?: string; on: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  const reduce = useReducedMotion();
  const progress = useRef(new Animated.Value(on ? 1 : 0)).current;
  const before = useRef(on);
  useEffect(() => {
    if (before.current !== on) buzz('select');
    before.current = on;
    if (reduce) { progress.setValue(on ? 1 : 0); return; }
    // The track colour can't run on the native driver, so the thumb shares the JS one.
    const run = Animated.timing(progress, { toValue: on ? 1 : 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [on, reduce, progress]);
  const track = progress.interpolate({ inputRange: [0, 1], outputRange: [colors.border, colors.primary] });
  const x = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 18] });
  return (
    <Pressable onPress={() => onChange(!on)} disabled={disabled} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on, disabled }} aria-checked={on}
      className={rowClass + (disabled ? ' opacity-50' : '')}>
      <RowText label={label} hint={hint} />
      <Animated.View style={{ width: 44, height: 26, borderRadius: 13, padding: 2, backgroundColor: track }}>
        <Animated.View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surfaceElevated, transform: [{ translateX: x }] }} />
      </Animated.View>
    </Pressable>
  );
}

export type SelectOption<T extends string> = { value: T; label: string; detail?: string };

/**
 * A row naming a setting and its current value; a tap opens the choices in a
 * sheet (rising from the bottom on a phone, centred on a wider screen). Use it
 * instead of a row of pills once there are more than a few choices.
 */
export function SelectRow<T extends string>({ label, hint, value, valueLabel, options, onChange, disabled = false }: {
  label: string; hint?: string; value: T; options: readonly SelectOption<T>[]; onChange: (value: T) => void;
  /** Shown instead of the option's label, for a value no option names (a picked date). */
  valueLabel?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = valueLabel ?? options.find((o) => o.value === value)?.label ?? '';
  return (
    <>
      <Pressable onPress={() => setOpen(true)} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${label}: ${current}`} accessibilityState={{ expanded: open, disabled }}
        className={rowClass + (disabled ? ' opacity-50' : '')}>
        <RowText label={label} hint={hint} />
        <View className="max-w-[50%] shrink-0 flex-row items-center gap-1">
          <Text className="text-sm font-bold text-primary" numberOfLines={1}>{current}</Text>
          <ChevronDown size={16} color={colors.primary} />
        </View>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <View style={{ gap: 4 }}>
          {options.map((o) => {
            const on = o.value === value;
            return (
              <Pressable key={o.value} onPress={() => { setOpen(false); onChange(o.value); }} accessibilityRole="button" accessibilityState={{ selected: on }} aria-selected={on} accessibilityLabel={o.detail ? `${o.label}, ${o.detail}` : o.label}
                className={'min-h-12 flex-row items-center gap-3 rounded-xl px-3 py-2 ' + (on ? 'bg-surface-tint' : 'hover:bg-accent-soft active:bg-accent-soft')}>
                <View className="min-w-0 flex-1">
                  <Text className={'text-[15px] text-text-primary ' + (on ? 'font-bold' : 'font-semibold')}>{o.label}</Text>
                  {o.detail ? <Text className="text-xs text-text-secondary">{o.detail}</Text> : null}
                </View>
                {on ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </>
  );
}

export type MenuItem = { label: string; icon: LucideIcon; onPress: () => void; tone?: Tone };

/**
 * One "more" button that opens a small menu under it, for actions used now and
 * then (edit, remove). It replaces a row of icon buttons.
 */
export function MoreMenu({ label, items }: { label: string; items: readonly MenuItem[] }) {
  const anchor = useRef<View>(null);
  const { width } = useWindowDimensions();
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null);
  const shown = useRef(place);
  if (place) shown.current = place;
  const menu = usePresence(place !== null, 160);
  const close = (): void => setPlace(null);
  const open = (): void => anchor.current?.measureInWindow((x, y, w, h) => setPlace({ top: y + h + 6, right: Math.max(8, width - (x + w)) }));
  if (!items.length) return null;
  return (
    <>
      <View ref={anchor} collapsable={false}><IconButton icon={MoreHorizontal} label={label} onPress={open} /></View>
      <Modal visible={menu.mounted} transparent animationType="none" onRequestClose={close}>
        <Pressable accessible={false} onPress={close} style={{ flex: 1 }}>
          <Animated.View accessibilityRole="menu" style={{ position: 'absolute', top: shown.current?.top ?? 0, right: shown.current?.right ?? 0, minWidth: 196, opacity: menu.progress, transform: [{ translateY: menu.progress.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] }) }] }}>
            <View className="rounded-2xl border border-border bg-surface-elevated p-1">
              {items.map((item) => (
                <Pressable key={item.label} accessibilityRole="menuitem" accessibilityLabel={item.label} onPress={() => { close(); item.onPress(); }}
                  className="min-h-12 flex-row items-center gap-3 rounded-xl px-3 hover:bg-surface-tint active:bg-surface-tint">
                  <item.icon size={18} color={toneColor[item.tone ?? 'primary']} />
                  <Text className="text-[15px] font-semibold" style={{ color: item.tone === 'out' ? toneColor.out : colors.textPrimary }}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

/**
 * A few mutually exclusive choices as equal buttons across the row, each with an
 * icon: the whole button is the target and the chosen one is filled blue.
 */
export function ChoiceButtons<T extends string>({ options, value, onChange, label }: { options: readonly { value: T; label: string; icon: LucideIcon }[]; value: T; onChange: (v: T) => void; label: string }) {
  // One connected bar drawn 40 high; the blue highlight slides to the chosen part.
  const slide = useSlidingRect(options.findIndex((o) => o.value === value));
  return (
    <View style={{ paddingHorizontal: 2 }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <View style={{ flexDirection: 'row', minHeight: TARGET, gap: 2 }}>
        <View pointerEvents="none" style={{ position: 'absolute', left: -2, right: -2, top: BAND - 2, bottom: BAND - 2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTint }} />
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: BAND, height: VISUAL, borderRadius: 10, backgroundColor: colors.primary, ...slide.style }} />
        {options.map((o, i) => {
          const on = o.value === value;
          const Icon = o.icon;
          return (
            <Pressable key={o.value} onPress={() => onChange(o.value)} onLayout={slide.measure(i)} accessibilityRole="radio" accessibilityState={{ checked: on }} aria-checked={on} accessibilityLabel={o.label}
              {...hoverFace} style={pressed({ flex: 1, minHeight: TARGET, paddingVertical: BAND })}>
              <View {...hoverFaceMark} style={{ flex: 1, minHeight: VISUAL, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6, borderRadius: 10 }}>
                <Icon size={16} color={on ? colors.textOnPrimary : colors.primary} />
                <Text style={{ fontSize: 14, fontWeight: '800', color: on ? colors.textOnPrimary : colors.textPrimary }} numberOfLines={1}>{o.label}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  // The same connected bar as the payment mode; a raised white highlight slides to the chosen part.
  const slide = useSlidingRect(options.findIndex((o) => o.value === value));
  return (
    <View style={{ paddingHorizontal: 2 }} accessibilityRole="tablist">
      <View style={{ flexDirection: 'row', minHeight: TARGET }}>
        <View pointerEvents="none" style={{ position: 'absolute', left: -2, right: -2, top: BAND - 2, bottom: BAND - 2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTint }} />
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: BAND, height: VISUAL, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, ...slide.style }} />
        {options.map((o, i) => {
          const on = o.value === value;
          return (
            <Pressable key={o.value} onPress={() => onChange(o.value)} onLayout={slide.measure(i)} accessibilityRole="tab" accessibilityState={{ selected: on }} aria-selected={on}
              {...hoverFace} style={pressed({ flex: 1, minHeight: TARGET, paddingVertical: BAND })}>
              <View {...hoverFaceMark} style={{ flex: 1, minHeight: VISUAL, alignItems: 'center', justifyContent: 'center', borderRadius: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: on ? colors.primary : colors.textSecondary }}>{o.label}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}


// ─── Sliding selection ───────────────────────────────────────────────────────

/** True when the person has asked the device for less motion. */
export function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => { if (live) setReduce(on); }).catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { live = false; sub.remove(); };
  }, []);
  return reduce;
}

/**
 * One highlight that slides to the chosen option of a row (task 214). Each option
 * reports its place with `measure(i)`; the highlight is an absolute
 * Animated.View in the same row, given `style`. It moves in 220 ms with an
 * ease-out, appears in place the first time, jumps on resize, and jumps
 * when Reduce Motion is on. `index` -1 hides it.
 */
export function useSlidingRect(index: number): { measure: (i: number) => (e: LayoutChangeEvent) => void; style: { left: Animated.Value; width: Animated.Value; opacity: number }; top: Animated.Value } {
  const reduce = useReducedMotion();
  const places = useRef<({ x: number; y: number; width: number } | undefined)[]>([]);
  const left = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const top = useRef(new Animated.Value(0)).current;
  const shown = useRef(false);
  const [ready, setReady] = useState(false);
  const jump = useCallback((to: { x: number; y: number; width: number }) => {
    left.setValue(to.x); width.setValue(to.width); top.setValue(to.y); shown.current = true; setReady(true);
  }, [left, width, top]);
  useEffect(() => {
    const to = places.current[index];
    if (!to) return;
    if (!shown.current || reduce) { jump(to); return; }
    const timing = { duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: false };
    const run = Animated.parallel([Animated.timing(left, { toValue: to.x, ...timing }), Animated.timing(width, { toValue: to.width, ...timing }), Animated.timing(top, { toValue: to.y, ...timing })]);
    run.start();
    return () => run.stop();
  }, [index, reduce, jump, left, width, top]);
  const measure = useCallback((i: number) => (e: LayoutChangeEvent) => {
    const { x, y, width: w } = e.nativeEvent.layout;
    places.current[i] = { x, y, width: w };
    if (i === index) jump({ x, y, width: w });
  }, [index, jump]);
  return { measure, style: { left, width, opacity: ready && index >= 0 ? 1 : 0 }, top };
}

// ─── Smooth show, hide and change (task 215) ─────────────────────────────────

/** Opacity and transforms run on the native thread on phones; the web animates them in JS. */
const NATIVE_DRIVER = Platform.OS !== 'web';

/**
 * Keeps something on screen while it fades away. `progress` runs 0 → 1 as it
 * shows and back to 0 as it hides; `mounted` stays true until the hide ends.
 * With Reduce Motion it shows and hides at once.
 */
export function usePresence(visible: boolean, duration = 200): { mounted: boolean; progress: Animated.Value } {
  const reduce = useReducedMotion();
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) setMounted(true);
    if (reduce) { progress.setValue(visible ? 1 : 0); if (!visible) setMounted(false); return; }
    const run = Animated.timing(progress, { toValue: visible ? 1 : 0, duration: visible ? duration : Math.round(duration * 0.75), easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.quad), useNativeDriver: NATIVE_DRIVER });
    run.start(({ finished }) => { if (finished && !visible) setMounted(false); });
    return () => run.stop();
  }, [visible, reduce, duration, progress]);
  return { mounted, progress };
}

export type EnterStyle = { opacity: Animated.Value; transform: ({ translateX: Animated.AnimatedMultiplication<number> } | { translateY: Animated.AnimatedMultiplication<number> })[] };

/**
 * A short entrance whenever `key` changes, for content that was swapped: new
 * rows rise 6 px into place as they fade in. With `axis` 'x' they slide 16 px
 * from the side moved to instead; keys compare as text, so a later month
 * ('2026-11' after '2026-10') comes in from the right. Nothing moves on the
 * first render unless `onMount`, and nothing moves with Reduce Motion.
 */
export function useEnterOnChange(key: string, axis: 'x' | 'y' = 'y', onMount = false): EnterStyle {
  const reduce = useReducedMotion();
  const distance = axis === 'x' ? 16 : 6;
  const progress = useRef(new Animated.Value(onMount ? 0 : 1)).current;
  const offset = useRef(new Animated.Value(distance)).current;
  const shift = useMemo(() => Animated.multiply(Animated.subtract(1, progress), offset), [progress, offset]);
  const last = useRef<string | null>(onMount ? null : key);
  // Before paint, so the new content never flashes in place first.
  useLayoutEffect(() => {
    if (last.current === key) return;
    const before = last.current;
    last.current = key;
    offset.setValue(axis === 'x' && before !== null && key < before ? -distance : distance);
    if (reduce) { progress.setValue(1); return; }
    progress.setValue(0);
    const run = Animated.timing(progress, { toValue: 1, duration: axis === 'x' ? 220 : 180, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER });
    run.start();
    return () => run.stop();
  }, [key, axis, distance, reduce, progress, offset]);
  return { opacity: progress, transform: [axis === 'x' ? { translateX: shift } : { translateY: shift }] };
}

/**
 * Opens and closes its children by growing and shrinking their height, with a
 * fade, instead of snapping. Children are mounted only while open or closing.
 * With Reduce Motion it opens and closes at once.
 */
export function Reveal({ open, children }: { open: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const [moving, setMoving] = useState(false);
  const movingRef = useRef(false);
  const height = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(open ? 1 : 0)).current;
  const natural = useRef(0);
  const waiting = useRef(false);
  const run = useRef<Animated.CompositeAnimation | null>(null);
  const first = useRef(true);
  const setMove = useCallback((on: boolean) => { movingRef.current = on; setMoving(on); }, []);
  const grow = useCallback(() => {
    const anim = Animated.parallel([
      Animated.timing(height, { toValue: natural.current, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(fade, { toValue: 1, duration: 180, delay: 40, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    ]);
    run.current = anim;
    anim.start(({ finished }) => { if (finished) setMove(false); });
  }, [height, fade, setMove]);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    run.current?.stop();
    waiting.current = false;
    if (reduce) { fade.setValue(open ? 1 : 0); setMove(false); setMounted(open); return; }
    if (open) {
      // Reopened while closing: grow back from where it is.
      if (movingRef.current) { grow(); return; }
      height.setValue(0); fade.setValue(0); waiting.current = true; setMove(true); setMounted(true);
      return;
    }
    if (!movingRef.current) height.setValue(natural.current);
    setMove(true);
    const anim = Animated.parallel([
      Animated.timing(height, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: false }),
      Animated.timing(fade, { toValue: 0, duration: 120, useNativeDriver: false }),
    ]);
    run.current = anim;
    anim.start(({ finished }) => { if (finished) { setMounted(false); setMove(false); } });
  }, [open, reduce, fade, height, grow, setMove]);
  useEffect(() => () => run.current?.stop(), []);
  // The content is measured at full height (laid out absolutely), then the frame grows to it.
  const onLayout = (e: LayoutChangeEvent): void => {
    natural.current = e.nativeEvent.layout.height;
    if (!waiting.current) return;
    waiting.current = false;
    grow();
  };
  if (!mounted) return null;
  return (
    <Animated.View style={moving ? { height, overflow: 'hidden' } : undefined}>
      <Animated.View onLayout={onLayout} style={[{ opacity: fade }, moving ? { position: 'absolute', top: 0, left: 0, right: 0 } : null]}>{children}</Animated.View>
    </Animated.View>
  );
}

/** A thin moving line that says "updating" without hiding what is on screen (task 216). */
export function LoadingBar({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const run = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active || reduce || !width) return;
    run.setValue(0);
    const loop = Animated.loop(Animated.timing(run, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE_DRIVER }));
    loop.start();
    return () => loop.stop();
  }, [active, reduce, width, run]);
  return (
    <View pointerEvents="none" onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityElementsHidden style={{ height: 2, overflow: 'hidden', borderRadius: 1, opacity: active ? 1 : 0 }}>
      {reduce ? <View style={{ flex: 1, backgroundColor: colors.primary, opacity: 0.5 }} />
        : <Animated.View style={{ width: width * 0.3, height: 2, borderRadius: 1, backgroundColor: colors.primary, transform: [{ translateX: run.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.3, width] }) }] }} />}
    </View>
  );
}

/**
 * A screen opened from a list slides 16 px in from the right as it fades in
 * (task 216). For the web: the phone app's own navigation already slides.
 */
export function ScreenEnter({ children }: { children: React.ReactNode }) {
  const enter = useEnterOnChange('open', 'x', true);
  return <Animated.View style={[{ flex: 1 }, enter]}>{children}</Animated.View>;
}

// ─── Sheet ───────────────────────────────────────────────────────────────────

/**
 * `dirty`: something has been typed. A tap outside then keeps the sheet open (and says so)
 * instead of losing it; ✕ and Back still close. Untouched sheets close on a tap outside.
 */
export function Sheet({ visible, onClose, title, children, dirty = false }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode; dirty?: boolean }) {
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const [held, setHeld] = useState(false);
  useEffect(() => { if (!visible || !dirty) setHeld(false); }, [visible, dirty]);
  return (
    // On a phone the sheet rises from the bottom edge; centred on a tablet, it fades in.
    <Modal visible={visible} transparent animationType={isTablet ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable onPress={() => (dirty ? setHeld(true) : onClose())} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: isTablet ? 'center' : 'flex-end', alignItems: 'center' }}>
        <Pressable
          onPress={() => undefined}
          style={{
            width: '100%',
            maxWidth: isTablet ? 520 : undefined,
            backgroundColor: colors.surfaceElevated,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderBottomLeftRadius: isTablet ? 24 : 0,
            borderBottomRightRadius: isTablet ? 24 : 0,
            padding: 18,
            paddingBottom: Math.max(insets.bottom, 12) + 8,
            maxHeight: '88%',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: '800' }}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={pressed({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' })}>
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          {held ? <Text accessibilityLiveRegion="polite" style={{ color: colors.primary, fontSize: 12, fontWeight: '700', marginTop: -6, marginBottom: 8 }}>What you typed is kept. Finish, or close with ✕.</Text> : null}
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Two letters for a name's circle: the first letters of two words, or the first two of one. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? (Array.from(words[0] ?? '')[0] ?? '') + (Array.from(words[1] ?? '')[0] ?? '') : Array.from(words[0] ?? '').slice(0, 2).join('');
  return letters.toLocaleUpperCase() || '?';
}

function toneOf(name: string): (typeof avatarTones)[number] {
  let h = 0;
  for (const ch of name.trim().toLocaleLowerCase()) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  return avatarTones[h % avatarTones.length] ?? avatarTones[0];
}

/**
 * A name's initial circle (task 229). The colour comes from the name itself, so a branch looks the
 * same in every list. A selected circle turns Le Laban blue inside a blue ring.
 */
export function Avatar({ name, size = 44, selected = false }: { name: string; size?: number; selected?: boolean }) {
  const tone = toneOf(name);
  return (
    <View style={{ width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, borderWidth: 2.5, borderColor: selected ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? colors.primary : tone.bg }}>
        <Text style={{ fontSize: Math.round(size * 0.32), fontWeight: '800', color: selected ? colors.textOnPrimary : tone.fg }}>{initialsOf(name)}</Text>
      </View>
    </View>
  );
}

// Task 235: a decimal point in place of 00, so paise can be typed on a phone.
const PAD_KEYS: readonly PadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

/**
 * A phone's amount entry (task 229): the amount large and centred, its lakh read-back, and a
 * number pad for one thumb. Nothing is filled in for the person; the pad only adds what is tapped.
 */
export function AmountPad({ value, onChange, note }: { value: string; onChange: (next: string) => void; note?: string | null }) {
  const shown = padDisplay(value);
  const lakh = amountReadBack(value)?.split(' · ')[1] ?? null;
  const press = (key: PadKey): void => {
    buzz('select');
    const next = padPress(value, key);
    if (next !== value) onChange(next);
  };
  return (
    <View>
      <View accessibilityLiveRegion="polite" accessibilityLabel={`Amount ${shown}`} style={{ alignItems: 'center', paddingVertical: 6 }}>
        <Text style={{ fontSize: 46, lineHeight: 54, fontWeight: '800', letterSpacing: -1.5, color: value.trim() ? colors.textPrimary : colors.border, ...tabular }} numberOfLines={1} adjustsFontSizeToFit>{shown}</Text>
        <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textSecondary, minHeight: 20 }}>{lakh ?? note ?? ''}</Text>
      </View>
      <View style={{ gap: 8, marginTop: 8 }}>
        {[0, 1, 2, 3].map((row) => (
          <View key={row} className="flex-row" style={{ gap: 8 }}>
            {PAD_KEYS.slice(row * 3, row * 3 + 3).map((key) => (
              <Pressable key={key} onPress={() => press(key)} accessibilityRole="button" accessibilityLabel={key === 'del' ? 'Delete a digit' : key === '.' ? 'Decimal point' : key}
                className="h-14 flex-1 items-center justify-center rounded-2xl border border-border-soft bg-surface-elevated hover:bg-surface-tint active:bg-surface-tint">
                {key === 'del' ? <Delete size={24} color={colors.textSecondary} /> : <Text style={{ fontSize: key === '.' ? 28 : 24, fontWeight: '700', color: colors.textPrimary }}>{key}</Text>}
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * A phone's footer for a send or a buy (task 231): a dark bar with what is on the entry and its
 * total, and the save button at its end. Totals stay hidden from logins that may not see amounts.
 */
export function SummaryBar({ caption, total, showTotal = true, children }: { caption: string; total: number; showTotal?: boolean; children: React.ReactNode }) {
  return (
    <View className="flex-row items-center rounded-3xl px-2 py-2" style={{ backgroundColor: colors.primaryNavy, gap: 10 }}>
      <View className="min-w-0 flex-1 pl-2.5">
        <Text style={{ color: colors.textOnPrimary, opacity: 0.75, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{caption}</Text>
        {showTotal ? <Text style={{ color: colors.textOnPrimary, fontSize: 22, fontWeight: '800', letterSpacing: -0.3, ...tabular }} numberOfLines={1}>{formatMoney(total)}</Text> : null}
      </View>
      <View style={{ flex: 1.1 }}>{children}</View>
    </View>
  );
}

/**
 * One-of-many pills in a row that scrolls sideways (task 233), all as wide as the widest, for
 * quick filters on a phone. Each pill is drawn 36 high inside a 44 high target.
 */
export function ScrollPills<T extends string>({ options, value, onChange, label }: { options: readonly { value: T; label: string }[]; value: T; onChange: (next: T) => void; label: string }) {
  const sizes = useEqualChoices(options.length, { gap: 6, pad: 28 });
  return (
    <View accessibilityLabel={label}>
      <MeasureLabels>{options.map((o, i) => <Text key={o.value} onLayout={sizes.measure(i)} style={{ fontSize: 13, fontWeight: '700' }}>{o.label}</Text>)}</MeasureLabels>
      <FlatList horizontal showsHorizontalScrollIndicator={false} data={options} keyExtractor={(o) => o.value} contentContainerStyle={{ gap: 6 }} extraData={`${value}-${sizes.widest}`}
        renderItem={({ item: o }) => {
          const on = o.value === value;
          return (
            <Pressable onPress={() => onChange(o.value)} accessibilityRole="button" aria-selected={on} accessibilityLabel={o.label} {...hoverFace}
              style={{ minHeight: TARGET, justifyContent: 'center', ...(sizes.widest ? { width: sizes.widest + 28 } : {}) }}>
              <View {...hoverFaceMark} style={{ height: VISUAL, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: sizes.widest ? 0 : 14, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : colors.surfaceElevated }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: on ? colors.textOnPrimary : colors.textPrimary }} numberOfLines={1}>{o.label}</Text>
              </View>
            </Pressable>
          );
        }} />
    </View>
  );
}

/**
 * A quantity with its unit drawn smaller and grey (task 243), as in the approved mockup: "40 pcs"
 * reads as the number first. Small figures keep the unit close to the number's size.
 */
export function QtyFigure({ qty, unit, size, color = colors.textPrimary, className }: { qty: number; unit: string; size: number; color?: string; className?: string }) {
  const number = formatQty(qty, '').trim();
  const unitSize = size >= 24 ? Math.round(size * 0.5) : Math.max(12, Math.round(size * 0.8));
  return (
    <Text className={className} style={{ fontSize: size, fontWeight: '800', color, letterSpacing: size >= 24 ? -0.8 : 0, ...tabular }} numberOfLines={1}>
      {number}<Text style={{ fontSize: unitSize, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0 }}> {unit}</Text>
    </Text>
  );
}

/**
 * One choice in a sheet's list (task 228): an icon in a soft chip, the name with an optional
 * badge, one line under it and a chevron. The whole row is the target.
 */
export function SheetRow({ icon: Icon, iconColor = colors.primary, label, caption, badge, selected = false, onPress }: {
  icon: LucideIcon; iconColor?: string; label: string; caption?: string; badge?: string; selected?: boolean; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" aria-selected={selected} accessibilityLabel={caption ? `${label}, ${caption}` : label}
      className={`min-h-[64px] flex-row items-center gap-3.5 rounded-2xl px-2 py-2 active:opacity-70 ${selected ? 'bg-surface-tint' : 'hover:bg-surface-tint'}`}>
      <View className="h-11 w-11 items-center justify-center rounded-[15px] bg-accent-soft"><Icon size={21} color={iconColor} /></View>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="text-base font-bold text-text-primary">{label}</Text>
          {badge ? <View className="rounded-full bg-surface-tint px-2 py-0.5"><Text className="text-xs font-bold text-primary">{badge}</Text></View> : null}
        </View>
        {caption ? <Text className="text-[13px] font-semibold text-text-secondary" numberOfLines={1}>{caption}</Text> : null}
      </View>
      <ChevronRight size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

/**
 * A slim warning across the top while the device has no network (task 221):
 * entries cannot save, so it says so before anyone presses Save. It slides
 * away when the connection returns.
 */
export function OfflineBar() {
  const online = useOnline();
  const insets = useSafeAreaInsets();
  return (
    <Reveal open={!online}>
      <View accessibilityRole="alert" accessibilityLiveRegion="assertive" className="flex-row items-center justify-center gap-2 px-4 py-2" style={{ backgroundColor: semantic.warningSoft, paddingTop: Platform.OS === 'web' ? 8 : insets.top + 6 }}>
        <WifiOff size={15} color={semantic.warning} />
        <Text style={{ color: semantic.warning, fontSize: 13, fontWeight: '700' }}>No internet. Entries can’t save until it’s back.</Text>
      </View>
    </Reveal>
  );
}

/** A short confirmation at the foot of a screen that fades after a moment. */
export function Toast({ text }: { text: string | null }) {
  // Rises 10 px and fades in; fades out with the last words still showing.
  const last = useRef(text);
  if (text) last.current = text;
  const { mounted, progress } = usePresence(Boolean(text), 220);
  if (!mounted || !last.current) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, bottom: 96, alignItems: 'center' }}>
      <Animated.View style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }], borderRadius: 16, backgroundColor: colors.textPrimary, paddingHorizontal: 16, paddingVertical: 12, maxWidth: 420 }} accessibilityLiveRegion="polite">
        <Text style={{ color: colors.textOnPrimary, fontSize: 13, fontWeight: '700' }}>{last.current}</Text>
      </Animated.View>
    </View>
  );
}
