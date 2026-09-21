import { beforeEach, describe, expect, it, vi } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadFullScreen, saveFullScreen } from './preferences';

vi.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => store.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
      clear: vi.fn(async () => {
        store.clear();
      }),
    },
  };
});

describe('preferences full screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    void AsyncStorage.clear();
  });

  it('defaults to true when no value is stored', async () => {
    const isFullScreen = await loadFullScreen();
    expect(isFullScreen).toBe(true);
  });

  it('saves and loads false', async () => {
    await saveFullScreen(false);
    const isFullScreen = await loadFullScreen();
    expect(isFullScreen).toBe(false);
  });

  it('saves and loads true', async () => {
    await saveFullScreen(false);
    await saveFullScreen(true);
    const isFullScreen = await loadFullScreen();
    expect(isFullScreen).toBe(true);
  });
});
