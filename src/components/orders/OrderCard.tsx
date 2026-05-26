import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Eye } from 'lucide-react-native';

import type { OpenOrderSummary } from '@/lib/pos/open-orders-service';
import type { OrderStatus } from '@/lib/pos/order-types';

// ─── Status configuration ────────────────────────────────────────────────────

export type StatusConfig = {
  label: string;
  bg: string;
  text: string;
};

export function getStatusConfig(status: OrderStatus): StatusConfig {
  switch (status) {
    case 'held':
      return { label: 'HELD', bg: '#FEF3C7', text: '#D97706' };
    case 'unpaid':
    case 'payment_pending':
      return { label: 'UNPAID', bg: '#FFF4EC', text: '#EA580C' };
    case 'in_kitchen':
      return { label: 'IN KITCHEN', bg: '#EFF6FF', text: '#0066b2' };
    case 'paid':
    case 'completed':
      return { label: status === 'completed' ? 'COMPLETED' : 'PAID', bg: '#F0FDF4', text: '#16A34A' };
    case 'cancelled':
      return { label: 'CANCELLED', bg: '#F5F5F5', text: '#9B2C2C' };
    case 'draft':
    case 'open':
    default:
      return { label: 'DRAFT', bg: '#F1F5F9', text: '#64748B' };
  }
}

// ─── Elapsed label ────────────────────────────────────────────────────────────

export function getElapsedLabel(createdAt: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatAmount(amount: number): string {
  if (amount <= 0) return '';
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

// ─── Bill identifier ──────────────────────────────────────────────────────────

export function getBillIdentifier(summary: OpenOrderSummary, orderIndex: number): string {
  const { order } = summary;
  if (order.bill_number) return `Bill #${order.bill_number}`;
  if (order.kot_number) return `KOT #${order.kot_number}`;
  if (order.token_number) return `Token #${order.token_number}`;
  return `Order #${orderIndex + 1}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

type OrderCardProps = {
  summary: OpenOrderSummary;
  orderIndex: number;
  isEditable: boolean;
  onViewOrder: () => void;
  onOpenBill: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export const OrderCard = memo(function OrderCard({
  summary,
  orderIndex,
  onOpenBill,
  onViewOrder,
}: OrderCardProps) {
  const { order, previewItems, remainingItemLines, itemCount, totalAmount } = summary;
  const statusConfig = getStatusConfig(order.status);
  const billId = getBillIdentifier(summary, orderIndex);
  const elapsed = getElapsedLabel(order.created_at);
  const amountStr = formatAmount(totalAmount);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${billId}`}
      onPress={onOpenBill}
      style={({ pressed, hovered }: any) => [
        {
          margin: 4,
          flex: 1,
          borderRadius: 12,
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: '#E8EFF6',
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.04,
          shadowRadius: 4,
          elevation: 1,
          overflow: 'hidden',
        },
        hovered && {
          shadowOpacity: 0.10,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
          borderColor: '#C7D9EC',
        },
        pressed && {
          transform: [{ scale: 0.98 }],
          shadowOpacity: 0.02,
          elevation: 0,
        },
      ]}
    >
      <View style={{ padding: 11, paddingBottom: 9 }}>

        {/* Row 1: Bill ID — Status pill — Elapsed */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 7 }}>
          <Text
            style={{ fontSize: 13, fontWeight: '700', color: '#0f2744', flex: 1, letterSpacing: -0.1 }}
            numberOfLines={1}
          >
            {billId}
          </Text>

          <View
            style={{
              borderRadius: 5,
              paddingHorizontal: 6,
              paddingVertical: 2,
              backgroundColor: statusConfig.bg,
            }}
          >
            <Text style={{ fontSize: 8.5, fontWeight: '800', color: statusConfig.text, letterSpacing: 0.6 }}>
              {statusConfig.label}
            </Text>
          </View>

          <Text style={{ fontSize: 10.5, fontWeight: '500', color: '#B0BAC4', minWidth: 22, textAlign: 'right' }}>
            {elapsed}
          </Text>
        </View>

        {/* Row 2: Item preview — compact, no background box */}
        <View style={{ marginBottom: 6 }}>
          {itemCount === 0 ? (
            <Text style={{ fontSize: 11.5, color: '#C4CDD6', fontStyle: 'italic' }}>No items</Text>
          ) : (
            <>
              {previewItems.map((item, idx) => (
                <Text
                  key={`${item.name}-${idx}`}
                  style={{ fontSize: 11.5, fontWeight: '400', color: '#4B5563', lineHeight: 16 }}
                  numberOfLines={1}
                >
                  <Text style={{ color: '#374151', fontWeight: '500' }}>{item.name}</Text>
                  <Text style={{ color: '#9CA3AF' }}> ×{item.quantity}</Text>
                </Text>
              ))}
              {remainingItemLines > 0 && (
                <Text style={{ fontSize: 10.5, fontWeight: '600', color: '#0066b2', marginTop: 1 }}>
                  +{remainingItemLines} more
                </Text>
              )}
            </>
          )}
        </View>

        {/* Row 3: Bottom action/amount bar */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View order details"
            onPress={(e) => {
              e.stopPropagation();
              onViewOrder();
            }}
            style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingVertical: 3,
                paddingHorizontal: 8,
                borderRadius: 6,
                backgroundColor: '#F8FAFC',
                borderWidth: 1,
                borderColor: '#E2E8F0',
              },
              hovered && {
                backgroundColor: '#F1F5F9',
                borderColor: '#CBD5E1',
              },
              pressed && {
                transform: [{ scale: 0.95 }],
                backgroundColor: '#E2E8F0',
              }
            ]}
          >
            <Eye size={12} color="#64748B" />
            <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B', letterSpacing: 0.2 }}>View</Text>
          </Pressable>

          {amountStr !== '' ? (
            <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#0f2744' }}>
              {amountStr}
            </Text>
          ) : (
            <View />
          )}
        </View>

      </View>

      {/* Bottom accent bar — color-coded by status for instant scanning */}
      <View
        style={{
          height: 2.5,
          backgroundColor: statusConfig.text,
          opacity: 0.18,
        }}
      />
    </Pressable>
  );
});

