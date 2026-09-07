import React, { useState, useEffect } from 'react';
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type {
  ImageSourcePropType,
  ImageStyle,
  PressableStateCallbackType,
  StyleProp,
  TextStyle,
  ViewStyle,
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
  Sparkles,
  Layers,
  IceCream,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { Category } from '@/lib/pos/products-service';
import { colors } from '@/lib/pos/brand';

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

/** Web-only CSS properties layered on top of RN style types (ignored on native). */
type WebViewStyle = ViewStyle & { transition?: string; willChange?: string };
type WebTextStyle = TextStyle & { whiteSpace?: 'nowrap' };
type WebImageStyle = ImageStyle & { transition?: string };

// ─── Constants ───────────────────────────────────────────────────────────────────

const COLLAPSED_W = 52;
const EXPANDED_W = 180;

const leLabanLogo: ImageSourcePropType = require('@/../assets/images/le-leban-logo.png');

const NOWRAP: WebTextStyle = Platform.OS === 'web' ? { whiteSpace: 'nowrap' } : {};

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function getCategoryIcon(name: string, isActive: boolean) {
  const color = colors.textOnPrimary;
  const size = 18;
  const style: ViewStyle = { opacity: isActive ? 1 : 0.75 };

  const lower = name.toLowerCase().trim();
  if (lower === 'all' || lower === 'all items') return <LayoutGrid color={color} size={size} style={style} />;

  // Custom sweet-shop dessert mapping (.includes matches substring/variations robustly)
  if (lower.includes('signature')) return <Sparkles color={color} size={size} style={style} />;
  if (lower.includes('salankatia')) return <CakeSlice color={color} size={size} style={style} />;
  if (lower.includes('koushiri') || lower.includes('koshari')) return <Layers color={color} size={size} style={style} />;
  if (lower.includes('qashtuta')) return <IceCream color={color} size={size} style={style} />;

  // General fallbacks
  if (lower.includes('cake')) return <CakeSlice color={color} size={size} style={style} />;
  if (lower.includes('kunafa')) return <Sandwich color={color} size={size} style={style} />;
  if (lower.includes('cup') && !lower.includes('drink')) return <CupSoda color={color} size={size} style={style} />;
  if (lower.includes('drink') || lower.includes('shake')) return <GlassWater color={color} size={size} style={style} />;
  if (lower.includes('hot') || lower.includes('beverage')) return <Coffee color={color} size={size} style={style} />;
  if (lower.includes('add')) return <CirclePlus color={color} size={size} style={style} />;

  return <LayoutGrid color={color} size={size} style={style} />;
}

// ─── Decoration ──────────────────────────────────────────────────────────────────

function SidebarDecoration() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 180,
        opacity: 0.08,
        overflow: 'hidden',
      }}
    >
      <View style={{ position: 'absolute', bottom: -60, left: -30, height: 150, width: 150, borderRadius: 75, borderWidth: 1, borderColor: colors.textOnPrimary }} />
      <View style={{ position: 'absolute', bottom: -30, right: -60, height: 120, width: 120, borderRadius: 60, borderWidth: 1, borderColor: colors.textOnPrimary }} />
      <View style={{ position: 'absolute', bottom: 30, left: -45, height: 130, width: 130, borderRadius: 65, borderWidth: 2, borderColor: colors.textOnPrimary }} />
    </View>
  );
}

// ─── Smooth label wrapper ─────────────────────────────────────────────────────────

