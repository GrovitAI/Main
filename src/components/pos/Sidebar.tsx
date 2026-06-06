import React, { useRef, useState, useEffect } from 'react';
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import {
  CakeSlice,
  Coffee,
  CupSoda,
  GlassWater,
  LayoutGrid,
  CirclePlus,
  Sandwich,
  PanelLeft,
  PanelLeftClose,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { Category } from '@/lib/pos/products-service';

// ─── Types ──────────────────────────────────────────────────────────────────────

type SidebarProps = {
  categories: Category[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string | null) => void;
};

type CategoryTabItem = {
  id: string | null;
  name: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────────

const COLLAPSED_W = 52;
const EXPANDED_W = 180;

/* eslint-disable @typescript-eslint/no-require-imports */
const leLabanLogo = require('@/../assets/images/le-leban-logo.png') as number;

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function getCategoryIcon(name: string, isActive: boolean) {
  const color = '#ffffff';
  const size = 18;
  const opacity = isActive ? 1 : 0.75;

  const lower = name.toLowerCase();
  if (lower === 'all') return <LayoutGrid color={color} size={size} style={{ opacity } as any} />;
  if (lower.includes('signature') || lower.includes('cake'))
    return <CakeSlice color={color} size={size} style={{ opacity } as any} />;
  if (lower.includes('kunafa')) return <Sandwich color={color} size={size} style={{ opacity } as any} />;
  if (lower.includes('cup') && !lower.includes('drink'))
    return <CupSoda color={color} size={size} style={{ opacity } as any} />;
  if (lower.includes('drink') || lower.includes('shake'))
    return <GlassWater color={color} size={size} style={{ opacity } as any} />;
  if (lower.includes('hot') || lower.includes('beverage'))
    return <Coffee color={color} size={size} style={{ opacity } as any} />;
  if (lower.includes('add')) return <CirclePlus color={color} size={size} style={{ opacity } as any} />;
  return <LayoutGrid color={color} size={size} style={{ opacity } as any} />;
}

// ─── Decoration ──────────────────────────────────────────────────────────────────

function SidebarDecoration() {
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 180,
        opacity: 0.08,
        pointerEvents: 'none',
        overflow: 'hidden',
      } as any}
    >
      <View style={{ position: 'absolute', bottom: -60, left: -30, height: 150, width: 150, borderRadius: 75, borderWidth: 1, borderColor: '#ffffff' }} />
      <View style={{ position: 'absolute', bottom: -30, right: -60, height: 120, width: 120, borderRadius: 60, borderWidth: 1, borderColor: '#ffffff' }} />
      <View style={{ position: 'absolute', bottom: 30, left: -45, height: 130, width: 130, borderRadius: 65, borderWidth: 2, borderColor: '#ffffff' }} />
    </View>
  );
}

// ─── Smooth label wrapper ─────────────────────────────────────────────────────────
// Always rendered in DOM — uses CSS opacity/maxWidth transition so text fades in
// instead of popping, eliminating the layout-jump stutter.

