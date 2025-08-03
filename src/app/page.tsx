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
  release_date: string;
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
  const [mobilePosters, setMobilePosters] = useState<Record<string, string>>({});
  const [loadingMobilePosters, setLoadingMobilePosters] = useState<Record<string, boolean>>({});
  const [mobileRatings, setMobileRatings] = useState<Record<string, string>>({});
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [previousMovies, setPreviousMovies] = useState<string[]>([]);
  const [showingMobileForm, setShowingMobileForm] = useState(true);
  const [showingMobileTrending, setShowingMobileTrending] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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
    setPreviousMovies([]);

    try {
      // Parse input movies to exclude them from recommendations
      const inputMovies = parseInputMovies(movies);
      
      const response = await axios.post<{ recommendations: string }>('/api/recommend', { 
        movies, 
        excludeMovies: inputMovies 
      });
      setRecommendations(response.data.recommendations);
      const movieList = response.data.recommendations.split('\n').filter(line => line.trim() !== '');
      setPreviousMovies([...inputMovies, ...movieList]);
      
      // Load mobile posters sequentially
      loadAllMobilePosters(movieList);
    } catch (err) {
      const error = err as AxiosError<{ error: string }>;
      const errorMessage = error.response?.data?.error || 'Failed to get recommendations. Please try again.';
      setError(errorMessage);
      console.error('Error details:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGetMoreMovies = async () => {
    setIsLoadingMore(true);
    setError(null);
    setDescriptions({});
    setShowingDetails({});

    try {
      // Parse input movies and combine with previous recommendations for exclusion
      const inputMovies = parseInputMovies(movies);
      const allExcludedMovies = [...new Set([...inputMovies, ...previousMovies])]; // Remove duplicates
      
      const response = await axios.post<{ recommendations: string }>('/api/recommend', { 
        movies, 
        excludeMovies: allExcludedMovies 
      });
      setRecommendations(response.data.recommendations);
      const newMovieList = response.data.recommendations.split('\n').filter(line => line.trim() !== '');
      setPreviousMovies(prev => [...prev, ...newMovieList]);
      
      // Load new mobile posters sequentially
      loadAllMobilePosters(newMovieList);
    } catch (err) {
      const error = err as AxiosError<{ error: string }>;
      const errorMessage = error.response?.data?.error || 'Failed to get more recommendations. Please try again.';
      setError(errorMessage);
      console.error('Error details:', err);
    } finally {
      setIsLoadingMore(false);
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

  const loadMobilePoster = async (movie: string) => {
    if (mobilePosters[movie] || loadingMobilePosters[movie]) {
      return;
    }

    console.log(`Starting to load poster for: ${movie}`);
    setLoadingMobilePosters(prev => ({ ...prev, [movie]: true }));
    
    try {
      const response = await axios.post<MovieDescription>('/api/description', { movieName: movie });
      console.log(`Got poster response for ${movie}:`, response.data.poster_path);
      
      if (response.data.poster_path) {
        setMobilePosters(prev => ({ ...prev, [movie]: response.data.poster_path }));
      }
      
      // Store full description data
      setDescriptions(prev => ({ ...prev, [movie]: response.data }));
      
      // Extract and store rating
      const ratingMatch = response.data.description?.match(/⭐ Rating: ([\d.]+)\/10/);
      if (ratingMatch) {
        setMobileRatings(prev => ({ ...prev, [movie]: ratingMatch[1] }));
      }
    } catch (err) {
      console.error(`Failed to load poster for ${movie}:`, err);
    } finally {
      setLoadingMobilePosters(prev => ({ ...prev, [movie]: false }));
    }
  };

  const loadAllMobilePosters = async (movies: string[]) => {
    console.log(`Loading posters for ${movies.length} movies:`, movies);
    for (let i = 0; i < movies.length; i++) {
      const movie = movies[i];
      console.log(`Loading poster ${i + 1}/${movies.length}: ${movie}`);
      await loadMobilePoster(movie);
      // Wait 200ms between each request
      if (i < movies.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    console.log('Finished loading all mobile posters');
  };



  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent<HTMLFormElement>);
    }
  };

  const parseRecommendations = (text: string | null) => {
    if (!text) return [];
    const recommendations = text.split('\n').filter(line => line.trim() !== '');
    
    // Remove duplicates by normalizing titles for comparison
    const seen = new Set<string>();
    return recommendations.filter(movie => {
      // Extract just the title part for comparison (before year/director)
      const titlePart = movie.split(' (')[0].toLowerCase().trim();
      if (seen.has(titlePart)) {
        return false;
      }
      seen.add(titlePart);
      return true;
    });
  };

  // Helper function to parse and normalize input movies
  const parseInputMovies = (inputText: string): string[] => {
    if (!inputText.trim()) return [];
    
    // Split by commas and clean up each movie
    return inputText
      .split(',')
      .map(movie => movie.trim())
      .filter(movie => movie.length > 0)
      .map(movie => {
        // Try to normalize format to "Title (Year)" if possible
        // This helps with matching against recommendations
        const normalized = movie.trim();
        
        // If it already has a year in parentheses, return as-is
        if (/\(\d{4}\)/.test(normalized)) {
          return normalized;
        }
        
        // Otherwise return the cleaned title
        return normalized;
      });
  };

  const recommendationList = parseRecommendations(recommendations);

  // Show loading state while detecting device type to prevent flashing
  if (isMobile === null) {
    return (
      <div style={{ 
        minHeight: '100vh', 
        backgroundColor: '#000000', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center' 
      }}>
        <div style={{ color: '#ffffff', fontSize: '18px' }}>Loading...</div>
      </div>
    );
  }

  // Mobile Layout
  if (isMobile) {
  return (
      <div style={{ 
        minHeight: '100vh', 
        backgroundColor: '#000000', 
        color: '#ffffff', 
        padding: '20px 16px',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        {!recommendations ? (
          <>
            <div style={{ textAlign: 'center', marginBottom: '48px' }}>
              <h1 style={{ fontSize: '48px', fontWeight: 'bold', color: '#ffffff', marginBottom: '16px' }}>
                Toss the Remote
              </h1>
              <p style={{ color: '#9ca3af', fontSize: '18px', lineHeight: '1.6', maxWidth: '300px', margin: '0 auto' }}>
                Discover your next favorite movie with AI-powered recommendations based on your taste
              </p>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
              <button
                onClick={() => {
                  setShowingMobileForm(true);
                  setShowingMobileTrending(false);
                }}
                style={{
                  flex: 1,
                  backgroundColor: showingMobileForm ? '#8b5cf6' : 'rgba(255, 255, 255, 0.1)',
                  color: showingMobileForm ? '#ffffff' : '#9ca3af',
                  padding: '16px',
                  borderRadius: '12px',
                  border: 'none',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Get Recommendations
              </button>
              <button
                onClick={() => {
                  setShowingMobileTrending(true);
                  setShowingMobileForm(false);
                }}
                style={{
                  flex: 1,
                  backgroundColor: showingMobileTrending ? '#8b5cf6' : 'rgba(255, 255, 255, 0.1)',
                  color: showingMobileTrending ? '#ffffff' : '#9ca3af',
                  padding: '16px',
                  borderRadius: '12px',
                  border: 'none',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Trending This Week
              </button>
            </div>

            {showingMobileForm && !recommendations && (
              <>
                <div style={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.1)', 
                  padding: '24px', 
                  borderRadius: '16px',
                  marginBottom: '32px',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}>
                  <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
                    Enter Your Favorite Movies
                  </h2>
                  <p style={{ color: '#9ca3af', marginBottom: '24px', fontSize: '14px' }}>
                    List movies you love, separated by commas. Our AI will find similar films you might enjoy&apos;!
                  </p>
                  <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <textarea
                      value={movies}
                      onChange={(e) => setMovies(e.target.value)}
                      placeholder="e.g., The Dark Knight, Inception, Pulp Fiction"
                      style={{
                        width: '100%',
                        padding: '16px',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        border: 'none',
                        borderRadius: '12px',
                        color: '#ffffff',
                        fontSize: '16px',
                        minHeight: '80px',
                        resize: 'none',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <button
                      type="submit"
                      disabled={isLoading}
                      style={{
                        backgroundColor: '#8b5cf6',
                        color: '#ffffff',
                        padding: '16px',
                        borderRadius: '12px',
                        border: 'none',
                        fontSize: '16px',
                        fontWeight: '600',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        opacity: isLoading ? 0.7 : 1
                      }}
                    >
                      {isLoading ? 'Finding Perfect Matches...' : 'Get Movie Recommendations'}
                    </button>
                  </form>
                </div>
              </>
            )}

            {showingMobileTrending && (
              <div style={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                padding: '24px', 
                borderRadius: '16px' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <span style={{ fontSize: '20px' }}>📈</span>
                  <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>Trending This Week</h2>
                </div>
                <p style={{ color: '#9ca3af', marginBottom: '24px', fontSize: '14px' }}>
                  The most popular movies everyone&apos;s talking about
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {trendingMovies.slice(0, 10).map((movie, index) => (
                    <div
                      key={movie.id}
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                        padding: '16px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        display: 'flex',
                        gap: '16px',
                        alignItems: 'flex-start',
                        width: '100%'
                      }}
                    >
                      <div style={{ flexShrink: 0 }}>
                        {movie.poster_path ? (
                          <a
                            href={`https://www.themoviedb.org/movie/${movie.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: 'block' }}
                          >
                            <Image
                              src={`https://image.tmdb.org/t/p/w500${movie.poster_path}`}
                              alt={movie.title}
                              width={80}
                              height={120}
                              className="object-cover"
                              style={{
                                borderRadius: '8px',
                                border: '1px solid rgba(255, 255, 255, 0.2)'
                              }}
                            />
                          </a>
                        ) : (
                          <div style={{
                            width: '80px',
                            height: '120px',
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#9ca3af',
                            fontSize: '12px'
                          }}>
                            No Image
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
                            {movie.title}
                          </h3>
                          <div style={{
                            backgroundColor: '#f59e0b',
                            color: '#000',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 'bold'
                          }}>
                            #{index + 1}
                          </div>
                        </div>
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '4px' }}>
                            {new Date(movie.release_date).getFullYear() || 'N/A'}
                          </div>
                          <div style={{ fontSize: '14px', color: '#fbbf24' }}>
                            ⭐ {movie.vote_average.toFixed(1)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h1 style={{ fontSize: '36px', fontWeight: 'bold', color: '#ffffff', marginBottom: '8px' }}>
                Toss the Remote
              </h1>
            </div>

            {/* Mobile Input Form */}
            <div style={{ 
              backgroundColor: 'rgba(255, 255, 255, 0.1)', 
              padding: '24px', 
              borderRadius: '16px',
              marginBottom: '16px',
              border: '1px solid rgba(255, 255, 255, 0.2)'
            }}>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
                Enter Your Favorite Movies
              </h2>
              <p style={{ color: '#9ca3af', marginBottom: '24px', fontSize: '14px' }}>
                List movies you love, separated by commas. Our AI will find similar films you might enjoy&apos;!
              </p>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <textarea
                  value={movies}
                  onChange={(e) => setMovies(e.target.value)}
                  placeholder="e.g., The Dark Knight, Inception, Pulp Fiction"
                  style={{
                    width: '100%',
                    padding: '16px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    borderRadius: '12px',
                    color: '#ffffff',
                    fontSize: '16px',
                    minHeight: '80px',
                    resize: 'none',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    backgroundColor: '#8b5cf6',
                    color: '#ffffff',
                    padding: '16px',
                    borderRadius: '12px',
                    border: 'none',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: isLoading ? 'not-allowed' : 'pointer',
                    opacity: isLoading ? 0.7 : 1
                  }}
                >
                  {isLoading ? 'Finding Perfect Matches...' : 'Get Movie Recommendations'}
                </button>
              </form>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '20px' }}>⭐</span>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>Recommended For You</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {recommendationList.map((movie, index) => (
                <div
                  key={index}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    padding: '16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    display: 'flex',
                    gap: '16px',
                    alignItems: 'flex-start',
                    width: '100%'
                  }}
                >
                  <div style={{ flexShrink: 0 }}>
                    {loadingMobilePosters[movie] ? (
                      <div style={{
                        width: '80px',
                        height: '120px',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#9ca3af',
                        fontSize: '12px'
                      }}>
                        Loading...
                      </div>
                    ) : mobilePosters[movie] ? (
                      <a
                        href={descriptions[movie]?.tmdb_url || '#'}
            target="_blank"
            rel="noopener noreferrer"
                        style={{ display: 'block' }}
          >
            <Image
                          src={mobilePosters[movie]}
                          alt={descriptions[movie]?.title || movie}
                          width={80}
                          height={120}
                          className="object-cover"
                          style={{
                            borderRadius: '8px',
                            border: '1px solid rgba(255, 255, 255, 0.2)'
                          }}
                        />
                      </a>
                    ) : null}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>
                        {movie.split(' (')[0]}
                      </h3>
                      <button
                        onClick={() => {
                          if (!descriptions[movie]) {
                            fetchDescription(movie);
                          } else {
                            setShowingDetails(prev => ({ ...prev, [movie]: !prev[movie] }));
                          }
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#9ca3af',
                          fontSize: '20px',
                          cursor: 'pointer',
                          padding: '4px',
                          transform: showingDetails[movie] ? 'rotate(180deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease'
                        }}
                      >
                        ▼
                      </button>
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '14px', color: '#9ca3af', marginBottom: '4px' }}>
                        {movie.match(/\((\d{4})\)/) ? movie.match(/\((\d{4})\)/)![1] : ''}
                      </div>
                      <div style={{ fontSize: '14px', color: '#fbbf24' }}>
                        ⭐ {mobileRatings[movie] || (loadingMobilePosters[movie] ? 'Loading...' : 'N/A')}
                      </div>
                    </div>
                    
                    {showingDetails[movie] && descriptions[movie] && (
                      <div style={{ 
                        marginTop: '16px', 
                        paddingTop: '16px', 
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                        width: 'calc(100% + 96px)',
                        marginLeft: '-96px',
                        paddingLeft: '96px'
                      }}>
                        <div style={{ 
                          color: '#e5e7eb', 
                          fontSize: '15px', 
                          lineHeight: '1.6',
                          marginBottom: '16px',
                          textAlign: 'left',
                          wordWrap: 'break-word',
                          maxWidth: '100%',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {descriptions[movie].description}
                        </div>
                        {descriptions[movie].streaming && descriptions[movie].streaming!.length > 0 && (
                          <div style={{ width: '100%' }}>
                            <h4 style={{ 
                              fontSize: '15px', 
                              fontWeight: '600', 
                              marginBottom: '10px',
                              color: '#ffffff'
                            }}>
                              Where to Watch:
                            </h4>
                            <div style={{ 
                              display: 'flex', 
                              flexWrap: 'wrap', 
                              gap: '8px',
                              width: '100%'
                            }}>
                              {descriptions[movie].streaming!.map((service, idx) => (
                                <span 
                                  key={idx}
                                  style={{
                                    backgroundColor: 'rgba(139, 92, 246, 0.2)',
                                    color: '#a78bfa',
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    fontSize: '13px',
                                    fontWeight: '500'
                                  }}
                                >
                                  {service}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
        </div>
            
            <div style={{ textAlign: 'center', marginTop: '32px' }}>
              <button
                onClick={handleGetMoreMovies}
                disabled={isLoadingMore}
                style={{
                  backgroundColor: isLoadingMore ? '#d1d5db' : '#ffffff',
                  color: isLoadingMore ? '#6b7280' : '#000000',
                  padding: '12px 24px',
                  borderRadius: '9999px',
                  fontWeight: '600',
                  fontSize: '16px',
                  border: 'none',
                  cursor: isLoadingMore ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease-in-out',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                  transform: 'translateY(0)',
                }}
              >
                {isLoadingMore ? 'Finding More Movies...' : 'Get 10 More Movies'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop Layout - Original
  return (
    <div className="min-h-screen bg-black text-white font-sans" style={{ overflowX: 'hidden', backgroundColor: '#000000' }}>
      <main className="flex flex-col items-center py-10 px-4">
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
              
              <div className="mt-8 text-center">
                <button
                  onClick={handleGetMoreMovies}
                  disabled={isLoadingMore}
                  style={{
                    backgroundColor: isLoadingMore ? '#d1d5db' : '#ffffff',
                    color: isLoadingMore ? '#6b7280' : '#000000',
                    padding: '12px 24px',
                    borderRadius: '9999px',
                    fontWeight: '600',
                    fontSize: '16px',
                    border: 'none',
                    cursor: isLoadingMore ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease-in-out',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    transform: 'translateY(0)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoadingMore) {
                      e.currentTarget.style.backgroundColor = '#f3f4f6';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isLoadingMore) {
                      e.currentTarget.style.backgroundColor = '#ffffff';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
                    }
                  }}
                >
                  {isLoadingMore ? 'Finding More Movies...' : 'Get 10 More Movies'}
                </button>
              </div>
            </div>
          )}
        </div>

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
