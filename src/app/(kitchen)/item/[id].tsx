import { useLocalSearchParams } from 'expo-router';
import { KScreen } from '@/components/kitchen/ui';
import { ItemDetail } from '@/components/kitchen/ItemDetail';

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <KScreen>
      <ItemDetail itemId={id} standalone />
    </KScreen>
  );
}
