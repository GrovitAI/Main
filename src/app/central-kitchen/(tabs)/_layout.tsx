import { hoverScope } from '@/lib/pos/web-hover';
import { useEffect, useState } from 'react';
import { Tabs, router } from 'expo-router';
import { FlatList, Image, Platform, Pressable, View, type ImageSourcePropType, type ViewStyle } from 'react-native';
import { Text } from '@/components/ui/Typography';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Home, Boxes, PackageCheck, Store, Truck, History, BarChart3, ClipboardCheck, Receipt, Ellipsis, PanelLeft, PanelLeftClose, Plus, ShieldCheck, Lock, type LucideIcon } from 'lucide-react-native';
import { colors } from '@/lib/pos/brand';
import { useResponsive } from '@/lib/pos/useResponsive';
import { PhoneWebFrame } from '@/components/phone/PhoneWebFrame';
import { SidebarSurface } from '@/components/ui/SidebarSurface';
import { useKitchenAccess } from '@/lib/pos/use-kitchen-store';
import { Sheet, SheetRow, toneColor } from '@/components/kitchen/ui';
import { recordActions, stockActions } from '@/components/kitchen/record-actions';
import { dayText } from '@/lib/pos/kitchen-access-utils';

type KitchenTab = { name: string; label: string; icon: LucideIcon };

/** Direct sections on the rail; party lists, attendance and invoices share More on a phone. */
export const KITCHEN_TABS: readonly KitchenTab[] = [
  { name: 'home', label: 'Home', icon: Home },
  { name: 'analytics', label: 'Analytics', icon: BarChart3 },
  { name: 'items', label: 'Raw materials', icon: Boxes },
  { name: 'finished-goods', label: 'Finished goods', icon: PackageCheck },
  { name: 'attendance', label: 'Attendance', icon: ClipboardCheck },
  { name: 'branches', label: 'Branches', icon: Store },
  { name: 'invoices', label: 'Invoices', icon: Receipt },
  { name: 'vendors', label: 'Vendors', icon: Truck },
  { name: 'history', label: 'History', icon: History },
];
/** A phone's bar (task 228): Home and Analytics, the + that records, Stock, and More. History opens from Home's header. */
const phoneTabs = KITCHEN_TABS.filter(tab => ['home', 'analytics', 'items'].includes(tab.name)).map(tab => tab.name === 'items' ? { ...tab, label: 'Stock' } : tab);
const moreTabs = ['branches', 'vendors', 'invoices', 'attendance'].flatMap(name => KITCHEN_TABS.filter(tab => tab.name === name));
const MORE_CAPTIONS: Record<string, string> = { branches: 'Who owes the kitchen', vendors: 'Who the kitchen owes', invoices: 'Branch invoices and payments', attendance: 'Daily register and month' };

/** Sections a login has no use for are left off the navigation; the database refuses their data anyway. */
function useTabAllowed(): (name: string) => boolean {
  const { can } = useKitchenAccess();
  return (name) => {
    if (name === 'analytics') return can('reports.view');
    if (name === 'invoices') return can('invoices.create') || can('invoices.receive') || can('invoices.cancel');
    if (name === 'attendance') return can('attendance.mark') || can('setup.roster');
    return true;
  };
}

const leLabanLogo: ImageSourcePropType = require('@/../assets/images/le-leban-logo.png');
type RailWebStyle = ViewStyle & { transition?: string };

/**
 * True while the person is moving through the page with the keyboard. A mouse
 * or touch press switches it off, so a clicked tab never keeps a focus outline;
 * Tab switches it back on and the outline returns for keyboard users.
 */
let keyboardMode = false;
const keyboardModeListeners = new Set<(on: boolean) => void>();
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const set = (on: boolean): void => { if (keyboardMode === on) return; keyboardMode = on; keyboardModeListeners.forEach(fn => fn(on)); };
  window.addEventListener('keydown', event => { if (event.key === 'Tab' || event.key.startsWith('Arrow')) set(true); }, true);
  window.addEventListener('pointerdown', () => set(false), true);
}
function useKeyboardMode(): boolean {
  const [on, setOn] = useState(keyboardMode);
  useEffect(() => { keyboardModeListeners.add(setOn); return () => { keyboardModeListeners.delete(setOn); }; }, []);
  return on;
}