function SidebarLabel({
  expanded,
  children,
  style,
}: {
  expanded: boolean;
  children: React.ReactNode;
  style?: any;
}) {
  if (Platform.OS !== 'web') {
    // Native fallback: simple conditional render is fine
    return expanded ? <>{children}</> : null;
  }

  const flattened = style ? (Array.isArray(style) ? Object.assign({}, ...style) : style) : {};
  const currentMarginLeft = 'marginLeft' in flattened ? flattened.marginLeft : 0;
  const currentMarginRight = 'marginRight' in flattened ? flattened.marginRight : 0;

  const cleanedStyle = { ...flattened };
  delete cleanedStyle.marginLeft;
  delete cleanedStyle.marginRight;
  delete cleanedStyle.flex; // avoid flex layout thrashing during transition

  return (
    <View
      style={[
        {
          overflow: 'hidden',
        } as any,
        {
          maxWidth: expanded ? 200 : 0,
          opacity: expanded ? 1 : 0,
          marginLeft: expanded ? currentMarginLeft : 0,
          marginRight: expanded ? currentMarginRight : 0,
          transition: 'max-width 240ms cubic-bezier(0.4,0,0.2,1), opacity 180ms ease, margin-left 240ms cubic-bezier(0.4,0,0.2,1), margin-right 240ms cubic-bezier(0.4,0,0.2,1)',
        } as any,
        cleanedStyle,
      ]}
    >
      {children}
    </View>
  );
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────────

export function Sidebar({ categories, selectedCategoryId, onSelectCategory }: SidebarProps) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const expanded = pinned || hovered;

  // On web: use pure CSS transition on width (compositor-driven, no JS jank)
  // On native: use Animated.Value as fallback
  const widthAnim = React.useRef(new Animated.Value(COLLAPSED_W)).current;
  useEffect(() => {
    if (Platform.OS === 'web') return; // web uses CSS, not this
    Animated.timing(widthAnim, {
      toValue: expanded ? EXPANDED_W : COLLAPSED_W,
      duration: 240,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: false,
    }).start();
  }, [expanded, widthAnim]);

  const tabs: CategoryTabItem[] = [
    { id: null, name: 'All Items' },
    ...categories.map((c) => ({ id: c.id, name: c.name })),
  ];

  // Container style: CSS transition on web, Animated value on native
  const containerStyle =
    Platform.OS === 'web'
      ? ({
          width: expanded ? EXPANDED_W : COLLAPSED_W,
          minWidth: COLLAPSED_W,
          maxWidth: EXPANDED_W,
          overflow: 'hidden',
          flexShrink: 0,
          flexDirection: 'column',
          transition: 'width 240ms cubic-bezier(0.4,0,0.2,1)',
          willChange: 'width',
        } as any)
      : {
          width: widthAnim,
          minWidth: COLLAPSED_W,
          maxWidth: EXPANDED_W,
          overflow: 'hidden',
          flexShrink: 0,
          flexDirection: 'column' as const,
        };

  const Container = Platform.OS === 'web' ? View : Animated.View;

  return (
    <Container
      style={containerStyle}
      // Web hover listeners
      {...(Platform.OS === 'web'
        ? {
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
          }
        : {})}
    >
      {/* Background gradient */}
      <LinearGradient
        colors={['#0251b8', '#013b8c', '#012f70']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <SidebarDecoration />

      {/* Logo area */}
      <View
        style={{
          width: '100%',
          paddingTop: 22,
          paddingBottom: 20,
          paddingHorizontal: 10,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255,255,255,0.12)',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        <Image
          source={leLabanLogo}
          style={{
            height: expanded ? 52 : 32,
            width: expanded ? 84 : 32,
            resizeMode: 'contain',
            opacity: 0.96,
            ...(Platform.OS === 'web'
              ? { transition: 'width 240ms cubic-bezier(0.4,0,0.2,1), height 240ms cubic-bezier(0.4,0,0.2,1)' }
              : {}),
          } as any}
          accessibilityLabel="Le Leban logo"
        />
        <SidebarLabel expanded={expanded} style={{ alignItems: 'center' }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '700',
              letterSpacing: -0.3,
              color: '#FFFFFF',
              marginTop: 4,
              whiteSpace: 'nowrap',
            } as any}
          >
            Main Branch
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <View style={{ height: 4, width: 4, borderRadius: 2, backgroundColor: '#10b981' }} />
            <Text style={{ marginLeft: 4, fontSize: 9, fontWeight: '500', color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap' } as any}>
              Online
            </Text>
          </View>
        </SidebarLabel>
      </View>

      {/* Category list */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{
          gap: 6,
          paddingTop: 12,
          paddingHorizontal: 6,
          paddingBottom: 16,
        }}
      >
        {tabs.map((item) => {
          const isActive = selectedCategoryId === item.id;
          return (
            <Pressable
              key={item.id ?? 'all'}
              accessibilityRole="button"
              onPress={() => onSelectCategory(item.id)}
              style={({ hovered: h, pressed }: any) => [
                {
                  borderRadius: 14,
                  height: 44,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  paddingLeft: 12,
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
                !isActive && h && { backgroundColor: 'rgba(255,255,255,0.08)' },
                pressed && { opacity: 0.85 },
              ]}
            >
              {isActive && (
                <LinearGradient
                  colors={['rgba(58,120,220,0.95)', 'rgba(35,95,190,0.95)']}
                  style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    borderRadius: 14,
                  }}
                />
              )}

              {/* Icon — always visible */}
              <View style={{ width: 18, alignItems: 'center', flexShrink: 0 }}>
                {getCategoryIcon(item.name, isActive)}
              </View>

              {/* Label — fades in via CSS, no layout jump */}
              <SidebarLabel expanded={expanded} style={{ marginLeft: 10 }}>
                <Text
                  style={{
                    fontSize: 12,
                    lineHeight: 15,
                    fontWeight: isActive ? '600' : '500',
                    color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.8)',
                    whiteSpace: 'nowrap',
                  } as any}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
              </SidebarLabel>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Pin / collapse footer */}
      <Pressable
        onPress={() => setPinned(!pinned)}
        accessibilityLabel={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
        style={({ hovered: h }: any) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 12,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: 'rgba(255,255,255,0.08)',
          backgroundColor: '#002040',
          opacity: h ? 1 : 0.8,
        })}
      >
        <SidebarLabel expanded={expanded} style={{ marginRight: 6 }}>
          <Text
            style={{
              fontSize: 8,
              fontWeight: '700',
              letterSpacing: 0.4,
              color: 'rgba(255,255,255,0.4)',
              whiteSpace: 'nowrap',
            } as any}
          >
            {pinned ? 'PINNED' : 'AUTO-HIDE'}
          </Text>
        </SidebarLabel>
        {pinned ? (
          <PanelLeftClose size={14} color="rgba(255,255,255,0.5)" />
        ) : (
          <PanelLeft size={14} color="rgba(255,255,255,0.5)" />
        )}
      </Pressable>
    </Container>
  );
}
