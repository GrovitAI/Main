import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVICE_ID_KEY = 'grovit_device_uuid';

/**
 * Storage utility wrapper to isolate AsyncStorage.
 * Extensible for last selected branch, printer selection, offline queues, etc.
 */
export const storage = {
  /**
   * Retrieves a typed item from storage.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return raw as unknown as T;
      }
    } catch (err) {
      console.error(`[Storage] Error reading key "${key}":`, err);
      return null;
    }
  },

  /**
   * Persists a typed item to storage.
   */
  async set<T>(key: string, value: T): Promise<void> {
    try {
      const raw = typeof value === 'string' ? value : JSON.stringify(value);
      await AsyncStorage.setItem(key, raw);
    } catch (err) {
      console.error(`[Storage] Error writing key "${key}":`, err);
    }
  },

  /**
   * Removes an item from storage.
   */
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (err) {
      console.error(`[Storage] Error removing key "${key}":`, err);
    }
  },

  /**
   * Helper to retrieve device ID.
   */
  async getDeviceId(): Promise<string | null> {
    return this.get<string>(DEVICE_ID_KEY);
  },

  /**
   * Helper to set device ID.
   */
  async setDeviceId(id: string): Promise<void> {
    return this.set<string>(DEVICE_ID_KEY, id);
  },

  /**
   * Helper to remove device ID.
   */
  async removeDeviceId(): Promise<void> {
    return this.remove(DEVICE_ID_KEY);
  },
};
