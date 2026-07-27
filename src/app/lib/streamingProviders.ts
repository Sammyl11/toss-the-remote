// TMDB watch-provider IDs for the services we let users filter by.
// `matchKeys` are matched as case-insensitive substrings against TMDB's
// provider_name values, since TMDB returns many bundle/channel variants
// (e.g. "Paramount+ Amazon Channel") rather than one clean name per service.
// Disney+ and Hulu are combined into one entry since Disney merged Hulu's
// content into the Disney+ app — TMDB's underlying data (sourced from
// JustWatch) sometimes still tags a title "Hulu" only, so treating either
// tag as a match reflects what a subscriber can actually watch.
export interface StreamingProvider {
  name: string;
  tmdbIds: number[];
  matchKeys: string[];
}

export const STREAMING_PROVIDERS: StreamingProvider[] = [
  { name: 'Netflix', tmdbIds: [8], matchKeys: ['netflix'] },
  { name: 'Prime Video', tmdbIds: [9], matchKeys: ['prime video'] },
  { name: 'Disney+ / Hulu', tmdbIds: [337, 15], matchKeys: ['disney', 'hulu'] },
  { name: 'Max', tmdbIds: [1899], matchKeys: ['max'] },
  { name: 'Apple TV+', tmdbIds: [350], matchKeys: ['apple tv'] },
  { name: 'Paramount+', tmdbIds: [531], matchKeys: ['paramount'] },
  { name: 'Peacock', tmdbIds: [387], matchKeys: ['peacock'] },
];

// Which of the user's selected services (by friendly name) a movie's raw TMDB
// provider names actually match. Used to show a per-card "available on X" badge.
export function matchedServiceNames(providerNames: string[] | undefined, selectedServiceNames: string[]): string[] {
  if (!providerNames || providerNames.length === 0) return [];
  return STREAMING_PROVIDERS
    .filter(p => selectedServiceNames.includes(p.name))
    .filter(p => providerNames.some(pn => p.matchKeys.some(key => pn.toLowerCase().includes(key))))
    .map(p => p.name);
}

export function movieMatchesServices(providerNames: string[] | undefined, selectedServiceNames: string[]): boolean {
  if (!providerNames || providerNames.length === 0) return false;
  if (selectedServiceNames.length === 0) return true;
  return matchedServiceNames(providerNames, selectedServiceNames).length > 0;
}

export const TMDB_GENRE_IDS: Record<string, number> = {
  Action: 28,
  Adventure: 12,
  Animation: 16,
  Comedy: 35,
  Crime: 80,
  Documentary: 99,
  Drama: 18,
  Family: 10751,
  Fantasy: 14,
  History: 36,
  Horror: 27,
  Music: 10402,
  Mystery: 9648,
  Romance: 10749,
  'Science Fiction': 878,
  'TV Movie': 10770,
  Thriller: 53,
  War: 10752,
  Western: 37,
};
