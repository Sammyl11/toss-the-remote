import { NextResponse } from 'next/server';
import axios from 'axios';

// Helper function to extract the movie title from our format "Title (Year) - Director"
const extractMovieInfo = (movieString: string) => {
  // Remove extra spaces and normalize quotes
  const normalizedString = movieString
    .replace(/\s+/g, ' ')
    .replace(/[""]/g, '"')
    .trim();

  // Try to match "Title (Year) - Director" format
  const match = normalizedString.match(/(.+?)\s*\((\d{4})\)/i);
  if (match) {
    return {
      title: match[1].trim(),
      year: match[2]
    };
  }

  // If no match, just take everything before the hyphen or the whole string
  const title = normalizedString.split('-')[0].trim();
  return {
    title,
    year: ''
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
        { error: 'Movie name is required' },
        { status: 400 }
      );
    }

    const tmdbApiKey = process.env.TMDB_API_KEY;
    if (!tmdbApiKey) {
      return NextResponse.json(
        { error: 'TMDB API key not configured' },
        { status: 500 }
      );
    }

    // Extract movie info from the formatted string
    const { title, year } = extractMovieInfo(movieName);
    const searchTitle = cleanMovieTitle(title);

    // Search for the movie on TMDB
    const searchResponse = await axios.get(
      `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(searchTitle)}${year ? `&year=${year}` : ''}`,
      {
        headers: {
          'Authorization': `Bearer ${tmdbApiKey}`,
          'accept': 'application/json'
        }
      }
    );

    if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
      // If no exact match found, try a broader search without the year
      const broadSearchResponse = await axios.get(
        `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(searchTitle)}`,
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

    // Get the first (most relevant) result
    const movieData = searchResponse.data.results[0];

    // Get detailed movie info including credits, videos, and watch providers
    const detailsResponse = await axios.get(
      `https://api.themoviedb.org/3/movie/${movieData.id}?append_to_response=credits,videos,watch/providers`,
      {
        headers: {
          'Authorization': `Bearer ${tmdbApiKey}`,
          'accept': 'application/json'
        }
      }
    );

    const movie_data = detailsResponse.data;
    
    // Format genres into array
    const genres = movie_data.genres.map((g: { name: string }) => g.name);

    // Get director from crew
    const director = movie_data.credits.crew.find((person: { job: string }) => person.job === 'Director')?.name || '';

    // Get top cast members (up to 6)
    const topCast = movie_data.credits.cast
      .slice(0, 6)
      .map((actor: { name: string }) => actor.name);

    // Get trailer URL if available
    const trailerVideo = movie_data.videos?.results?.find(
      (video: { type: string, site: string }) => video.type === 'Trailer' && video.site === 'YouTube'
    );
    const trailerUrl = trailerVideo ? `https://www.youtube.com/watch?v=${trailerVideo.key}` : null;

    // Format streaming providers array
    const streamingProviders = movie_data['watch/providers']?.results?.US?.flatrate
      ? movie_data['watch/providers'].results.US.flatrate
          .slice(0, 5)
          .map((provider: { provider_name: string }) => provider.provider_name)
      : [];

    // Return comprehensive movie information for desktop modal
    return NextResponse.json({
      title: movie_data.title,
      description: movie_data.overview,
      poster_path: movie_data.poster_path ? `https://image.tmdb.org/t/p/w500${movie_data.poster_path}` : null,
      backdrop_path: movie_data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie_data.backdrop_path}` : null,
      cast: topCast,
      director: director,
      genres: genres,
      runtime: movie_data.runtime,
      rating: movie_data.vote_average,
      year: new Date(movie_data.release_date).getFullYear(),
      streaming: streamingProviders,
      trailer: trailerUrl,
      tmdb_url: `https://www.themoviedb.org/movie/${movie_data.id}`
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