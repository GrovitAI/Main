import { useLocalSearchParams } from 'expo-router';
import { KScreen } from '@/components/kitchen/ui';
import { PartyDetail } from '@/components/kitchen/PartyDetail';

export default function PartyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <KScreen>
      <PartyDetail partyId={id} standalone />
    </KScreen>
  );
}
