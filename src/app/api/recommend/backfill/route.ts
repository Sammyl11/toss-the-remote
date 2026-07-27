import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import axios from 'axios';
import { STREAMING_PROVIDERS, TMDB_GENRE_IDS, movieMatchesServices } from '@/app/lib/streamingProviders';
import { isLikelySequelPair } from '@/app/lib/movieMatching';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface DiscoverMovie {
  id: number;
  title: string;
  release_date: string;
}

type TmdbHeaders = { headers: { Authorization: string; accept: string } };

// Look up the user's stated taste movies on TMDB to get both their ids (used to
// pull "related movies" below) and their genre ids (used to bias the discover
// pools) — grounding genre relevance in what the user actually said they like,
// rather than only in whichever recommendations happened to already pass the filter.
async function searchSeedMovies(movies: string, tmdbHeaders: TmdbHeaders): Promise<{ seedIds: number[]; seedGenreIds: number[] }> {
  const seedTitles = movies
    .split(',')
    .map((m: string) => m.trim())
    .filter(Boolean)
    .slice(0, 2);

  const seedIds: number[] = [];
  const seedGenreIds: number[] = [];
  for (const title of seedTitles) {
    try {
      const searchRes = await axios.get(
        `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}`,
        tmdbHeaders
      );
      const top = searchRes.data.results?.[0];
      if (top) {
        seedIds.push(top.id);
        seedGenreIds.push(...(top.genre_ids || []));
      }
    } catch {
      // skip seed titles TMDB can't find
    }
  }

  return { seedIds, seedGenreIds };
}

// Pool 3: TMDB's own per-movie "recommendations" (the "related movies" section
// on a TMDB movie page) seeded from what the user said they like, filtered
// down to only the titles actually available on the selected services.
async function fetchRelatedPool(seedIds: number[], services: string[], tmdbHeaders: TmdbHeaders): Promise<DiscoverMovie[]> {
  if (seedIds.length === 0) return [];

  const recResponses = await Promise.all(
    seedIds.map(id =>
      axios.get(`https://api.themoviedb.org/3/movie/${id}/recommendations`, tmdbHeaders).catch(() => null)
    )
  );

  const related = Array.from(
    new Map(
      recResponses
        .filter(Boolean)
        .flatMap(res => (res!.data.results as DiscoverMovie[]).slice(0, 10))
        .map(m => [m.id, m])
    ).values()
  ).slice(0, 20);

  if (related.length === 0) return [];

  const providerChecks = await Promise.all(
    related.map(m =>
      axios.get(`https://api.themoviedb.org/3/movie/${m.id}/watch/providers`, tmdbHeaders)
        .then(res => ({
          movie: m,
          providerNames: (res.data.results?.US?.flatrate || []).map((p: { provider_name: string }) => p.provider_name) as string[],
        }))
        .catch(() => ({ movie: m, providerNames: [] as string[] }))
    )
  );

  return providerChecks
    .filter(({ providerNames }) => movieMatchesServices(providerNames, services))
    .map(({ movie }) => movie);
}

