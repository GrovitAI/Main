import { memo, useState } from 'react';
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
      return { label: 'HELD', bg: '#FFFBEB', text: '#D97706' };
    case 'unpaid':
    case 'payment_pending':
      return { label: 'UNPAID', bg: '#FFF7ED', text: '#F97316' };
    case 'in_kitchen':
      return { label: 'KITCHEN', bg: '#F0F9FF', text: '#0251B8' };
    case 'paid':
    case 'completed':
      return { label: status === 'completed' ? 'COMPLETED' : 'PAID', bg: '#F0FDF4', text: '#16A34A' };
    case 'cancelled':
      return { label: 'CANCELLED', bg: '#F8FAFC', text: '#64748B' };
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
  const orderType = order.order_name || 'Takeaway';

  // Manual hover and active state management to avoid nesting buttons
  const [viewHovered, setViewHovered] = useState(false);
  const [viewPressed, setViewPressed] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${billId}`}
      onPress={onOpenBill}
      style={({ pressed, hovered }: any) => [
        {
          margin: 6.5,
          flex: 1,
          borderRadius: 12,
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: statusConfig.text + '25', // status-coded border outline
          shadowColor: statusConfig.text, // status-coded glow
          shadowOffset: { width: 0, height: 1.5 },
          shadowOpacity: 0.03,
          shadowRadius: 3.5,
          elevation: 2,
          overflow: 'hidden',
          height: 120,
        },
        hovered && {
          transform: [{ translateY: -2 }],
          shadowOpacity: 0.08,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 4,
          borderColor: statusConfig.text + '60', // sharp status glow
          backgroundColor: '#FFFFFF',
        },
        pressed && {
          transform: [{ scale: 0.995 }],
          shadowOpacity: 0.01,
          elevation: 0,
        },
      ]}
    >
      <View style={{ flexDirection: 'row', height: 118, alignItems: 'stretch' }}>
        
        {/* Left Pane (Details) */}
        <View style={{ flex: 3.3, padding: 10, justifyContent: 'space-between' }}>
          <View>
            <Text
              style={{ fontSize: 13, fontWeight: '800', color: '#0B1E36', letterSpacing: -0.15 }}
              numberOfLines={1}
            >
              {billId}
            </Text>
            
            {/* Horizontal wrapping list of items — side-by-side with padding/spacing */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6, alignItems: 'center' }}>
              {itemCount === 0 ? (
                <Text style={{ fontSize: 10, color: '#94A3B8', fontStyle: 'italic' }}>No items</Text>
              ) : (
                <>
                  {previewItems.map((item, idx) => (
                    <Text
                      key={`${item.name}-${idx}`}
                      style={{ fontSize: 10, fontWeight: '500', color: '#475569' }}
                      numberOfLines={1}
                    >
                      <Text style={{ color: '#334155', fontWeight: '600' }}>{item.name}</Text>
                      <Text style={{ color: '#64748B' }}> ×{item.quantity}</Text>
                    </Text>
                  ))}
                  {remainingItemLines > 0 && (
                    <Text style={{ fontSize: 9.2, fontWeight: '700', color: '#0251B8' }}>
                      +{remainingItemLines} more
                    </Text>
                  )}
                </>
              )}
            </View>
          </View>

          {/* View ghost pill trigger */}
          <View
            onTouchStart={(e) => {
              e.stopPropagation();
              setViewPressed(true);
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              setViewPressed(false);
              onViewOrder();
            }}
            {...({
              onMouseEnter: () => setViewHovered(true),
              onMouseLeave: () => {
                setViewHovered(false);
                setViewPressed(false);
              },
              onMouseDown: (e: any) => {
                e.stopPropagation();
                setViewPressed(true);
              },
              onMouseUp: (e: any) => {
                e.stopPropagation();
                if (viewPressed) {
                  setViewPressed(false);
                  onViewOrder();
                }
              },
              onClick: (e: any) => {
                e.stopPropagation();
              }
            } as any)}
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                gap: 3,
                paddingVertical: 2,
                paddingHorizontal: 8,
                borderRadius: 99,
                backgroundColor: '#E8F2FA',
                borderWidth: 1,
                borderColor: '#C7D9EC',
                cursor: 'pointer',
              },
              viewHovered && {
                backgroundColor: '#D6E4F0',
                borderColor: '#A5C1DC',
              },
              viewPressed && {
                transform: [{ scale: 0.96 }],
                backgroundColor: '#C2D5E6',
              }
            ]}
          >
            <Eye size={10} color="#0251B8" />
            <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#0251B8' }}>View</Text>
          </View>
        </View>

        {/* Thin vertical separation line — status tinted */}
        <View style={{ width: 1, backgroundColor: statusConfig.text + '15' }} />

        {/* Right Pane (Metadata Column) */}
        <View style={{ flex: 0.7, backgroundColor: statusConfig.bg, paddingVertical: 10, paddingHorizontal: 6, justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View style={{ alignItems: 'flex-end', gap: 3.5 }}>
            <View
              style={{
                borderRadius: 4,
                paddingHorizontal: 5,
                paddingVertical: 1.5,
                backgroundColor: statusConfig.bg,
                borderWidth: 1,
                borderColor: statusConfig.text + '20',
              }}
            >
              <Text style={{ fontSize: 7, fontWeight: '900', color: statusConfig.text, letterSpacing: 0.5 }}>
                {statusConfig.label}
              </Text>
            </View>
            
            <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>
              {elapsed}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end', gap: 3 }}>
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ fontSize: 7.5, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.2 }} numberOfLines={1}>
                {orderType}
              </Text>
            </View>
            
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0B1E36', letterSpacing: -0.2 }}>
              {amountStr || '—'}
            </Text>
          </View>
        </View>

        {/* Right Edge Status indicator bar */}
        <View style={{ width: 3, backgroundColor: statusConfig.text }} />

      </View>
    </Pressable>
  );
});

