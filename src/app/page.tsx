'use client';

import { useState, useEffect, FormEvent, KeyboardEvent } from 'react';
import axios, { AxiosError } from 'axios';
import Image from 'next/image';

interface MovieDescription {
  title: string;
  description: string;
  poster_path: string;
  cast?: string[];
  streaming?: string[];
  trailer?: string;
  tmdb_url?: string;
}

interface TrendingMovie {
  id: number;
  title: string;
  poster_path: string;
  vote_average: number;
}



export default function Home() {
  const [movies, setMovies] = useState('');
  const [recommendations, setRecommendations] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trendingMovies, setTrendingMovies] = useState<TrendingMovie[]>([]);
  const [descriptions, setDescriptions] = useState<Record<string, MovieDescription>>({});
  const [loadingDescriptions, setLoadingDescriptions] = useState<Record<string, boolean>>({});
  const [showingDetails, setShowingDetails] = useState<Record<string, boolean>>({});


  const fetchTrendingMovies = async () => {
    try {
      const response = await axios.get<{ results: TrendingMovie[] }>('/api/trending');
      setTrendingMovies(response.data.results);
    } catch (err) {
      console.error('Error fetching trending movies:', err);
    }
  };

  useEffect(() => {
    fetchTrendingMovies();
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setRecommendations(null);
    setDescriptions({});
    setShowingDetails({});

    try {
      const response = await axios.post<{ recommendations: string }>('/api/recommend', { movies });
      setRecommendations(response.data.recommendations);
    } catch (err) {
      const error = err as AxiosError<{ error: string }>;
      const errorMessage = error.response?.data?.error || 'Failed to get recommendations. Please try again.';
      setError(errorMessage);
      console.error('Error details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchDescription = async (movie: string) => {
    if (descriptions[movie]) {
      setShowingDetails(prev => ({ ...prev, [movie]: !prev[movie] }));
      return;
    }

    setLoadingDescriptions(prev => ({ ...prev, [movie]: true }));
    try {
      const response = await axios.post<MovieDescription>('/api/description', { movieName: movie });
      setDescriptions(prev => ({ ...prev, [movie]: response.data }));
      setShowingDetails(prev => ({ ...prev, [movie]: true }));
    } catch (err) {
      const error = err as AxiosError;
      console.error(`Error fetching description for ${movie}:`, error);
      setDescriptions(prev => ({
        ...prev,
        [movie]: { description: 'Failed to load description.', poster_path: '', title: movie },
      }));
    } finally {
      setLoadingDescriptions(prev => ({ ...prev, [movie]: false }));
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent<HTMLFormElement>);
    }
  };

  const parseRecommendations = (text: string | null) => {
    if (!text) return [];
    return text.split('\n').filter(line => line.trim() !== '');
  };

  const recommendationList = parseRecommendations(recommendations);

  return (
    <div className="min-h-screen bg-black text-white font-sans" style={{ overflowX: 'hidden', backgroundColor: '#000000' }}>
      <main className="flex flex-col items-center py-10 px-4">
        {/* Main Input and Recommendations Section */}
        <div className="w-full max-w-4xl">
          <div className="bg-black/40 backdrop-blur-md p-8 rounded-2xl shadow-2xl w-full">
            <h1 className="text-4xl font-bold text-center text-white mb-2">Toss the Remote</h1>
            <p className="text-center text-gray-300 mb-6">Enter movies you like, get recommendations you&apos;ll love.</p>
            <form onSubmit={handleSubmit} className="space-y-6">
              <textarea
                value={movies}
                onChange={(e) => setMovies(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Enter your favorite movies separated by commas (e.g., The Dark Knight, Inception, Interstellar)"
                className="w-full p-4 bg-white/5 rounded-lg min-h-[120px] transition duration-200 ease-in-out text-base text-white placeholder-gray-400 resize-none"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#EE0000] text-white py-4 px-8 rounded-lg hover:bg-[#CC0000] disabled:bg-red-900/50 transition-all duration-200 ease-in-out font-semibold text-base shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none disabled:hover:shadow-none"
              >
                {isLoading ? 'Finding Perfect Matches...' : 'Get Recommendations'}
              </button>
            </form>
          </div>

          {error && <div className="mt-6 text-red-400 bg-red-900/50 p-4 rounded-lg">{error}</div>}

          {recommendationList.length > 0 && (
            <div className="mt-8 w-full">
              <h2 className="text-3xl font-bold text-center mb-6">Your Recommendations</h2>
              <div className="space-y-4">
                {recommendationList.map((movie, index) => (
                  <div key={index} className="bg-white/5 p-4 rounded-lg">
                    <div className="flex items-center justify-between">
                      <p className="text-lg font-medium text-white flex-grow pr-4">{movie}</p>
                      <button
                        onClick={() => fetchDescription(movie)}
                        className={`px-6 py-2.5 rounded-lg text-sm font-semibold min-w-[120px] ${
                          loadingDescriptions[movie]
                            ? 'bg-gray-600 animate-pulse'
                            : showingDetails[movie]
                            ? 'bg-gray-500 hover:bg-gray-400'
                            : 'bg-red-600 hover:bg-red-500'
                        } transition-all duration-200`}
                        disabled={loadingDescriptions[movie]}
                      >
                        {loadingDescriptions[movie]
                          ? 'Loading...'
                          : showingDetails[movie]
                          ? 'Hide Details'
                          : 'Get Details'}
                      </button>
                    </div>
                    
                    {/* Movie Details Section */}
                    {showingDetails[movie] && descriptions[movie] && (
                      <div className="mt-4 pt-4 border-t border-white/10">
                                                 <div className="flex gap-6">
                           {descriptions[movie].poster_path && (
                             <div className="flex-shrink-0">
                               <a
                                 href={descriptions[movie].tmdb_url || '#'}
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="block hover:opacity-80 transition-opacity duration-200"
                               >
                                 <Image
                                   src={descriptions[movie].poster_path}
                                   alt={descriptions[movie].title || movie}
                                   width={120}
                                   height={180}
                                   className="object-cover"
                                   style={{
                                     borderRadius: '12px',
                                     border: '1px solid rgba(255, 255, 255, 0.2)'
                                   }}
                                 />
                               </a>
                             </div>
                           )}
                          <div className="flex-grow">
                            <div className="text-gray-300 text-sm whitespace-pre-line">
                              {descriptions[movie].description}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Trending Section */}
        {!recommendations && (
          <section className="w-full max-w-7xl mt-16">
            <h2 className="text-3xl font-bold text-white mb-6 text-center">Trending This Week</h2>
            <div className="relative group">
              <div
                id="trending-container"
                className="flex overflow-x-auto w-full scroll-smooth hide-scrollbar"
                style={{ 
                  gap: '25px',
                  paddingTop: '20px',
                  paddingBottom: '64px',
                  paddingLeft: '0px',
                  paddingRight: '0px'
                }}
              >
                {trendingMovies
                  .filter((movie) => movie.poster_path)
                  .map((movie) => (
                    <a
                      key={movie.id}
                      href={`https://www.themoviedb.org/movie/${movie.id}`}
          target="_blank"
          rel="noopener noreferrer"
                      className="relative block flex-shrink-0 rounded-[40px] overflow-hidden transition-all duration-300 shadow-xl hover:shadow-red-500/60 hover:scale-105 trending-poster"
                      style={{ 
                        width: '350px',
                        height: '525px',
                        border: '2px solid rgba(255, 255, 255, 0.7)' 
                      }}
        >
          <Image
                        src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                        alt={movie.title}
                        fill
                        className="object-cover"
                        sizes="300px"
                      />
                    </a>
                  ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