function SidebarLabel({
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

  const flattened: ViewStyle = StyleSheet.flatten(style) ?? {};
  const { marginLeft: currentMarginLeft = 0, marginRight: currentMarginRight = 0, flex: _flex, ...cleanedStyle } = flattened;

  const animatedStyle: WebViewStyle = {
    overflow: 'hidden',
    maxWidth: expanded ? 200 : 0,
    opacity: expanded ? 1 : 0,
    marginLeft: expanded ? currentMarginLeft : 0,
    marginRight: expanded ? currentMarginRight : 0,
    transition: 'max-width 200ms cubic-bezier(0.4,0,0.2,1), opacity 150ms ease, margin-left 200ms cubic-bezier(0.4,0,0.2,1), margin-right 200ms cubic-bezier(0.4,0,0.2,1)',
  };

  return <View style={[animatedStyle, cleanedStyle]}>{children}</View>;
}

// ─── Main Sidebar ─────────────────────────────────────────────────────────────────

export function Sidebar({ categories, selectedCategoryId, onSelectCategory }: SidebarProps) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const expanded = pinned || hovered;

  // On native: use Animated.Value as fallback
  const widthAnim = React.useRef(new Animated.Value(COLLAPSED_W)).current;
  useEffect(() => {
    if (Platform.OS === 'web') return;
    Animated.timing(widthAnim, {
      toValue: expanded ? EXPANDED_W : COLLAPSED_W,
      duration: 200,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: false,
    }).start();
  }, [expanded, widthAnim]);

  const tabs: CategoryTabItem[] = [
    { id: null, name: 'All Items' },
    ...categories.map((c) => ({ id: c.id, name: c.name })),
  ];

  const wrapperStyle: WebViewStyle = {
    width: pinned ? EXPANDED_W : COLLAPSED_W,
    minWidth: COLLAPSED_W,
    maxWidth: EXPANDED_W,
    flexShrink: 0,
    height: '100%',
    ...(Platform.OS === 'web'
      ? { transition: 'width 200ms cubic-bezier(0.4,0,0.2,1)', willChange: 'width', zIndex: 100 }
      : {}),
  };

  const drawerStyle: WebViewStyle | Animated.WithAnimatedObject<ViewStyle> =
    Platform.OS === 'web'
      ? {
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: expanded ? EXPANDED_W : COLLAPSED_W,
          minWidth: COLLAPSED_W,
          maxWidth: EXPANDED_W,
          flexDirection: 'column',
          height: '100%',
          transition: 'width 200ms cubic-bezier(0.4,0,0.2,1)',
          willChange: 'width',
          shadowColor: '#001b3a',
          shadowOffset: { width: 4, height: 0 },
          shadowOpacity: expanded && !pinned ? 0.25 : 0,
          shadowRadius: 20,
          elevation: expanded && !pinned ? 10 : 0,
        }
      : {
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: widthAnim,
          minWidth: COLLAPSED_W,
          maxWidth: EXPANDED_W,
          flexDirection: 'column',
          height: '100%',
        };

  const logoStyle: WebImageStyle = {
    height: expanded ? 52 : 32,
    width: expanded ? 84 : 32,
    resizeMode: 'contain',
    opacity: 0.96,
    ...(Platform.OS === 'web'
      ? { transition: 'width 200ms cubic-bezier(0.4,0,0.2,1), height 200ms cubic-bezier(0.4,0,0.2,1)' }
      : {}),
  };

  return (
    <Pressable
      accessible={false}
      focusable={false}
      style={wrapperStyle}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <Animated.View style={drawerStyle}>
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
          <Image source={leLabanLogo} style={logoStyle} accessibilityLabel="Le Leban logo" />
          <SidebarLabel expanded={expanded} style={{ alignItems: 'center' }}>
            <Text
              style={[
                {
                  fontSize: 11,
                  fontWeight: '700',
                  letterSpacing: -0.3,
                  color: colors.textOnPrimary,
                  marginTop: 4,
                },
                NOWRAP,
              ]}
            >
              Main Branch
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <View style={{ height: 4, width: 4, borderRadius: 2, backgroundColor: '#10b981' }} />
              <Text style={[{ marginLeft: 4, fontSize: 9, fontWeight: '500', color: 'rgba(255,255,255,0.8)' }, NOWRAP]}>
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
                accessibilityLabel={item.name}
                accessibilityState={{ selected: isActive }}
                onPress={() => onSelectCategory(item.id)}
                style={({ hovered: h, pressed }: PressableStateCallbackType): StyleProp<ViewStyle> => [
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
                    style={[
                      {
                        fontSize: 12,
                        lineHeight: 15,
                        fontWeight: isActive ? '600' : '500',
                        color: isActive ? colors.textOnPrimary : 'rgba(255,255,255,0.8)',
                      },
                      NOWRAP,
                    ]}
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
          accessibilityRole="button"
          accessibilityLabel={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
          accessibilityState={{ selected: pinned }}
          style={({ hovered: h }: PressableStateCallbackType): ViewStyle => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 44,
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
              style={[
                {
                  fontSize: 8,
                  fontWeight: '700',
                  letterSpacing: 0.4,
                  color: 'rgba(255,255,255,0.4)',
                },
                NOWRAP,
              ]}
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
      </Animated.View>
    </Pressable>
  );
}
