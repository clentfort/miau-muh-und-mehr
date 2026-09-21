import AsyncStorage from '@react-native-async-storage/async-storage';

import type { HomeLayout } from './types';

const LAYOUT_KEY = 'home-layout-v1';
const FULL_SCREEN_KEY = 'full-screen-v1';
const LAST_PLAYED_PREFIX = 'last-played-v1:';

export async function loadHomeLayout(): Promise<HomeLayout> {
  const value = await AsyncStorage.getItem(LAYOUT_KEY);
  return value === 'carousel' || value === 'list' ? value : 'grid';
}

export async function saveHomeLayout(layout: HomeLayout): Promise<void> {
  await AsyncStorage.setItem(LAYOUT_KEY, layout);
}

export async function loadFullScreen(): Promise<boolean> {
  const value = await AsyncStorage.getItem(FULL_SCREEN_KEY);
  return value === null ? true : value === 'true';
}

export async function saveFullScreen(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(FULL_SCREEN_KEY, String(enabled));
}

export async function loadLastPlayed(animalId: string): Promise<string | null> {
  return AsyncStorage.getItem(`${LAST_PLAYED_PREFIX}${animalId}`);
}

export async function saveLastPlayed(animalId: string, clipId: string): Promise<void> {
  await AsyncStorage.setItem(`${LAST_PLAYED_PREFIX}${animalId}`, clipId);
}