export async function POST(request: Request) {
  try {
    const { movies, excludeMovies = [], services = [], genres = [], count = 1, preferPopular = false, useOriginalModel = false } = await request.json();

    if (!process.env.OPENAI_API_KEY || !process.env.TMDB_API_KEY) {
      return NextResponse.json({ error: 'API keys not configured' }, { status: 500 });
    }
    if (!movies || !Array.isArray(services) || services.length === 0 || count <= 0) {
      return NextResponse.json({ recommendations: '' });
    }

    const providerIds = STREAMING_PROVIDERS
      .filter(p => services.includes(p.name))
      .flatMap(p => p.tmdbIds)
      .join('|');

    if (!providerIds) {
      return NextResponse.json({ recommendations: '' });
    }

    const tmdbHeaders = {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
        accept: 'application/json',
      },
    };

    // Ground genre relevance in what the user actually said they like, not just
    // in whichever recommendations happened to already pass the filter.
    const { seedIds, seedGenreIds } = await searchSeedMovies(movies, tmdbHeaders);

    const clientGenreIds = (genres as string[]).map(g => TMDB_GENRE_IDS[g]).filter(Boolean);
    const genreIds = Array.from(new Set([...seedGenreIds, ...clientGenreIds])).slice(0, 4).join('|');

    // Pool 1: popular movies on the selected services that are also decently rated
    //         (popularity alone lets notoriously bad-but-widely-searched movies through),
    //         biased toward the taste's genres when known
    // Pool 2: highly-rated movies on those services, also genre-biased
    // Two pages per pool gives the AI a genuinely wide set to choose the best matches from.
    // `with_genres` uses '|' (OR) so a movie only needs to match ANY of the hinted
    // genres, not all of them at once (comma would mean AND, which is far too narrow).
    const genreParam = genreIds ? `&with_genres=${genreIds}` : '';
    const popularUrl = (page: number) =>
      `https://api.themoviedb.org/3/discover/movie?with_watch_providers=${providerIds}&watch_region=US&sort_by=popularity.desc&vote_count.gte=100&vote_average.gte=6&page=${page}${genreParam}`;
    const genreUrl = (page: number) =>
      `https://api.themoviedb.org/3/discover/movie?with_watch_providers=${providerIds}&watch_region=US&sort_by=vote_average.desc&vote_count.gte=200&page=${page}${genreParam}`;

    const [poolResponses, relatedPool] = await Promise.all([
      Promise.all([
        axios.get(popularUrl(1), tmdbHeaders),
        axios.get(popularUrl(2), tmdbHeaders),
        axios.get(genreUrl(1), tmdbHeaders),
        axios.get(genreUrl(2), tmdbHeaders),
      ]),
      fetchRelatedPool(seedIds, services, tmdbHeaders),
    ]);

    const excludeTitles = new Set(
      (excludeMovies as string[]).map(m => m.split('(')[0].trim().toLowerCase())
    );

    const dedupe = new Map<number, DiscoverMovie>();
    [...poolResponses.flatMap(res => res.data.results), ...relatedPool].forEach((m: DiscoverMovie) => {
      const isExcluded = excludeTitles.has(m.title.trim().toLowerCase());
      // Drop candidates that are a direct sequel/prequel of anything already shown,
      // so a replacement never reintroduces e.g. Avatar: The Way of Water next to Avatar.
      const clashesWithExcluded = (excludeMovies as string[]).some(ex => isLikelySequelPair(ex, m.title));
      if (!isExcluded && !clashesWithExcluded) {
        dedupe.set(m.id, m);
      }
    });

    const candidates = Array.from(dedupe.values()).slice(0, 100);

    if (candidates.length === 0) {
      return NextResponse.json({ recommendations: '' });
    }

    const candidateLines = candidates.map(
      m => `${m.title} (${m.release_date ? new Date(m.release_date).getFullYear() : 'N/A'})`
    );

    // The original gpt-4o-mini uses `max_tokens`; the newer gpt-5.4-nano requires
    // `max_completion_tokens` instead — the API rejects the wrong one per model.
    const model = useOriginalModel ? 'gpt-4o-mini' : 'gpt-5.4-nano';
    const tokenLimitParam = useOriginalModel ? { max_tokens: 300 } : { max_completion_tokens: 300 };

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: "You are a movie recommendation expert. Only pick from the exact candidate list you are given, reproducing each chosen line exactly as written. Never invent a title that isn't in the list. If picking more than one movie, never pick two where one is a direct sequel or prequel of the other.",
        },
        {
          role: 'user',
          content: `Someone likes these movies: ${movies}

From ONLY this candidate list, pick the ${count} movie(s) that best match their taste:
${candidateLines.join('\n')}
${preferPopular ? '\nWhen multiple candidates fit comparably well, prefer the more well-known, broadly popular ones over obscure picks.' : ''}
Return exactly ${count} line(s), each copied exactly as written in the candidate list above, no additional text.`,
        },
      ],
      temperature: 0.5,
      ...tokenLimitParam,
    });

    const raw = (completion.choices[0].message.content || '')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    // Validate the model actually stayed within the candidate list and didn't pick
    // two movies that are direct sequels/prequels of each other; backfill with top
    // remaining (non-clashing) candidates if it drifted, duplicated, or returned too few.
    const candidateSet = new Set(candidateLines);
    const picks: string[] = [];
    for (const line of raw) {
      if (picks.length >= count) break;
      if (candidateSet.has(line) && !picks.some(p => isLikelySequelPair(p, line))) {
        picks.push(line);
      }
    }
    for (const line of candidateLines) {
      if (picks.length >= count) break;
      if (!picks.includes(line) && !picks.some(p => isLikelySequelPair(p, line))) {
        picks.push(line);
      }
    }

    // Append " - Director" to match the "Title (Year) - Director" format the rest of
    // the app expects — only looked up for the handful of final picks, not the whole pool.
    const lineToId = new Map(candidateLines.map((line, i) => [line, candidates[i].id]));
    const finalPicks = await Promise.all(
      picks.slice(0, count).map(async line => {
        const id = lineToId.get(line);
        if (!id) return line;
        try {
          const creditsRes = await axios.get(`https://api.themoviedb.org/3/movie/${id}/credits`, tmdbHeaders);
          const director = creditsRes.data.crew?.find((p: { job: string }) => p.job === 'Director')?.name;
          return director ? `${line} - ${director}` : line;
        } catch {
          return line;
        }
      })
    );

    return NextResponse.json({ recommendations: finalPicks.join('\n') });
  } catch (error: unknown) {
    console.error('Backfill error:', error);
    return NextResponse.json({ recommendations: '' });
  }
}
