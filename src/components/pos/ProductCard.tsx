import { View, Text, Pressable } from 'react-native';
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
          minHeight: 200,
          borderRadius: 18,
          padding: 10,
          backgroundColor: '#FFFFFF',
          shadowColor: '#101828',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.04,
          shadowRadius: 12,
          elevation: 1,
        },
        pressed && {
          transform: [{ translateY: -1.5 }],
          shadowOpacity: 0.06,
          shadowOffset: { width: 0, height: 8 },
          shadowRadius: 18,
        }
      ]}
    >
      <LinearGradient
        colors={['#FFFFFF', '#FBFDFF']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 18 }}
      />
      
      {/* Premium Dessert Café POS Image Placeholder Box */}
      <View style={{ height: 80, width: '100%', backgroundColor: '#F5F8FC', marginBottom: 10, borderRadius: 10 }} />
      
      {/* Content */}
      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        <Text
          style={{ fontSize: 15, fontWeight: '600', lineHeight: 18, letterSpacing: -0.1, marginBottom: 4, color: '#013b8c' }}
          numberOfLines={2}
        >
          {product.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#0066CC' }}>
            {formatCurrency(product.price)}
          </Text>
          <View style={{ width: 34, height: 34, borderRadius: 10, shadowColor: '#0066CC', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.14, shadowRadius: 12, elevation: 2 }}>
            <LinearGradient
              colors={['#0D6CE0', '#0B59B4']}
              style={{ width: '100%', height: '100%', borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
            >
              <Plus color="#FFFFFF" size={18} strokeWidth={2.5} />
            </LinearGradient>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