/** Hover and keyboard-focus state for a rail control, tracked here because a class name hides Pressable's style callback. */
function useRailRim() {
  const keyboard = useKeyboardMode();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  return {
    hovered,
    outline: focused && keyboard,
    handlers: { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false), onFocus: () => setFocused(true), onBlur: () => setFocused(false) },
  };
}

function TabButton({ tab, focused, onPress, rail, expanded = true }: { tab: KitchenTab; focused: boolean; onPress: () => void; rail: boolean; expanded?: boolean }) {
  const { isDesktop } = useResponsive();
  const compact = Platform.OS === 'web' && isDesktop && rail;
  const Icon = tab.icon;
  const color = rail ? focused ? colors.textOnPrimary : colors.sidebarTextMuted : focused ? colors.primary : colors.textSecondary;
  const rim = useRailRim();
  // On the rail the selection is a soft fill that fades in, with no edge; the
  // outline appears only for keyboard focus.
  const railStyle: RailWebStyle | undefined = rail ? {
    backgroundColor: focused ? colors.kitchenSidebarSelected : rim.hovered ? colors.sidebarHover : 'transparent',
    borderColor: rim.outline ? colors.textOnPrimary : 'transparent',
    ...(Platform.OS === 'web' ? { transition: 'background-color 180ms cubic-bezier(0.2, 0, 0, 1), border-color 120ms ease-out' } : {}),
  } : undefined;
  return (
    <Pressable
      onPress={onPress}
      {...(rail ? rim.handlers : {})}
      style={railStyle}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      aria-selected={focused}
      accessibilityLabel={tab.label}
      className={`items-center active:opacity-80 ${rail ? 'overflow-hidden rounded-[14px] border' : `rounded-xl focus:border focus:border-primary ${focused ? '' : 'hover:bg-surface-tint'}`} ${compact ? `min-h-12 w-full flex-row py-1.5 ${expanded ? 'justify-start gap-2 px-2' : 'justify-center'}` : `${rail ? 'w-[72px]' : 'flex-1'} min-h-[52px] justify-center py-1.5`}`}
    >
      <View className={`items-center justify-center rounded-xl ${compact ? 'h-7 w-7' : `h-[30px] w-11 ${focused && !rail ? 'bg-accent-soft' : ''}`}`}>
        <Icon size={compact ? 18 : 21} color={color} />
      </View>
      {!compact || expanded ? <Text className={`${focused ? 'font-extrabold' : 'font-semibold'} ${compact ? 'text-[13px]' : 'mt-0.5 text-xs'}`} style={{ color, textAlign: compact ? 'left' : 'center' }} numberOfLines={rail && !compact ? 2 : 1}>
        {tab.label}
      </Text> : null}
    </Pressable>
  );
}

type BarProps = Pick<BottomTabBarProps, 'state' | 'navigation'>;

/**
 * The phone's bar (task 228): a rounded bar floating on the canvas, with a raised + in the middle
 * that opens the four entries from any tab, and More for the sections that do not fit. The bar
 * sits in its own band of canvas, tall enough to hold the raised +, so every part of the + is
 * inside the bar's bounds and takes a tap on Android too.
 */
