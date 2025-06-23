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

interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string;
  release_date: string;
  vote_average: number;
  credits?: {
    cast: Array<{
      name: string;
      character: string;
    }>;
  };
  videos?: {
    results: Array<{
      key: string;
      type: string;
    }>;
  };
}

interface TMDBResponse {
  results: TMDBMovie[];
}

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

    // Extract movie title and year from our format
    const { title, year } = extractMovieInfo(movieName);
    
    const tmdbApiKey = process.env.TMDB_API_KEY;
    if (!tmdbApiKey) {
      return NextResponse.json(
        { error: 'Movie API key is not configured' },
        { status: 500 }
      );
    }

    // Clean up the title for searching
    const searchTitle = cleanMovieTitle(title);
    console.log('Searching for movie:', { original: title, cleaned: searchTitle, year });

    // First, search for the movie to get its TMDB ID
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

    // Get detailed movie info including credits
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
    const genres = movie_data.genres.map((g: any) => g.name).join(', ');

    // Get top cast members (up to 3)
    const topCast = movie_data.credits.cast
      .slice(0, 3)
      .map((actor: any) => actor.name)
      .join(', ');

    // Format streaming providers if available
    let streamingInfo = '';
    if (movie_data['watch/providers']?.results?.US?.flatrate) {
      const providers = movie_data['watch/providers'].results.US.flatrate
        .slice(0, 3)
        .map((provider: any) => provider.provider_name)
        .join(', ');
      streamingInfo = `\n🎬 Movie Availability: ${providers}`;
    } else {
      streamingInfo = `\n🎬 Movie Availability: Check streaming platforms`;
    }

    // Return comprehensive movie information with TMDB attribution
    return NextResponse.json({
      description: `${movie_data.overview}\n\n🎭 Cast: ${topCast}\n⭐ Rating: ${movie_data.vote_average.toFixed(1)}/10\n🎬 ${genres}\n⏱️ ${Math.floor(movie_data.runtime / 60)}h ${movie_data.runtime % 60}min${streamingInfo}\n\nClick image for more info`,
      poster_path: movie_data.poster_path ? `https://image.tmdb.org/t/p/w500${movie_data.poster_path}` : null,
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