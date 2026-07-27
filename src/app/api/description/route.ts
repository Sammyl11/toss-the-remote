import { NextResponse } from 'next/server';
import axios from 'axios';
import { rankTmdbCandidates } from '@/app/lib/movieMatching';

// Helper function to extract the movie title from our format "Title (Year) - Director"
const extractMovieInfo = (movieString: string) => {
  const normalizedString = movieString
    .replace(/\s+/g, ' ')
    .replace(/[""]/g, '"')
    .trim();

  const match = normalizedString.match(/(.+?)\s*\((\d{4})\)(?:\s*-\s*(.+))?/i);
  if (match) {
    return {
      title: match[1].trim(),
      year: match[2],
      director: match[3]?.trim() || ''
    };
  }

  const parts = normalizedString.split('-');
  return {
    title: parts[0].trim(),
    year: '',
    director: parts[1]?.trim() || ''
  };
};

// Helper function to clean up movie title for search
const cleanMovieTitle = (title: string) => {
  return title
    // Remove common prefixes like "The", "A", "An" from the start
    .replace(/^(the|a|an)\s+/i, '')
    // Remove special characters but keep apostrophes for names
    .replace(/[^\w\s'-]/g, ' ')
    // Replace multiple spaces with single space
    .replace(/\s+/g, ' ')
    .trim();
};





interface TMDBError {
  message: string;
  type?: string;
  response?: {
    data?: unknown;
    status?: number;
  };
}

export async function POST(request: Request) {
  try {
    const { movieName } = await request.json();
    if (!movieName) {
      return NextResponse.json(
        { error: 'Please provide a movie title' },
        { status: 400 }
      );
    }

    // Extract movie title, year, and director from our format
    const { title, year, director } = extractMovieInfo(movieName);
    
    const tmdbApiKey = process.env.TMDB_API_KEY;
    if (!tmdbApiKey) {
      return NextResponse.json(
        { error: 'Movie API key is not configured' },
        { status: 500 }
      );
    }

    // Try exact title match first, then cleaned title if needed
    console.log('Searching for movie:', { original: title, year });

    // First, try searching with the exact title
    let searchResponse = await axios.get(
      `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(title)}${year ? `&year=${year}` : ''}`,
      {
        headers: {
          'Authorization': `Bearer ${tmdbApiKey}`,
          'accept': 'application/json'
        }
      }
    );

    // If exact title search doesn't yield good results, try with cleaned title
    if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
      const cleanedTitle = cleanMovieTitle(title);
      console.log('Trying cleaned title:', cleanedTitle);
      searchResponse = await axios.get(
        `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(cleanedTitle)}${year ? `&year=${year}` : ''}`,
        {
          headers: {
            'Authorization': `Bearer ${tmdbApiKey}`,
            'accept': 'application/json'
          }
        }
      );
    }

    if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
      // If no exact match found, try a broader search without the year using cleaned title
      const cleanedTitle = cleanMovieTitle(title);
      const broadSearchResponse = await axios.get(
        `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(cleanedTitle)}`,
        {
          headers: {
            'Authorization': `Bearer ${tmdbApiKey}`,
            'accept': 'application/json'
          }
        }
      );

      if (!broadSearchResponse.data.results || broadSearchResponse.data.results.length === 0) {
        throw new Error('Movie not found');
      }

      // Use the first result from broad search
      searchResponse.data.results = broadSearchResponse.data.results;
    }

    // Rank by popularity, with exact title/year matches acting as a boost rather
    // than an absolute override (see rankTmdbCandidates for why that matters).
    const sortedResults = rankTmdbCandidates(searchResponse.data.results, title, year);
    
    // Get the most popular result
    const movieData = sortedResults[0];

    // Get detailed movie info including credits and watch providers
    const detailsResponse = await axios.get(
      `https://api.themoviedb.org/3/movie/${movieData.id}?append_to_response=credits,watch/providers`,
      {
        headers: {
          'Authorization': `Bearer ${tmdbApiKey}`,
          'accept': 'application/json'
        }
      }
    );

    const movie_data = detailsResponse.data;
    
    // Format genres into a string
    const genres = movie_data.genres.map((g: { name: string }) => g.name).join(', ');

    // Get top cast members (up to 3)
    const topCast = movie_data.credits.cast
      .slice(0, 3)
      .map((actor: { name: string }) => actor.name)
      .join(', ');

    // Structured streaming providers (used for the streaming-service filter)
    const streamingProviders: string[] = movie_data['watch/providers']?.results?.US?.flatrate
      ? movie_data['watch/providers'].results.US.flatrate.map((provider: { provider_name: string }) => provider.provider_name)
      : [];

    // Format streaming providers text for the mobile description
    const streamingInfo = streamingProviders.length > 0
      ? `\n🎬 Movie Availability: ${streamingProviders.slice(0, 3).join(', ')}`
      : `\n🎬 Movie Availability: Check streaming platforms`;

    const genreNames: string[] = movie_data.genres.map((g: { name: string }) => g.name);

    // Return comprehensive movie information with TMDB attribution
    return NextResponse.json({
      description: `${movie_data.overview}\n\n🎭 Cast: ${topCast}\n⭐ Rating: ${movie_data.vote_average.toFixed(1)}/10\n🎬 ${genres}\n⏱️ ${Math.floor(movie_data.runtime / 60)}h ${movie_data.runtime % 60}min${streamingInfo}\n\nClick image for more info`,
      poster_path: movie_data.poster_path ? `https://image.tmdb.org/t/p/w500${movie_data.poster_path}` : null,
      title: movie_data.title,
      tmdb_url: `https://www.themoviedb.org/movie/${movie_data.id}`,
      streaming: streamingProviders,
      genres: genreNames
    });
    
  } catch (error: unknown) {
    const tmdbError = error as TMDBError;
    console.error('Detailed error:', {
      message: tmdbError.message,
      type: tmdbError.type,
      response: tmdbError.response?.data,
      status: tmdbError.response?.status
    });
    
    let errorMessage = 'Failed to get movie details';
    
    if (!process.env.TMDB_API_KEY) {
      errorMessage = 'API key not configured properly';
    } else if (tmdbError.response?.status === 401) {
      errorMessage = 'Invalid API key';
    } else if (tmdbError.message) {
      errorMessage = `Error: ${tmdbError.message}`;
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: tmdbError.response?.status || 500 }
    );
  }
} 