function BottomBar({ state, navigation }: BarProps) {
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<'record' | 'more' | null>(null);
  const access = useKitchenAccess();
  const allowed = useTabAllowed();
  const records = recordActions(access.can);
  const moves = stockActions(access.can);
  const phone = phoneTabs.filter((tab) => allowed(tab.name));
  const more = moreTabs.filter((tab) => allowed(tab.name));
  const activeName = state.routes[state.index]?.name;
  const moreActive = more.some(tab => tab.name === activeName);
  const openTab = (name: string): void => {
    const route = state.routes.find(entry => entry.name === name);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (event.defaultPrevented) return;
    setSheet(null);
    if (activeName !== route.name) navigation.navigate(route.name, route.params);
  };
  const go = (href: string): void => { setSheet(null); router.push(href as never); };
  const tab = (t: KitchenTab) => {
    // History is reached from Home, and Finished goods shares Stock.
    const focused = activeName === t.name || (t.name === 'items' && activeName === 'finished-goods') || (t.name === 'home' && activeName === 'history');
    return <TabButton key={t.name} tab={t} focused={focused} rail={false} onPress={() => openTab(t.name)} />;
  };
  const lockedThrough = access.access.lockedThrough;
  return (
    <View className="bg-kitchen-canvas" style={{ paddingHorizontal: 14, paddingTop: 34, paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 10 : 8) }}>
      <View className="h-16 flex-row items-center rounded-[30px] border border-border-soft bg-surface-elevated px-1.5">
        {phone.filter(t => t.name !== 'items').map(tab)}
        {records.length + moves.length > 0 ? (
          <View className="flex-1 items-center">
            <Pressable accessibilityRole="button" accessibilityLabel="Record an entry" accessibilityState={{ expanded: sheet === 'record' }} onPress={() => setSheet('record')}
              style={{ marginTop: -34 }} className="h-[60px] w-[60px] items-center justify-center rounded-full border-[5px] border-kitchen-canvas bg-primary hover:bg-primary-deep active:bg-primary-deep">
              <Plus size={26} color={colors.textOnPrimary} strokeWidth={2.6} />
            </Pressable>
          </View>
        ) : null}
        {phone.filter(t => t.name === 'items').map(tab)}
        {more.length > 0 || access.isOwner ? (
          <Pressable accessibilityRole="button" accessibilityLabel="More kitchen sections" accessibilityState={{ expanded: sheet === 'more' }} onPress={() => setSheet('more')}
            className="min-h-[52px] flex-1 items-center justify-center rounded-xl py-1.5 hover:bg-surface-tint active:opacity-60 focus:border focus:border-primary">
            <View className={'h-[30px] w-11 items-center justify-center rounded-xl ' + (moreActive ? 'bg-accent-soft' : '')}><Ellipsis size={21} color={moreActive ? colors.primary : colors.textSecondary} /></View>
            <Text className={`mt-0.5 text-xs ${moreActive ? 'font-extrabold' : 'font-semibold'}`} style={{ color: moreActive ? colors.primary : colors.textSecondary }}>More</Text>
          </Pressable>
        ) : null}
      </View>
      <Sheet visible={sheet === 'record'} onClose={() => setSheet(null)} title="Record">
        {records.map(r => <SheetRow key={r.key} icon={r.icon} iconColor={toneColor[r.tone]} label={r.label} caption={r.caption} onPress={() => go(r.href)} />)}
        {moves.map(r => <SheetRow key={r.key} icon={r.icon} iconColor={toneColor[r.tone]} label={r.label} caption={r.caption} onPress={() => go(r.href)} />)}
        {lockedThrough ? (
          <View className="mt-2 flex-row items-center gap-2 rounded-2xl bg-surface-tint px-3.5 py-3">
            <Lock size={15} color={colors.textSecondary} />
            <Text className="flex-1 text-[13px] font-semibold text-text-secondary">Entries up to {dayText(lockedThrough)} are locked.</Text>
          </View>
        ) : null}
      </Sheet>
      <Sheet visible={sheet === 'more'} onClose={() => setSheet(null)} title="More">
        {more.map(t => <SheetRow key={t.name} icon={t.icon} label={t.label} caption={MORE_CAPTIONS[t.name]} selected={activeName === t.name} onPress={() => openTab(t.name)} />)}
        {access.isOwner ? <SheetRow icon={ShieldCheck} label="Team and day lock" caption="Logins, permissions, locks" badge="Owner" onPress={() => go('/central-kitchen/team')} /> : null}
      </Sheet>
    </View>
  );
}

