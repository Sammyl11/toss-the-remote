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

interface TMDBSearchResult {
  id: number;
  title: string;
  release_date: string;
  vote_count: number;
  vote_average: number;
  poster_path: string | null;
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

    // Sort results with priority: exact title+year match > exact title match > popularity
    const sortedResults = searchResponse.data.results.sort((a: TMDBSearchResult, b: TMDBSearchResult) => {
      // Check for exact title match (case insensitive)
      const exactTitleA = a.title.toLowerCase() === title.toLowerCase() ? 1 : 0;
      const exactTitleB = b.title.toLowerCase() === title.toLowerCase() ? 1 : 0;
      
      // Check for exact year match if year is provided
      let exactYearA = 0;
      let exactYearB = 0;
      if (year) {
        const yearA = new Date(a.release_date).getFullYear().toString();
        const yearB = new Date(b.release_date).getFullYear().toString();
        exactYearA = yearA === year ? 1 : 0;
        exactYearB = yearB === year ? 1 : 0;
      }
      
      // Calculate combined match score (title + year)
      const combinedScoreA = exactTitleA * 2 + exactYearA;
      const combinedScoreB = exactTitleB * 2 + exactYearB;
      
      // If combined scores are different, prioritize higher score
      if (combinedScoreA !== combinedScoreB) {
        return combinedScoreB - combinedScoreA;
      }
      
      // If combined scores are equal, sort by popularity
      const popularityA = (a.vote_count || 0) * (a.vote_average || 0);
      const popularityB = (b.vote_count || 0) * (b.vote_average || 0);
      return popularityB - popularityA; // Descending order
    });
    
    // Get the most popular result
    const movieData = sortedResults[0];

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