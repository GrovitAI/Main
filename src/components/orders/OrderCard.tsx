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
      return { label: 'KITCHEN', bg: '#FFF7ED', text: '#EA580C' };
    case 'confirmed':
      return { label: 'TO BE PAID', bg: '#EFF6FF', text: '#2563EB' };
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

export function getBillIdentifier(summary: OpenOrderSummary, orderIndex: number): string {
  const { order } = summary;
  if (order.status === 'draft') return 'Working Draft';
  if (order.status === 'held') return 'Held Order';
  return order.order_name || `Order #${orderIndex + 1}`;
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
  const { order, previewItems, remainingItemLines, itemCount, totalAmount, kotNumbers } = summary;
  const statusConfig = getStatusConfig(order.status);
  const billId = getBillIdentifier(summary, orderIndex);
  const elapsed = getElapsedLabel(order.created_at);
  const amountStr = formatAmount(totalAmount);
  const orderType = order.order_name || 'Takeaway';
  
  const ticketsCount = kotNumbers?.length ?? 0;
  const ticketsText = ticketsCount === 1 ? '1 kitchen ticket' : `${ticketsCount} kitchen tickets`;

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
          margin: 8,
          flex: 1,
          borderRadius: 12,
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: statusConfig.text + '25', // elegant status-coded border outline
          shadowColor: statusConfig.text, // status-coded soft glow shadow
          shadowOffset: { width: 0, height: 1.5 },
          shadowOpacity: 0.03,
          shadowRadius: 3.5,
          elevation: 2,
          overflow: 'hidden',
          height: 176, // locked uniform height matching design
        },
        hovered && {
          transform: [{ translateY: -2 }],
          shadowOpacity: 0.08,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 4,
          borderColor: statusConfig.text + '60', // sharp status-coded glow
        },
        pressed && {
          transform: [{ scale: 0.995 }],
          shadowOpacity: 0.01,
          elevation: 0,
        },
      ]}
    >
      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        
        {/* Header Section (White background) */}
        <View style={{ padding: 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
          {/* Header Row: ID/subtext left, status/elapsed right */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, paddingRight: 6 }}>
              <Text
                style={{ fontSize: 15, fontWeight: '800', color: '#0B1E36', letterSpacing: -0.15 }}
                numberOfLines={1}
              >
                {billId}
              </Text>
              <Text
                style={{ fontSize: 11.5, fontWeight: '600', color: '#64748B', marginTop: 1.5 }}
                numberOfLines={1}
              >
                {order.status === 'draft'
                  ? 'Current Cart'
                  : order.status === 'held'
                    ? (order.notes || 'Takeaway')
                    : (order.status === 'paid' || order.status === 'completed')
                      ? (order.invoice_number
                        ? `${order.invoice_number}${ticketsCount > 0 ? ` · ${ticketsText}` : ''}`
                        : 'Bill settled'
                      )
                      : `${order.notes || 'Takeaway'}${ticketsCount > 0 ? ` · ${ticketsText}` : ''}`
                }
              </Text>
            </View>

            {order.status !== 'draft' && order.status !== 'held' && (
              <View style={{ alignItems: 'flex-end' }}>
                <Text
                  style={{ fontSize: 12, fontWeight: '900', color: statusConfig.text, letterSpacing: 0.5 }}
                  numberOfLines={1}
                >
                  {statusConfig.label}
                </Text>
                <Text
                  style={{ fontSize: 11, fontWeight: '600', color: '#64748B', marginTop: 2 }}
                  numberOfLines={1}
                >
                  {elapsed}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Items Section: Vertical list layout with Name left and Qty right */}
        <View style={{ paddingHorizontal: 14, paddingVertical: 8, flex: 1, backgroundColor: '#FFFFFF', justifyContent: 'flex-start' }}>
          {itemCount === 0 ? (
            <Text style={{ fontSize: 11, color: '#94A3B8', fontStyle: 'italic', paddingVertical: 4 }}>No items</Text>
          ) : (
            <View style={{ gap: 4.5 }}>
              {previewItems.slice(0, 3).map((item, idx) => (
                <View key={`${item.name}-${idx}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text
                    style={{ fontSize: 12, fontWeight: '500', color: '#475569', flex: 1, marginRight: 8 }}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B' }}>
                    ×{item.quantity}
                  </Text>
                </View>
              ))}
              
              {remainingItemLines > 0 && (
                <Text
                  onTouchStart={(e: any) => {
                    e.stopPropagation();
                  }}
                  onTouchEnd={(e: any) => {
                    e.stopPropagation();
                    onViewOrder();
                  }}
                  {...({
                    onClick: (e: any) => {
                       e.stopPropagation();
                       onViewOrder();
                    }
                  } as any)}
                  style={{ fontSize: 11.5, fontWeight: '700', color: '#0251B8', marginTop: 3, cursor: 'pointer', textDecorationLine: 'underline' }}
                >
                  +{remainingItemLines} more items
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Footer Banner (Soft light-blue background) */}
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#F0F7FF',
          paddingVertical: 9,
          paddingHorizontal: 14,
          borderTopWidth: 1,
          borderTopColor: '#E2E8F0',
        }}>
          
          {/* Bigger, clean View button in the footer */}
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
                gap: 3,
                paddingVertical: 3.5,
                paddingHorizontal: 8.5,
                borderRadius: 6,
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

          {/* Total Label and Amount side-by-side on the right */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#475569' }}>Total</Text>
            <Text style={{ fontSize: 14.5, fontWeight: '800', color: '#0251B8', letterSpacing: -0.2 }}>
              {amountStr || '—'}
            </Text>
          </View>
          
        </View>

      </View>
    </Pressable>
  );
});

