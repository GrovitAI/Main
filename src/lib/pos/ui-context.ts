import React, { createContext, useContext, useState } from 'react';

/**
 * UIContext — thin global signal layer for UI state that must cross
 * the screen → layout boundary (e.g. hiding the tab bar when an
 * inline editor is open inside a tab screen).
 */

interface UIContextValue {
  /** When true the floating tab bar should hide itself. */
  tabBarHidden: boolean;
  setTabBarHidden: (hidden: boolean) => void;
}

export const UIContext = createContext<UIContextValue>({
  tabBarHidden: false,
  setTabBarHidden: () => undefined,
});

export function useUIContext(): UIContextValue {
  return useContext(UIContext);
}

export function useTabBarHidden(hidden: boolean): void {
  const { setTabBarHidden } = useUIContext();
  React.useEffect(() => {
    setTabBarHidden(hidden);
    return () => {
      // restore on unmount
      setTabBarHidden(false);
    };
  }, [hidden, setTabBarHidden]);
}
