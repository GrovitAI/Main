import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Platform, Pressable, ScrollView, Text, View, type ImageStyle, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  BarChart3,
  BookOpen,
  Boxes,
  ChevronDown,
  ChevronRight,
  Database,
  PanelLeft,
  PanelLeftClose,
  RefreshCw,
  ShieldAlert,
  Tag,
  Trash2,
  TrendingUp,
  Truck,
  User,
  type LucideIcon,
} from 'lucide-react-native';

import { colors } from '@/lib/pos/brand';
import type { InventoryTabName } from './inventory-types';

 
export const leLabanLogo = require('@/../assets/images/le-leban-logo.png') as number;

// Sidebar gradient / accent colours have no brand token yet (see report).
export const SIDEBAR_GRADIENT = ['#0251b8', '#013b8c', '#012f70'] as const;
export const ACTIVE_ITEM_GRADIENT = ['rgba(58,120,220,0.95)', 'rgba(35,95,190,0.95)'] as const;
const SIDEBAR_FOOTER_BG = '#002040';
const ONLINE_DOT = '#10b981';
const WHITE_80 = 'rgba(255, 255, 255, 0.8)';
const WHITE_75 = 'rgba(255, 255, 255, 0.75)';
const WHITE_70 = 'rgba(255, 255, 255, 0.7)';
const WHITE_60 = 'rgba(255, 255, 255, 0.6)';

export const SIDEBAR_COLLAPSED_W = 52;
export const SIDEBAR_EXPANDED_W = 180;

export interface SidebarNavItem {
  id: InventoryTabName;
  label: string;
  icon: LucideIcon;
}

export const MASTER_SUB_ITEMS: SidebarNavItem[] = [
  { id: 'materials', label: 'Raw Materials', icon: Boxes },
  { id: 'suppliers', label: 'Suppliers', icon: User },
  { id: 'units', label: 'Units', icon: Database },
  { id: 'categories', label: 'Categories', icon: Tag },
];

export const MAIN_NAV_ITEMS: SidebarNavItem[] = [
  { id: 'purchases', label: 'Purchases', icon: Truck },
  { id: 'wastage', label: 'Wastage', icon: Trash2 },
  { id: 'transfers', label: 'Transfers', icon: RefreshCw },
  { id: 'recipes', label: 'Recipes', icon: BookOpen },
  { id: 'reports', label: 'Reports', icon: TrendingUp },
  { id: 'alerts', label: 'Alerts', icon: ShieldAlert },
];

export const SIDEBAR_ITEMS: SidebarNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'materials', label: 'Inventory', icon: Boxes },
  { id: 'purchases', label: 'Purchases', icon: Truck },
  { id: 'suppliers', label: 'Suppliers', icon: User },
  { id: 'wastage', label: 'Wastage', icon: Trash2 },
  { id: 'transfers', label: 'Transfers', icon: RefreshCw },
  { id: 'recipes', label: 'Recipes', icon: BookOpen },
  { id: 'reports', label: 'Reports', icon: TrendingUp },
  { id: 'alerts', label: 'Alerts', icon: ShieldAlert },
  { id: 'units', label: 'Units', icon: Database },
  { id: 'categories', label: 'Categories', icon: Tag },
];

/**
 * Web-only CSS properties (transition, whiteSpace, ...) typed as React Native
 * styles. One helper per style family so no call site has to widen to `any`.
 */
export function webStyle(style: Record<string, unknown>): ViewStyle {
  return style as unknown as ViewStyle;
}

function webTextStyle(style: Record<string, unknown>): TextStyle {
  return style as unknown as TextStyle;
}

function webImageStyle(style: Record<string, unknown>): ImageStyle {
  return style as unknown as ImageStyle;
}

interface PressableStateLike {
  hovered?: boolean;
  pressed: boolean;
}

export function SidebarDecoration() {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 180, opacity: 0.08, pointerEvents: 'none', overflow: 'hidden' }}>
      <View style={{ position: 'absolute', bottom: -60, left: -30, height: 150, width: 150, borderRadius: 75, borderWidth: 1, borderColor: colors.background }} />
      <View style={{ position: 'absolute', bottom: -30, right: -60, height: 120, width: 120, borderRadius: 60, borderWidth: 1, borderColor: colors.background }} />
      <View style={{ position: 'absolute', bottom: 30, left: -45, height: 130, width: 130, borderRadius: 65, borderWidth: 2, borderColor: colors.background }} />
    </View>
  );
}

