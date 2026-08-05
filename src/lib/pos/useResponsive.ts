import { useWindowDimensions } from 'react-native';

type Breakpoint = 'phone' | 'tablet' | 'desktop';

type ResponsiveInfo = {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
};

export const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
} as const;

export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions();
  const breakpoint: Breakpoint =
    width >= BREAKPOINTS.desktop
      ? 'desktop'
      : width >= BREAKPOINTS.tablet
        ? 'tablet'
        : 'phone';

  return {
    width,
    height,
    breakpoint,
    isPhone: breakpoint === 'phone',
    isTablet: breakpoint === 'tablet' || breakpoint === 'desktop',
    isDesktop: breakpoint === 'desktop',
  };
}

/** Responsive padding: 16px on phone, 24px on tablet+ */
export const RESPONSIVE_PADDING = { phone: 16, tablet: 24 } as const;

export function getResponsivePadding(isPhone: boolean): number {
  return isPhone ? RESPONSIVE_PADDING.phone : RESPONSIVE_PADDING.tablet;
}
