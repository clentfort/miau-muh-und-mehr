export type HomeLayout = 'grid' | 'carousel' | 'list';

export interface RemoteAsset {
  url: string;
  sha256: string;
  bytes: number;
}

export interface ManifestClip extends RemoteAsset {
  id: string;
  durationMs: number;
}

export interface ManifestAnimal {
  id: string;
  name: string;
  nameDe?: string;
  categories?: string[];
  cover: RemoteAsset;
  clips: ManifestClip[];
}

export interface ContentManifest {
  schemaVersion: 1;
  version: string;
  updatedAt: string;
  animals: ManifestAnimal[];
}

export interface LocalClip extends ManifestClip {
  localUri: string;
}

export interface LocalAnimal extends Omit<ManifestAnimal, 'cover' | 'clips'> {
  coverUri: string;
  clips: LocalClip[];
}

export interface LocalLibrary {
  version: string;
  animals: LocalAnimal[];
}
