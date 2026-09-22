import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Network from 'expo-network';

import type {
  ContentManifest,
  LocalAnimal,
  LocalLibrary,
  ManifestAnimal,
  ManifestClip,
  RemoteAsset,
} from './types';

export const MANIFEST_URL =
  'https://github.com/clentfort/miau-muh-und-mehr/releases/download/content/manifest.json';

const MANIFEST_STORAGE_KEY = 'content-manifest-v1';
const CONTENT_DIRECTORY = new Directory(Paths.document, 'animal-content');
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export type SyncStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'downloading'; completed: number; total: number }
  | { kind: 'ready' }
  | { kind: 'wifi-required' }
  | { kind: 'error'; message: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAsset(value: unknown): value is RemoteAsset {
  return (
    isObject(value) &&
    typeof value.url === 'string' &&
    typeof value.sha256 === 'string' &&
    SHA256_PATTERN.test(value.sha256) &&
    typeof value.bytes === 'number' &&
    Number.isSafeInteger(value.bytes) &&
    value.bytes > 0
  );
}

function isClip(value: unknown): value is ManifestClip {
  if (!isObject(value) || !isAsset(value)) {
    return false;
  }
  const clip = value as RemoteAsset & Record<string, unknown>;
  return (
    typeof clip.id === 'string' &&
    clip.id.length > 0 &&
    typeof clip.durationMs === 'number' &&
    clip.durationMs > 0
  );
}

function isAnimal(value: unknown): value is ManifestAnimal {
  return (
    isObject(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    value.name === value.name.toLocaleLowerCase('en') &&
    (value.nameDe === undefined ||
      (typeof value.nameDe === 'string' && value.nameDe.length > 0)) &&
    (value.categories === undefined ||
      (Array.isArray(value.categories) &&
        value.categories.every((cat) => typeof cat === 'string' && cat.length > 0))) &&
    isAsset(value.cover) &&
    Array.isArray(value.clips) &&
    value.clips.length > 0 &&
    value.clips.every(isClip)
  );
}

export function parseManifest(value: unknown): ContentManifest {
  if (
    !isObject(value) ||
    value.schemaVersion !== 1 ||
    typeof value.version !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    !Array.isArray(value.animals) ||
    !value.animals.every(isAnimal)
  ) {
    throw new Error('The content manifest is invalid.');
  }

  return value as unknown as ContentManifest;
}

function ensureContentDirectory(): void {
  if (!CONTENT_DIRECTORY.exists) {
    CONTENT_DIRECTORY.create({ intermediates: true, idempotent: true });
  }
}

function extensionFor(asset: RemoteAsset, kind: 'cover' | 'clip'): string {
  const pathname = asset.url.split('?')[0].toLocaleLowerCase();
  if (kind === 'cover' && pathname.endsWith('.png')) {
    return 'png';
  }
  if (kind === 'cover' && pathname.endsWith('.webp')) {
    return 'webp';
  }
  return kind === 'cover' ? 'jpg' : 'mp4';
}

function localFile(asset: RemoteAsset, kind: 'cover' | 'clip'): File {
  return new File(CONTENT_DIRECTORY, `${asset.sha256}.${extensionFor(asset, kind)}`);
}

function bytesToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyFile(file: File, asset: RemoteAsset): Promise<boolean> {
  if (!file.exists || file.size !== asset.bytes) {
    return false;
  }

  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await file.bytes());
  return bytesToHex(digest) === asset.sha256;
}

async function downloadAsset(asset: RemoteAsset, kind: 'cover' | 'clip'): Promise<File> {
  const destination = localFile(asset, kind);
  if (destination.exists && destination.size === asset.bytes) {
    return destination;
  }

  if (destination.exists) {
    destination.delete();
  }

  const temporary = new File(CONTENT_DIRECTORY, `${asset.sha256}.download`);
  if (temporary.exists) {
    temporary.delete();
  }

  await File.downloadFileAsync(asset.url, temporary, { idempotent: true });
  if (!(await verifyFile(temporary, asset))) {
    temporary.delete();
    throw new Error('A downloaded media file failed verification.');
  }

  await temporary.move(destination);
  return destination;
}

function toLocalLibrary(manifest: ContentManifest): LocalLibrary | null {
  const animals: LocalAnimal[] = [];

  for (const animal of manifest.animals) {
    const cover = localFile(animal.cover, 'cover');
    const clips = animal.clips.map((clip) => ({
      ...clip,
      localUri: localFile(clip, 'clip').uri,
    }));

    if (!cover.exists || clips.some((clip) => !new File(clip.localUri).exists)) {
      return null;
    }

    animals.push({
      id: animal.id,
      name: animal.name,
      nameDe: animal.nameDe,
      categories: animal.categories,
      coverUri: cover.uri,
      clips,
    });
  }

  return { version: manifest.version, animals };
}

export async function loadInstalledLibrary(): Promise<LocalLibrary | null> {
  ensureContentDirectory();
  const stored = await AsyncStorage.getItem(MANIFEST_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    return toLocalLibrary(parseManifest(JSON.parse(stored)));
  } catch {
    return null;
  }
}

function canDownloadOn(network: Network.NetworkState): boolean {
  return (
    network.isConnected === true &&
    (network.type === Network.NetworkStateType.WIFI ||
      network.type === Network.NetworkStateType.ETHERNET)
  );
}

function allAssets(manifest: ContentManifest): Array<{
  asset: RemoteAsset;
  kind: 'cover' | 'clip';
}> {
  return manifest.animals.flatMap((animal) => [
    { asset: animal.cover, kind: 'cover' as const },
    ...animal.clips.map((asset) => ({ asset, kind: 'clip' as const })),
  ]);
}

function removeUnusedFiles(manifest: ContentManifest): void {
  const expected = new Set(
    allAssets(manifest).map(({ asset, kind }) => localFile(asset, kind).name),
  );

  for (const entry of CONTENT_DIRECTORY.list()) {
    if (entry instanceof File && !expected.has(entry.name)) {
      entry.delete();
    }
  }
}

export async function syncLibrary(
  onStatus: (status: SyncStatus) => void,
): Promise<LocalLibrary | null> {
  ensureContentDirectory();
  const network = await Network.getNetworkStateAsync();
  if (!canDownloadOn(network)) {
    onStatus({ kind: 'wifi-required' });
    return loadInstalledLibrary();
  }

  try {
    onStatus({ kind: 'checking' });
    const response = await fetch(`${MANIFEST_URL}?t=${Date.now()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Manifest request failed with status ${response.status}.`);
    }

    const manifest = parseManifest(await response.json());
    const assets = allAssets(manifest);
    let completed = 0;

    for (const { asset, kind } of assets) {
      onStatus({ kind: 'downloading', completed, total: assets.length });
      await downloadAsset(asset, kind);
      completed += 1;
    }

    const library = toLocalLibrary(manifest);
    if (!library) {
      throw new Error('The downloaded library is incomplete.');
    }

    await AsyncStorage.setItem(MANIFEST_STORAGE_KEY, JSON.stringify(manifest));
    removeUnusedFiles(manifest);
    onStatus({ kind: 'ready' });
    return library;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The content update failed.';
    console.error('Content sync failed:', error);
    onStatus({ kind: 'error', message });
    return loadInstalledLibrary();
  }
}
