'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';

interface MovieDescription {
  description: string;
  poster_path: string | null;
  tmdb_url: string;
}

interface MovieDescriptions {
  [key: string]: MovieDescription;
}

interface BackgroundMovie {
  poster_path: string;
  id: number;
  title: string;
}

export default function Home() {
  const [movies, setMovies] = useState('');
  const [recommendations, setRecommendations] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [descriptions, setDescriptions] = useState<MovieDescriptions>({});
  const [loadingDescriptions, setLoadingDescriptions] = useState<{[key: string]: boolean}>({});
  const [showingDetails, setShowingDetails] = useState<{[key: string]: boolean}>({});
  const [backgroundMovies, setBackgroundMovies] = useState<BackgroundMovie[]>([]);

  useEffect(() => {
    const fetchBackgroundMovies = async () => {
      try {
        const response = await axios.get('/api/trending');
        setBackgroundMovies(response.data.results);
      } catch (err) {
        console.error('Error fetching background movies:', err);
      }
    };

    fetchBackgroundMovies();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setDescriptions({});
    setShowingDetails({});
    
    try {
      const response = await axios.post('/api/recommend', { movies });
      setRecommendations(response.data.recommendations);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to get recommendations. Please try again.';
      setError(errorMessage);
      console.error('Error details:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleMovieDetails = async (movie: string) => {
    if (descriptions[movie]) {
      // If we already have the description, just toggle visibility
      setShowingDetails(prev => ({
        ...prev,
        [movie]: !prev[movie]
      }));
    } else {
      // If we don't have the description yet, fetch it and show it
      setLoadingDescriptions(prev => ({ ...prev, [movie]: true }));
      try {
        const response = await axios.post('/api/description', { movie });
        setDescriptions(prev => ({
          ...prev,
          [movie]: response.data as MovieDescription
        }));
        setShowingDetails(prev => ({
          ...prev,
          [movie]: true
        }));
      } catch (err: any) {
        setDescriptions(prev => ({
          ...prev,
          [movie]: {
            description: 'Failed to load description.',
            poster_path: null,
            tmdb_url: ''
          }
        }));
      } finally {
        setLoadingDescriptions(prev => ({ ...prev, [movie]: false }));
      }
    }
  };

  const formatRecommendations = (text: string) => {
    if (!text) return [];
    return text.split('\n');
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <header className="bg-black py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-white text-center font-['Montserrat'] tracking-wide">
            TOSS THE REMOTE
          </h1>
        </div>
      </header>

      <main className="relative flex-grow">
        {/* Background Movie Section */}
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black/60 to-black/80 z-0">
          <div className="absolute inset-0 opacity-30">
            <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 p-2">
              {backgroundMovies.map((movie) => (
                <div key={movie.id} className="aspect-[2/3] relative group rounded-lg shadow-[0_0_20px_rgba(238,0,0,0.5)] hover:shadow-[0_0_50px_rgba(238,0,0,0.9)] transition-shadow duration-500">
                  <img
                    src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                    alt=""
                    className="w-full h-full object-cover rounded-lg transform group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-16">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">
              Find Your Next Favorite Movie
            </h2>
            <p className="text-base text-gray-300">
              Enter your favorite movies and get personalized recommendations powered by AI
            </p>
          </div>
          
          <div className="bg-white/10 backdrop-blur-sm rounded-xl shadow-2xl border border-white/20 p-6 mb-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="movies" className="block text-lg font-medium text-white mb-3">
                  Your Favorite Movies
                </label>
                <textarea
                  id="movies"
                  value={movies}
                  onChange={(e) => setMovies(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault(); // Prevent default behavior (e.g., new line)
                      handleSubmit(e); // Call the form submission handler
                    }
                  }}
                  placeholder="Enter your favorite movies separated by commas (e.g., The Dark Knight, Inception, Interstellar)"
                  className="w-full p-4 bg-white/5 border border-white/20 rounded-lg min-h-[120px] focus:ring-2 focus:ring-[#EE0000] focus:border-transparent transition duration-200 ease-in-out text-base text-white placeholder-gray-400 resize-none"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#EE0000] text-white py-4 px-8 rounded-lg hover:bg-[#CC0000] disabled:bg-red-900/50 transition-all duration-200 ease-in-out font-semibold text-base shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none disabled:hover:shadow-none"
              >
                {loading ? 'Finding Perfect Matches...' : 'Get Recommendations'}
              </button>
            </form>
          </div>

          {/* Trending Movies Section */}
          {!recommendations && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white mb-3">Trending This Week</h2>
              <div className="relative bg-white/10 backdrop-blur-sm rounded-lg">
                <div className="overflow-x-auto overflow-y-hidden hide-scrollbar p-4">
                  <div className="flex min-w-max" style={{ gap: '32px' }}>
                    {backgroundMovies.slice(0, 12).map((movie) => (
                      <div key={movie.id} className="flex-none" style={{ width: '288px' }}>
                        <div className="relative aspect-[2/3] overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 border border-white/20" style={{ borderRadius: '8px' }}>
                          <a 
                            href={`https://www.themoviedb.org/movie/${movie.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full h-full"
                          >
                            <img
                              src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                              alt={movie.title}
                              className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-300 brightness-110"
                            />
                          </a>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            <div className="absolute bottom-0 left-0 right-0 p-1">
                              <p className="text-white text-[10px] font-medium truncate">
                                {movie.title}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-900/50 border border-red-500/50 text-red-200 p-4 rounded-lg mb-8 text-center animate-shake">
              {error}
            </div>
          )}

          {recommendations && (
            <div className="bg-white/10 backdrop-blur-sm rounded-xl shadow-2xl border border-white/20 p-8">
              <h2 className="text-2xl font-semibold mb-8 text-white">
                Your Personalized Recommendations
              </h2>
              <div className="space-y-6">
                {formatRecommendations(recommendations).map((movie, index) => (
                  <div key={index} className="bg-white/5 backdrop-blur-sm rounded-lg p-6 hover:bg-white/10 transition-all duration-200 transform hover:-translate-y-0.5">
                    <div className="flex flex-col gap-4">
                      <div className="flex justify-between items-center">
                        <p className="text-lg font-medium text-white flex-grow pr-4">{movie}</p>
                        <button
                          onClick={() => toggleMovieDetails(movie)}
                          className={`px-6 py-2.5 rounded-lg text-sm font-semibold min-w-[120px] ${
                            loadingDescriptions[movie]
                              ? 'bg-gray-700 text-gray-300'
                              : showingDetails[movie]
                              ? 'bg-red-900/50 text-red-200 border border-red-500/50 hover:bg-red-900/70'
                              : 'bg-[#EE0000] text-white hover:bg-[#CC0000]'
                          } transition-all duration-200 transform hover:-translate-y-0.5 hover:shadow-lg`}
                        >
                          {loadingDescriptions[movie]
                            ? 'Loading...'
                            : showingDetails[movie]
                            ? 'Hide Details'
                            : descriptions[movie]
                            ? 'Show Details'
                            : 'Get Details'}
                        </button>
                      </div>
                      {descriptions[movie] && showingDetails[movie] && (
                        <div className="mt-2 animate-fade-in">
                          <div className="flex gap-32">
                            {descriptions[movie].poster_path && (
                              <div style={{ marginRight: '32px' }}>
                                <a 
                                  href={descriptions[movie].tmdb_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="relative group flex-shrink-0"
                                >
                                  <img 
                                    src={descriptions[movie].poster_path} 
                                    alt={movie}
                                    className="object-cover rounded-xl shadow-lg"
                                    style={{ 
                                      width: '180px', 
                                      height: '300px',
                                      border: '2px solid white',
                                      borderRadius: '0.75rem'
                                    }}
                                  />
                                </a>
                              </div>
                            )}
                            <p className="text-sm text-gray-300 flex-grow leading-relaxed whitespace-pre-line">
                              {descriptions[movie].description}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fios TV Logo at bottom of content */}
          {/*
          <div className="text-center pb-0" style={{ marginTop: '42px' }}>
            <img src="/fios-logo.png" alt="Fios TV" style={{ height: '40px' }} className="w-auto mx-auto opacity-80" />
          </div>
          */}

        </div>{/* closes max-w-3xl mx-auto div */}
      </main>

    </div>
  );
}
