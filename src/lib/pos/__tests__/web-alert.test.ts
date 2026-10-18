import { Alert, Platform } from 'react-native';

describe('installWebAlert (task 263)', () => {
  const original = Alert.alert;
  const platform = Platform.OS;
  let confirmAnswer = true;
  const confirm = jest.fn(() => confirmAnswer);
  const alert = jest.fn();

  beforeAll(() => {
    Object.defineProperty(Platform, 'OS', { value: 'web', configurable: true });
    Object.assign(globalThis, { window: { confirm, alert } });
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded after Platform is set to web.
    (require('../dialogs') as typeof import('../dialogs')).installWebAlert();
  });
  afterAll(() => {
    Alert.alert = original;
    Object.defineProperty(Platform, 'OS', { value: platform, configurable: true });
  });
  beforeEach(() => { confirm.mockClear(); alert.mockClear(); });

  it('shows a one-button alert as a message and runs its button', () => {
    const ok = jest.fn();
    Alert.alert('Saved', 'The branch was updated.', [{ text: 'OK', onPress: ok }]);
    expect(alert).toHaveBeenCalledWith('Saved\n\nThe branch was updated.');
    expect(ok).toHaveBeenCalled();
  });

  it('asks OK/Cancel and runs the destructive action on OK', () => {
    const remove = jest.fn(); const cancel = jest.fn();
    confirmAnswer = true;
    Alert.alert('Deactivate?', 'They cannot sign in.', [{ text: 'Cancel', style: 'cancel', onPress: cancel }, { text: 'Deactivate', style: 'destructive', onPress: remove }]);
    expect(confirm).toHaveBeenCalledWith('Deactivate?\n\nThey cannot sign in.');
    expect(remove).toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('runs Cancel when the person declines', () => {
    const remove = jest.fn(); const cancel = jest.fn();
    confirmAnswer = false;
    Alert.alert('Deactivate?', undefined, [{ text: 'Cancel', style: 'cancel', onPress: cancel }, { text: 'Deactivate', style: 'destructive', onPress: remove }]);
    expect(remove).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });
});
