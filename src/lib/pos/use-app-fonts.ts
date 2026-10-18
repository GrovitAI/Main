import { useFonts, type FontSource } from 'expo-font';
import { typography } from '@/lib/pos/brand';

const sources: Record<string, FontSource> = {
  [typography.faces.regular]: require('../../../public/fonts/SourceSans3-Regular.ttf'),
  [typography.faces.medium]: require('../../../public/fonts/SourceSans3-Medium.ttf'),
  [typography.faces.semibold]: require('../../../public/fonts/SourceSans3-SemiBold.ttf'),
  [typography.faces.bold]: require('../../../public/fonts/SourceSans3-Bold.ttf'),
};

/** Static local faces also work in Expo Go and existing native development builds. */
export function useAppFonts(): { loaded: boolean; error: Error | null } {
  const [loaded, error] = useFonts(sources);
  return { loaded, error };
}
