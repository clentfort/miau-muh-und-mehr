import type { LocalClip, ManifestAnimal } from './types';

export const MAX_CLIPS_PER_PLAYBACK = 3;

export function shuffleClips(
  clips: LocalClip[],
  lastPlayedId: string | null,
  random: () => number = Math.random,
): LocalClip[] {
  const shuffled = [...clips];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
  }

  if (shuffled.length > 1 && shuffled[0]?.id === lastPlayedId) {
    const replacementIndex = shuffled.findIndex((clip) => clip.id !== lastPlayedId);
    [shuffled[0], shuffled[replacementIndex]] = [
      shuffled[replacementIndex],
      shuffled[0],
    ];
  }

  return shuffled.slice(0, MAX_CLIPS_PER_PLAYBACK);
}

export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('en');
}

type NamedAnimal = Pick<ManifestAnimal, 'name' | 'nameDe' | 'categories'>;

/** German name of the animal, falling back to the capitalized English name. */
export function displayName(animal: NamedAnimal): string {
  return (
    animal.nameDe ??
    animal.name.replace(/(^|[\s-])\p{L}/gu, (letter) => letter.toLocaleUpperCase('de'))
  );
}

/** Matches German/English name or any category name so spellings & tags find the animal. */
export function matchesSearch(animal: NamedAnimal, query: string): boolean {
  const term = normalizeSearch(query);
  if (!term) return true;
  return (
    normalizeSearch(displayName(animal)).includes(term) ||
    normalizeSearch(animal.name).includes(term) ||
    (animal.categories?.some((category) => normalizeSearch(category).includes(term)) ?? false)
  );
}

/** Checks if an animal belongs to the selected category (if selected category is not null/empty/'all'). */
export function matchesCategory(animal: NamedAnimal, category: string | null): boolean {
  if (!category || category === 'all') {
    return true;
  }
  const normCat = normalizeSearch(category);
  return animal.categories?.some((cat) => normalizeSearch(cat) === normCat) ?? false;
}
