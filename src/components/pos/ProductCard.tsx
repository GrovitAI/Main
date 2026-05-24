import { View, Text, Pressable, Image } from 'react-native';
import { Plus } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { Product } from '@/lib/pos/products-service';
import { formatCurrency } from '@/lib/pos/settlement-utils';

type ProductCardProps = {
  product: Product;
  onAdd: (product: Product) => void;
  disabled?: boolean;
};

export function ProductCard({ product, onAdd, disabled = false }: ProductCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => onAdd(product)}
      style={({ pressed }) => [
        {
          flex: 1,
          minHeight: 220,
          borderRadius: 22,
          padding: 12,
          backgroundColor: '#FFFFFF',
          shadowColor: '#101828',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.05,
          shadowRadius: 18,
          elevation: 2,
        },
        pressed && {
          transform: [{ translateY: -2 }],
          shadowOpacity: 0.08,
          shadowOffset: { width: 0, height: 10 },
          shadowRadius: 24,
        }
      ]}
    >
      <LinearGradient
        colors={['#FFFFFF', '#FBFDFF']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 22 }}
      />
      
      {/* Premium Dessert Café POS Image Placeholder Box */}
      <View style={{ height: 90, width: '100%', backgroundColor: '#F5F8FC', marginBottom: 12, borderRadius: 12 }} />
      
      {/* Content */}
      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        <Text
          style={{ fontSize: 15, fontWeight: '600', lineHeight: 18, marginBottom: 6, color: '#005FC0' }}
          numberOfLines={2}
        >
          {product.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#0066CC' }}>
            {formatCurrency(product.price)}
          </Text>
          <View style={{ width: 38, height: 38, borderRadius: 12, shadowColor: '#0066CC', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 3 }}>
            <LinearGradient
              colors={['#0D6CE0', '#0B59B4']}
              style={{ width: '100%', height: '100%', borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}
            >
              <Plus color="#FFFFFF" size={20} strokeWidth={2.5} />
            </LinearGradient>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
