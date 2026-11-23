import { useLocalSearchParams } from 'expo-router';
import { QrMenuPage } from '@/components/qr/QrMenuPage';

/** Task 331: where a table's QR code leads. Public: no sign-in, outside the app's own screens. */
export default function TableMenuRoute() {
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typeof params.code === 'string' ? params.code.toLowerCase() : '';
  return <QrMenuPage code={code} />;
}