function Rail({ state, navigation }: BarProps) {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const compact = Platform.OS === 'web' && isDesktop;
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const pinRim = useRailRim();
  const allowed = useTabAllowed();
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const expanded = !compact || pinned || hovered || keyboardFocused;
  useEffect(() => {
    if (!compact) return;
    const rail = document.getElementById('kitchen-navigation-rail');
    const shell = document.getElementById('kitchen-navigation-shell');
    if (!rail || !shell) return;
    let keyboardNavigation = false;
    const onMouseEnter = (): void => setHovered(true);
    const onMouseLeave = (): void => setHovered(false);
    const onFocusIn = (): void => setKeyboardFocused(keyboardNavigation);
    const onFocusOut = (event: FocusEvent): void => {
      if (!(event.relatedTarget instanceof Node) || !rail.contains(event.relatedTarget)) setKeyboardFocused(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return;
      keyboardNavigation = true;
      if (rail.contains(document.activeElement)) setKeyboardFocused(true);
    };
    const onPointerDown = (): void => {
      keyboardNavigation = false;
      setKeyboardFocused(false);
    };
    rail.addEventListener('focusin', onFocusIn);
    rail.addEventListener('focusout', onFocusOut);
    shell.addEventListener('mouseenter', onMouseEnter);
    shell.addEventListener('mouseleave', onMouseLeave);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      rail.removeEventListener('focusin', onFocusIn);
      rail.removeEventListener('focusout', onFocusOut);
      shell.removeEventListener('mouseenter', onMouseEnter);
      shell.removeEventListener('mouseleave', onMouseLeave);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [compact]);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = (): void => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  const drawerStyle: RailWebStyle = {
    paddingTop: insets.top + 12,
    paddingBottom: insets.bottom,
    ...(compact ? {
      width: expanded ? 176 : 64,
      transition: reducedMotion ? 'none' : 'width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    } : {}),
  };
  return (
    <View nativeID="kitchen-navigation-shell" testID="kitchen-navigation-shell"
      className={`relative shrink-0 ${compact ? `${pinned ? 'w-44' : 'w-16'} z-50` : 'w-[88px]'}`}>
    <View {...hoverScope} nativeID="kitchen-navigation-rail" testID="kitchen-navigation-rail" className={`items-center gap-1.5 overflow-hidden px-2 ${compact ? 'absolute inset-y-0 left-0' : 'relative h-full w-[88px]'}`} style={drawerStyle}>
      <SidebarSurface />
      <View className="h-[68px] w-full items-center justify-center border-b border-sidebar-divider pb-3">
        <Image source={leLabanLogo} accessibilityLabel="Le Laban logo" resizeMode="contain"
          style={{ height: compact && expanded ? 52 : 32, width: compact && expanded ? 84 : 32 }} />
      </View>
      <FlatList
        className="min-h-0 w-full flex-1"
        data={KITCHEN_TABS.filter((tab) => allowed(tab.name))}
        keyExtractor={tab => tab.name}
        extraData={`${state.index}-${expanded}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 6 }}
        ItemSeparatorComponent={() => <View className="h-1.5" />}
        renderItem={({ item: tab }) => {
          const route = state.routes.find(entry => entry.name === tab.name);
          if (!route) return null;
          const focused = state.routes[state.index]?.name === tab.name;
          return <TabButton tab={tab} focused={focused} rail expanded={expanded} onPress={() => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          }} />;
        }}
      />
      {compact ? <View className="w-full border-t border-sidebar-divider">
        {expanded ? <Text className="px-2 pt-2 text-xs font-semibold text-sidebar-muted" numberOfLines={1}>Central Kitchen</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={pinned ? 'Unpin kitchen sidebar' : 'Pin kitchen sidebar open'}
          accessibilityState={{ selected: pinned }} onPress={() => setPinned(value => !value)}
          {...pinRim.handlers}
          style={{ backgroundColor: pinRim.hovered ? colors.sidebarHover : 'transparent', borderColor: pinRim.outline ? colors.textOnPrimary : 'transparent' }}
          className="min-h-12 w-full flex-row items-center justify-center gap-2 rounded-xl border active:opacity-80">
          {pinned ? <PanelLeftClose size={18} color={colors.sidebarTextMuted} /> : <PanelLeft size={18} color={colors.sidebarTextMuted} />}
          {expanded ? <Text className="text-xs font-semibold text-sidebar-muted">{pinned ? 'Unpin sidebar' : 'Pin sidebar'}</Text> : null}
        </Pressable>
      </View> : null}
    </View>
    </View>
  );
}

/**
 * Direct sections on the rail. Phones show Home, Analytics, the + menu, Stock and More (task 228),
 * with Branches, Vendors, Invoices, Attendance and the owner's Team and day lock in More.
 */
export default function KitchenTabsLayout() {
  const { isTablet } = useResponsive();
  return (
    <PhoneWebFrame active={!isTablet}>
      <Tabs
        // Task 250: a tab out of view stops redrawing (store reloads no longer re-render hidden tabs).
        screenOptions={{ headerShown: false, freezeOnBlur: true, sceneStyle: { backgroundColor: colors.kitchenCanvas } }}
        tabBar={(props) =>
          isTablet ? null : <BottomBar {...props} />
        }
        {...(isTablet
          ? {
              layout: ({ children, state, navigation }: BarProps & { children: React.ReactNode }) => (
                <View style={{ flex: 1, flexDirection: 'row' }}>
                  <Rail state={state} navigation={navigation} />
                  <View style={{ flex: 1 }}>{children}</View>
                </View>
              ),
            }
          : {})}
      >
        {KITCHEN_TABS.map((tab) => (
          <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.label }} />
        ))}
      </Tabs>
    </PhoneWebFrame>
  );
}
