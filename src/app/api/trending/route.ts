import { NextResponse } from 'next/server';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

interface TrendingMovie {
  id: number;
  title: string;
  poster_path: string;
  release_date: string;
  vote_average: number;
}

interface TrendingResponse {
  results: TrendingMovie[];
}

interface TMDBError {
  message: string;
  type?: string;
  response?: {
    data?: unknown;
    status?: number;
  };
}

export async function GET() {
  try {
    if (!TMDB_API_KEY) {
      console.error('TMDB_API_KEY is not set in environment variables.');
      return NextResponse.json(
        { error: 'Server configuration error: TMDB API key is missing.' },
        { status: 500 }
      );
    }

    console.log('Attempting to fetch trending movies from TMDB.');
    const response = await fetch(
      `${TMDB_BASE_URL}/trending/movie/week`,
      {
        headers: {
          'Authorization': `Bearer ${TMDB_API_KEY}`,
          'accept': 'application/json'
        }
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch trending movies: ${response.status} - ${errorText}`);
      throw new Error(`Failed to fetch trending movies: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as TrendingResponse;
    console.log('Successfully fetched trending movies.', data.results.length);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const tmdbError = error as TMDBError;
    console.error('Error fetching trending movies:', {
      message: tmdbError.message,
      type: tmdbError.type,
      response: tmdbError.response?.data,
      status: tmdbError.response?.status
    });
    
    return NextResponse.json(
      { error: 'Failed to fetch trending movies' },
      { status: tmdbError.response?.status || 500 }
    );
  }
} 