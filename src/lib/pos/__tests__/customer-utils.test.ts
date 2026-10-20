import { cleanPhone, showPhone, validPhone } from '@/lib/pos/customer-utils';


// Task 288: what the till accepts as a customer's number, matching the database check.
test('numbers are stored as digits, shown in two groups, and checked', () => {
  expect(cleanPhone('98765 43210')).toBe('9876543210');
  expect(cleanPhone('+91 98765-43210')).toBe('+919876543210');
  expect(showPhone('9876543210')).toBe('98765 43210');
  expect(showPhone('+919876543210')).toBe('+919876543210');
  expect(validPhone('9876543210')).toBe(true);
  expect(validPhone('+919876543210')).toBe(true);
  expect(validPhone('12345')).toBe(false);
  expect(validPhone('98765x43210')).toBe(false);
});
