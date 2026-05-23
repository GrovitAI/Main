export const MIN_TOUCH_TARGET = 44;

export const ORDER_STATUSES = [
  'open',
  'kot_sent',
  'billing',
  'closed',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const DEFAULT_PAGE_SIZE = 50;
