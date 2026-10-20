import { Platform } from 'react-native';

describe('in-app dialogs on the web (task 281)', () => {
  const platform = Platform.OS;
  const confirm = jest.fn(() => true);
  let d: typeof import('../dialogs');
  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    Object.assign(globalThis, { window: { confirm, alert: jest.fn() } });
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after Platform is set to web.
    d = require('../dialogs') as typeof import('../dialogs');
  });
  afterAll(() => { Object.defineProperty(Platform, 'OS', { value: platform, configurable: true }); });
  beforeEach(() => confirm.mockClear());

  it('asks in the app while a host is on screen, and runs the action only on its button', () => {
    const release = d.registerDialogHost();
    const leave = jest.fn();
    d.confirmAction('Leave without saving?', 'What you typed will be lost.', 'Leave', leave);
    expect(confirm).not.toHaveBeenCalled();
    const open = d.currentDialog();
    expect(open?.title).toBe('Leave without saving?');
    expect(open?.buttons.map((b) => b.label)).toEqual(['No', 'Leave']);
    expect(leave).not.toHaveBeenCalled();
    d.answerDialog(open?.id ?? 0, open?.buttons.find((b) => b.kind === 'destructive'));
    expect(leave).toHaveBeenCalledTimes(1);
    expect(d.currentDialog()).toBeNull();
    // No closes it without running anything.
    d.confirmAction('Remove?', 'It comes off the menu.', 'Remove', leave);
    const second = d.currentDialog();
    d.answerDialog(second?.id ?? 0, second?.buttons.find((b) => b.kind === 'cancel'));
    expect(leave).toHaveBeenCalledTimes(1);
    release();
  });

  it('falls back to the browser dialog when no host is on screen', () => {
    const remove = jest.fn();
    d.confirmAction('Remove?', 'It comes off the menu.', 'Remove', remove);
    expect(confirm).toHaveBeenCalledWith('Remove?\n\nIt comes off the menu.');
    expect(remove).toHaveBeenCalled();
  });
});