export function SidebarLabel({
  expanded,
  children,
  style,
}: {
  expanded: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  if (Platform.OS !== 'web') {
    return expanded ? <>{children}</> : null;
  }
  const flattened: ViewStyle = style
    ? (Array.isArray(style) ? Object.assign({}, ...style) : (style as ViewStyle))
    : {};
  const currentMarginLeft = flattened.marginLeft ?? 0;
  const currentMarginRight = flattened.marginRight ?? 0;

  const { marginLeft: _ml, marginRight: _mr, flex: _flex, ...cleanedStyle } = flattened;

  return (
    <View
      style={[
        { overflow: 'hidden' },
        webStyle({
          maxWidth: expanded ? 200 : 0,
          opacity: expanded ? 1 : 0,
          marginLeft: expanded ? currentMarginLeft : 0,
          marginRight: expanded ? currentMarginRight : 0,
          transition:
            'max-width 240ms cubic-bezier(0.4,0,0.2,1), opacity 180ms ease, margin-left 240ms cubic-bezier(0.4,0,0.2,1), margin-right 240ms cubic-bezier(0.4,0,0.2,1)',
        }),
        cleanedStyle,
      ]}
    >
      {children}
    </View>
  );
}

const NOWRAP = webTextStyle({ whiteSpace: 'nowrap' });

interface InventorySidebarProps {
  activeTab: InventoryTabName;
  onSelectTab: (tab: InventoryTabName) => void;
  isMasterExpanded: boolean;
  onToggleMaster: () => void;
  sidebarPinned: boolean;
  onTogglePinned: () => void;
  sidebarHovered: boolean;
  onHoverChange: (hovered: boolean) => void;
  topInset: number;
}

/** Desktop / tablet navigation rail that auto-collapses to icons. */
export function InventorySidebar({
  activeTab,
  onSelectTab,
  isMasterExpanded,
  onToggleMaster,
  sidebarPinned,
  onTogglePinned,
  sidebarHovered,
  onHoverChange,
  topInset,
}: InventorySidebarProps) {
  const sidebarExpanded = sidebarPinned || sidebarHovered;

  // On web: CSS transition handles animation. On native: Animated fallback.
  const sidebarAnim = useRef(new Animated.Value(SIDEBAR_COLLAPSED_W)).current;
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Animated.timing(sidebarAnim, {
      toValue: sidebarExpanded ? SIDEBAR_EXPANDED_W : SIDEBAR_COLLAPSED_W,
      duration: 240,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: false,
    }).start();
  }, [sidebarExpanded, sidebarAnim]);

  const hoverProps =
    Platform.OS === 'web'
      ? ({ onMouseEnter: () => onHoverChange(true), onMouseLeave: () => onHoverChange(false) } as Record<string, () => void>)
      : {};

  const mainItemStyle = (isActive: boolean) => ({ hovered, pressed }: PressableStateLike): StyleProp<ViewStyle> => [
    {
      borderRadius: 12,
      marginHorizontal: 6,
      marginBottom: 4,
      height: 40,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingLeft: Platform.OS === 'web' ? 12 : sidebarExpanded ? 10 : 12,
      paddingRight: 4,
      gap: 0,
      overflow: 'hidden',
    },
    isActive && {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 3,
    },
    !isActive && hovered === true && { backgroundColor: 'rgba(255,255,255,0.08)' },
    pressed && { opacity: 0.85 },
  ];

  return (
    <Animated.View
      style={
        Platform.OS === 'web'
          ? webStyle({
              width: sidebarExpanded ? SIDEBAR_EXPANDED_W : SIDEBAR_COLLAPSED_W,
              minWidth: SIDEBAR_COLLAPSED_W,
              maxWidth: SIDEBAR_EXPANDED_W,
              overflow: 'hidden',
              flexShrink: 0,
              flexDirection: 'column',
              height: '100%',
              transition: 'width 240ms cubic-bezier(0.4,0,0.2,1)',
              willChange: 'width',
            })
          : {
              width: sidebarAnim,
              minWidth: SIDEBAR_COLLAPSED_W,
              maxWidth: SIDEBAR_EXPANDED_W,
              overflow: 'hidden',
              flexShrink: 0,
              flexDirection: 'column',
              height: '100%',
            }
      }
      {...hoverProps}
    >
      <LinearGradient colors={SIDEBAR_GRADIENT} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <SidebarDecoration />

      {/* Logo area — shrinks to just the icon when collapsed */}
      <View
        style={{
          width: '100%',
          alignSelf: 'stretch',
          paddingTop: Math.max(20, topInset + 8),
          paddingBottom: 16,
          paddingHorizontal: 10,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.12)',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        <Image
          source={leLabanLogo}
          style={[
            {
              height: sidebarExpanded ? 40 : 32,
              width: sidebarExpanded ? 64 : 32,
              resizeMode: 'contain',
              opacity: sidebarExpanded ? 0.96 : 0.9,
            },
            Platform.OS === 'web'
              ? webImageStyle({ transition: 'width 240ms cubic-bezier(0.4,0,0.2,1), height 240ms cubic-bezier(0.4,0,0.2,1)' })
              : null,
          ]}
          accessibilityLabel="Le Leban logo"
        />
        <SidebarLabel expanded={sidebarExpanded} style={{ alignItems: 'center' }}>
          <Text style={[{ fontSize: 10, fontWeight: '700', letterSpacing: -0.3, color: colors.textOnPrimary, marginTop: 4 }, NOWRAP]}>
            Inventory Center
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <View style={{ height: 4, width: 4, borderRadius: 2, backgroundColor: ONLINE_DOT }} />
            <Text style={[{ marginLeft: 4, fontSize: 9, fontWeight: '500', color: WHITE_80 }, NOWRAP]}>Online</Text>
          </View>
        </SidebarLabel>
      </View>

      {/* Nav items */}
      <ScrollView style={{ flex: 1, paddingTop: 8 }} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => onSelectTab('dashboard')}
          style={mainItemStyle(activeTab === 'dashboard')}
          accessibilityRole="tab"
          accessibilityLabel="Dashboard"
          accessibilityState={{ selected: activeTab === 'dashboard' }}
        >
          {activeTab === 'dashboard' && (
            <LinearGradient
              colors={ACTIVE_ITEM_GRADIENT}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12, zIndex: -1 }}
            />
          )}
          <BarChart3 size={16} color={activeTab === 'dashboard' ? colors.textOnPrimary : WHITE_75} />
          <SidebarLabel expanded={sidebarExpanded} style={{ marginLeft: 8 }}>
            <Text
              style={[
                { fontSize: 11, fontWeight: activeTab === 'dashboard' ? '600' : '500', color: activeTab === 'dashboard' ? colors.textOnPrimary : WHITE_80 },
                NOWRAP,
              ]}
            >
              Dashboard
            </Text>
          </SidebarLabel>
        </Pressable>

        {/* Master Collapsible Group Header */}
        <Pressable
          onPress={onToggleMaster}
          accessibilityRole="button"
          accessibilityLabel={isMasterExpanded ? 'Collapse master setup' : 'Expand master setup'}
          style={({ hovered, pressed }: PressableStateLike) => [
            {
              borderRadius: 12,
              marginHorizontal: 6,
              marginBottom: 4,
              height: 40,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-start',
              paddingLeft: Platform.OS === 'web' ? 12 : sidebarExpanded ? 10 : 12,
              paddingRight: 4,
              gap: 0,
            },
            hovered === true && { backgroundColor: 'rgba(255,255,255,0.08)' },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Database size={16} color={WHITE_75} />
          <SidebarLabel expanded={sidebarExpanded} style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginLeft: 8 }}>
            <Text style={[{ fontSize: 11, fontWeight: '500', color: WHITE_80, flex: 1 }, NOWRAP]}>Master Setup</Text>
            {isMasterExpanded ? (
              <ChevronDown size={12} color={WHITE_60} style={{ marginLeft: 4 }} />
            ) : (
              <ChevronRight size={12} color={WHITE_60} style={{ marginLeft: 4 }} />
            )}
          </SidebarLabel>
        </Pressable>

        {/* Master Sub-items */}
        {isMasterExpanded && (
          <View
            style={[
              {
                paddingLeft: sidebarExpanded ? 12 : 0,
                borderLeftWidth: sidebarExpanded ? 1 : 0,
                borderLeftColor: sidebarExpanded ? 'rgba(255,255,255,0.12)' : 'transparent',
                marginLeft: sidebarExpanded ? 22 : 0,
                marginBottom: 6,
                gap: 2,
              },
              Platform.OS === 'web' ? webStyle({ transition: 'padding-left 240ms, margin-left 240ms, border-color 240ms' }) : null,
            ]}
          >
            {MASTER_SUB_ITEMS.map((sub) => {
              const SubIcon = sub.icon;
              const isActive = activeTab === sub.id;
              return (
                <Pressable
                  key={sub.id}
                  onPress={() => onSelectTab(sub.id)}
                  accessibilityRole="tab"
                  accessibilityLabel={sub.label}
                  accessibilityState={{ selected: isActive }}
                  style={({ hovered, pressed }: PressableStateLike) => [
                    {
                      borderRadius: sidebarExpanded ? 10 : 8,
                      marginHorizontal: sidebarExpanded ? 0 : 6,
                      height: 32,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      paddingLeft: sidebarExpanded ? 8 : 14,
                      gap: 0,
                      marginBottom: 2,
                      overflow: 'hidden',
                    },
                    Platform.OS === 'web' ? webStyle({ transition: 'padding-left 240ms, margin 240ms' }) : null,
                    isActive && {
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.08,
                      shadowRadius: 6,
                      elevation: 2,
                    },
                    !isActive && hovered === true && {
                      backgroundColor: sidebarExpanded ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.07)',
                    },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  {isActive && (
                    <LinearGradient
                      colors={ACTIVE_ITEM_GRADIENT}
                      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: sidebarExpanded ? 10 : 8, zIndex: -1 }}
                    />
                  )}
                  <SubIcon size={12} color={isActive ? colors.textOnPrimary : WHITE_60} />
                  <SidebarLabel expanded={sidebarExpanded} style={{ marginLeft: 6 }}>
                    <Text style={[{ fontSize: 10.5, fontWeight: isActive ? '600' : '500', color: isActive ? colors.textOnPrimary : WHITE_70 }, NOWRAP]}>
                      {sub.label}
                    </Text>
                  </SidebarLabel>
                </Pressable>
              );
            })}
          </View>
        )}

        {/* Other main items */}
        {MAIN_NAV_ITEMS.map((item) => {
          const IconComponent = item.icon;
          const isActive = activeTab === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => onSelectTab(item.id)}
              style={mainItemStyle(isActive)}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: isActive }}
            >
              {isActive && (
                <LinearGradient
                  colors={ACTIVE_ITEM_GRADIENT}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 12, zIndex: -1 }}
                />
              )}
              <IconComponent size={16} color={isActive ? colors.textOnPrimary : WHITE_75} />
              <SidebarLabel expanded={sidebarExpanded} style={{ marginLeft: 8 }}>
                <Text style={[{ fontSize: 11, fontWeight: isActive ? '600' : '500', color: isActive ? colors.textOnPrimary : WHITE_80 }, NOWRAP]}>
                  {item.label}
                </Text>
              </SidebarLabel>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        onPress={onTogglePinned}
        style={({ hovered }: PressableStateLike) => ({
          padding: 12,
          minHeight: 44,
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.08)',
          backgroundColor: SIDEBAR_FOOTER_BG,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: hovered === true ? 1 : 0.85,
        })}
        accessibilityRole="button"
        accessibilityLabel={sidebarPinned ? 'Collapse sidebar' : 'Pin sidebar open'}
      >
        <SidebarLabel expanded={sidebarExpanded} style={{ marginRight: 6 }}>
          <Text style={[{ fontSize: 8, color: 'rgba(255,255,255,0.45)', fontWeight: '600', letterSpacing: 0.3 }, NOWRAP]}>
            {sidebarPinned ? 'PINNED OPEN' : 'AUTO-HIDE'}
          </Text>
        </SidebarLabel>
        {sidebarPinned ? <PanelLeftClose size={14} color="rgba(255,255,255,0.55)" /> : <PanelLeft size={14} color="rgba(255,255,255,0.55)" />}
      </Pressable>
    </Animated.View>
  );
}
