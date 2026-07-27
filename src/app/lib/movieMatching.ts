// Strips the "(Year) - Director" suffix our movie strings carry and
// normalizes punctuation/case so titles can be compared reliably.
export function normalizeMovieTitle(title: string): string {
  return title
    .split(' (')[0]
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// True if one title is a direct sequel/prequel of the other — e.g. "Avatar"
// and "Avatar: The Way of Water", or "John Wick" and "John Wick: Chapter 2".
// Being from the same franchise isn't enough on its own (so "Halloween" and
// "Halloweentown" don't collide) — the shorter title has to be a whole-word
// prefix of the longer one.
export function isLikelySequelPair(titleA: string, titleB: string): boolean {
  const a = normalizeMovieTitle(titleA);
  const b = normalizeMovieTitle(titleB);
  if (!a || !b) return false;
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return shorter.length >= 4 && longer.startsWith(`${shorter} `);
}

export interface TmdbSearchCandidate {
  id: number;
  title: string;
  release_date: string;
  popularity: number;
  vote_count: number;
}

// A movie needs at least this many votes to count as a credible "real" match on
// year alone. Below this, a same-titled decoy with essentially no data (a handful
// of votes) can otherwise beat the actual well-known film purely by having a
// release_date whose year happens to string-match — e.g. Robert Eggers' "The
// Witch" is dated 2016 on TMDB (its wide release), so a citation of "(2015)"
// used to lose to an entirely unrelated, barely-known "The Witch (2015)".
const CREDIBLE_VOTE_COUNT = 50;

// Ranks TMDB search results for a title/year query. Popularity dominates the
// score — exact title/year matches are a strong boost (enough to correctly pick
// a legitimately-known but less popular earlier version over a flashier remake,
// e.g. "A Star Is Born (1976)" over the 2018 remake), but the year-match boost
// only applies to candidates that clear the credibility bar above, AND only ever
// on top of an exact title match — otherwise a completely different movie that
// merely shares the release year (e.g. "The Last Witch Hunter" vs "The Witch")
// can win purely on year, which is not a meaningful signal on its own.
export function rankTmdbCandidates<T extends TmdbSearchCandidate>(candidates: T[], title: string, year: string): T[] {
  const score = (m: T) => {
    const exactTitle = m.title.toLowerCase() === title.toLowerCase() ? 1 : 0;
    const voteCount = m.vote_count || 0;
    let exactYear = 0;
    if (year && exactTitle) {
      const releaseYear = m.release_date ? new Date(m.release_date).getFullYear().toString() : '';
      exactYear = (releaseYear === year && voteCount >= CREDIBLE_VOTE_COUNT) ? 1 : 0;
    }
    const popularityScore = Math.log(voteCount + 1) + (m.popularity || 0) / 10;
    return popularityScore + exactTitle * 2 + exactYear * 8;
  };
  return [...candidates].sort((a, b) => score(b) - score(a));
}
