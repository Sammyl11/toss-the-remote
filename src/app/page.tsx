'use client';

import { useState, useEffect, FormEvent, KeyboardEvent } from 'react';
import axios, { AxiosError } from 'axios';
import Image from 'next/image';

interface MovieDescription {
  title: string;
  description: string; // Formatted description for mobile
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

interface ModalMovieData {
  title: string;
  description: string; // Clean overview for modal
  poster_path: string;
  backdrop_path?: string;
  cast?: string[];
  director?: string;
  genres?: string[];
  runtime?: number;
  rating?: number;
  year?: number;
  streaming?: string[];
  trailer?: string;
  tmdb_url?: string;
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
  const [modalMovie, setModalMovie] = useState<string | null>(null);
  const [modalData, setModalData] = useState<Record<string, ModalMovieData>>({});
  const [loadingModal, setLoadingModal] = useState<Record<string, boolean>>({});
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
  const [mobilePosters, setMobilePosters] = useState<Record<string, string>>({});
  const [loadingMobilePosters, setLoadingMobilePosters] = useState<Record<string, boolean>>({});
  const [mobileRatings, setMobileRatings] = useState<Record<string, string>>({});
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [previousMovies, setPreviousMovies] = useState<string[]>([]);
  const [showingTrailer, setShowingTrailer] = useState<{ [key: string]: boolean }>({});
  const [showingMobileForm, setShowingMobileForm] = useState(true);
  const [showingMobileTrending, setShowingMobileTrending] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  // Helper function to extract YouTube video ID from URL
  const getYouTubeVideoId = (url: string): string | null => {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
    return match ? match[1] : null;
  };

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
      console.log('Input movies for exclusion:', inputMovies);
      
      const response = await axios.post<{ recommendations: string }>('/api/recommend', { 
        movies, 
        excludeMovies: inputMovies 
      });
      setRecommendations(response.data.recommendations);
      const movieList = response.data.recommendations.split('\n').filter(line => line.trim() !== '');
      setPreviousMovies([...inputMovies, ...movieList]);
      
      // Load mobile posters sequentially (used by both mobile and desktop)
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
      
      // Load new mobile posters sequentially (used by both mobile and desktop)
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

  const fetchModalData = async (movie: string) => {
    if (modalData[movie] || loadingModal[movie]) {
      return;
    }

    setLoadingModal(prev => ({ ...prev, [movie]: true }));
    try {
      const response = await axios.post<ModalMovieData>('/api/modal', { movieName: movie });
      setModalData(prev => ({ ...prev, [movie]: response.data }));
    } catch (err) {
      const error = err as AxiosError;
      console.error(`Error fetching modal data for ${movie}:`, error);
      setModalData(prev => ({
        ...prev,
        [movie]: { 
          title: movie.split(' (')[0], 
          description: 'Failed to load movie details.',
          poster_path: ''
        },
      }));
    } finally {
      setLoadingModal(prev => ({ ...prev, [movie]: false }));
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
              <h1 style={{ fontSize: '48px', fontWeight: 'bold', background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 50%,rgb(148, 108, 157) 100%)',WebkitBackgroundClip: 'text',
             WebkitTextFillColor: 'transparent',
             backgroundClip: 'text', textShadow: '0 0 30px rgba(139, 92, 246, 0.4)',marginBottom: '16px' }}>
                
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
                      onKeyDown={handleKeyPress}
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
                  onKeyDown={handleKeyPress}
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
                          color: showingDetails[movie] ? '#8b5cf6' : '#9ca3af',
                          fontSize: '28px',
                          cursor: 'pointer',
                          padding: '8px',
                          minWidth: '40px',
                          minHeight: '40px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'color 0.2s ease'
                        }}
                      >
                        ≡
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
                    
                    {showingDetails[movie] && (
                      <div style={{ 
                        marginTop: '16px', 
                        paddingTop: '16px', 
                        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                        width: 'calc(100% + 96px)',
                        marginLeft: '-96px',
                        paddingLeft: '96px'
                      }}>
                        {loadingDescriptions[movie] ? (
                          <div style={{ color: '#9ca3af', fontSize: '14px', textAlign: 'center', padding: '20px' }}>
                            Loading description...
                          </div>
                        ) : descriptions[movie] ? (
                          <>
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
                                  {descriptions[movie].streaming!.map((service, index) => (
                                    <span 
                                      key={index}
                                      style={{
                                        backgroundColor: 'rgba(139, 92, 246, 0.2)',
                                        color: '#a78bfa',
                                        padding: '4px 12px',
                                        borderRadius: '20px',
                                        fontSize: '12px',
                                        fontWeight: '500'
                                      }}
                                    >
                                      {service}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              ))}
        </div>
            
            <div style={{ textAlign: 'center', marginTop: '32px', marginBottom: '60px' }}>
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
                {isLoadingMore ? 'Finding More Movies...' : 'Get More Movies'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Netflix-style Modal Component
  const NetflixModal = () => {
    if (!modalMovie) return null;
    
    if (loadingModal[modalMovie]) {
      return (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px'
          }}
          onClick={() => setModalMovie(null)}
        >
          <div style={{ 
            color: '#ffffff', 
            fontSize: '18px',
            textAlign: 'center'
          }}>
            Loading movie details...
          </div>
        </div>
      );
    }
    
    if (!modalData[modalMovie]) return null;
    
    const movie = modalData[modalMovie];
    
    return (
      <div 
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setModalMovie(null);
            setShowingTrailer({});
          }
        }}
      >
        <div 
          style={{
            backgroundColor: '#181818',
            borderRadius: '8px',
            maxWidth: '850px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'hidden',
            position: 'relative'
          }}
        >
          {/* Close Button */}
          <button
            onClick={() => {
              setModalMovie(null);
              setShowingTrailer({});
            }}
            style={{
              position: 'absolute',
              top: '15px',
              right: '15px',
              backgroundColor: '#181818',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 1001,
              fontSize: '18px',
              color: '#ffffff'
            }}
          >
            ✕
          </button>

          {/* Backdrop/Hero Section */}
          <div 
            style={{
              height: '480px',
              backgroundImage: movie.backdrop_path 
                ? `linear-gradient(to bottom, transparent 0%, rgba(24, 24, 24, 0.8) 100%), url(${movie.backdrop_path})`
                : `linear-gradient(135deg, #1f1f1f 0%, #2d2d2d 100%)`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              display: 'flex',
              alignItems: 'flex-end',
              padding: '40px',
              position: 'relative'
            }}
          >
            {/* Embedded Trailer Overlay */}
            {showingTrailer[modalMovie] && movie.trailer && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px',
                zIndex: 10
              }}>
                <div style={{
                  position: 'relative',
                  width: '100%',
                  maxWidth: '640px',
                  paddingBottom: '36%', // 16:9 aspect ratio for wider view
                  height: 0,
                  overflow: 'hidden',
                  borderRadius: '8px'
                }}>
                  <iframe
                    src={`https://www.youtube.com/embed/${getYouTubeVideoId(movie.trailer)}?autoplay=1&rel=0&modestbranding=1`}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      border: 'none'
                    }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            )}
            <div style={{ maxWidth: '60%' }}>
              <h1 style={{ 
                fontSize: '48px', 
                fontWeight: 'bold', 
                marginBottom: '16px',
                textShadow: '2px 2px 4px rgba(0,0,0,0.8)'
              }}>
                {movie.title || modalMovie.split(' (')[0]}
              </h1>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                {movie.rating && (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '4px',
                    fontSize: '16px',
                    fontWeight: '600'
                  }}>
                    <span style={{ color: '#fbbf24' }}>⭐</span>
                    <span>{movie.rating.toFixed(1)}</span>
                  </div>
                )}
                
                {movie.year && (
                  <span style={{ fontSize: '16px', color: '#d1d5db' }}>{movie.year}</span>
                )}
                
                {movie.runtime && (
                  <span style={{ fontSize: '16px', color: '#d1d5db' }}>
                    {Math.floor(movie.runtime / 60)}h {movie.runtime % 60}m
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                <button 
                  onClick={() => {
                    if (movie.trailer) {
                      setShowingTrailer(prev => ({ 
                        ...prev, 
                        [modalMovie]: !prev[modalMovie] 
                      }));
                    }
                  }}
                  style={{
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '12px 24px',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: movie.trailer ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    opacity: movie.trailer ? 1 : 0.5
                  }}
                >
                  ▶ {movie.trailer ? (showingTrailer[modalMovie] ? 'Hide Trailer' : 'Play Trailer') : 'No Trailer Available'}
                </button>
              </div>
            </div>
          </div>

          {/* Content Section */}
          <div style={{ padding: '40px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '40px' }}>
              {/* Left Column - Description and Cast */}
              <div>
                <div style={{ 
                  fontSize: '16px', 
                  lineHeight: '1.6', 
                  color: '#ffffff',
                  marginBottom: '24px'
                }}>
                  {(() => {
                    const maxLength = 300;
                    const isExpanded = expandedDescriptions[modalMovie];
                    const description = movie.description || '';
                    
                    if (description.length <= maxLength) {
                      return <p style={{ margin: 0 }}>{description}</p>;
                    }
                    
                    return (
                      <p style={{ margin: 0 }}>
                        {isExpanded ? description : `${description.substring(0, maxLength)}`}
                        <button
                          onClick={() => setExpandedDescriptions(prev => ({ 
                            ...prev, 
                            [modalMovie]: !prev[modalMovie] 
                          }))}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#8b5cf6',
                            cursor: 'pointer',
                            fontSize: '16px',
                            fontWeight: '600',
                            marginLeft: '4px',
                            padding: 0
                          }}
                        >
                          {isExpanded ? ' Show less' : '... Show more'}
                        </button>
                      </p>
                    );
                  })()}
                </div>
                
                {movie.cast && movie.cast.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <span style={{ color: '#777777', fontSize: '14px' }}>Cast: </span>
                    <span style={{ fontSize: '14px' }}>{movie.cast.join(', ')}</span>
                  </div>
                )}
                
                {movie.genres && movie.genres.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <span style={{ color: '#777777', fontSize: '14px' }}>Genres: </span>
                    <span style={{ fontSize: '14px' }}>{movie.genres.join(', ')}</span>
                  </div>
                )}
                
                {movie.director && (
                  <div style={{ marginBottom: '16px' }}>
                    <span style={{ color: '#777777', fontSize: '14px' }}>Director: </span>
                    <span style={{ fontSize: '14px' }}>{movie.director}</span>
                  </div>
                )}
              </div>
              
              {/* Right Column - Additional Info */}
              <div>
                {movie.streaming && movie.streaming.length > 0 && (
                  <div style={{ marginBottom: '24px' }}>
                    <h4 style={{ 
                      fontSize: '16px', 
                      fontWeight: '600', 
                      marginBottom: '12px',
                      color: '#ffffff'
                    }}>
                      Available On:
                    </h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {movie.streaming.map((service, index) => (
                        <span 
                          key={index}
                          style={{
                            backgroundColor: 'rgba(139, 92, 246, 0.2)',
                            color: '#a78bfa',
                            padding: '6px 12px',
                            borderRadius: '16px',
                            fontSize: '12px',
                            fontWeight: '500'
                          }}
                        >
                          {service}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {movie.tmdb_url && (
                  <a 
                    href={movie.tmdb_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{
                      color: '#8b5cf6',
                      textDecoration: 'none',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    View on TMDB →
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Desktop Layout - Redesigned
  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#000000', 
      color: '#ffffff', 
      fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundImage: 'radial-gradient(ellipse at center, rgba(139, 92, 246, 0.1) 0%, rgba(0, 0, 0, 1) 70%)',
      padding: '120px 20px 40px 20px'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                     <h1 style={{ 
             fontSize: '72px', 
             fontWeight: 'bold', 
             background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 50%, #ffffff 100%)',
             WebkitBackgroundClip: 'text',
             WebkitTextFillColor: 'transparent',
             backgroundClip: 'text',
             marginBottom: '16px',
             textShadow: '0 0 30px rgba(139, 92, 246, 0.4)'
           }}>
             Toss the Remote
           </h1>
          <p style={{ 
            fontSize: '20px', 
            color: '#ffffff', 
            fontWeight: '500',
            maxWidth: '600px',
            margin: '0 auto'
          }}>
            List movies you like, receive recommendations everyone can enjoy!
          </p>
        </div>

        {/* Search Input */}
        <div style={{ 
          maxWidth: '800px', 
          margin: '10px auto 20px auto',
          position: 'relative',
          display: 'flex',
          justifyContent: 'center'
        }}>
          <form onSubmit={handleSubmit} style={{ position: 'relative', width: '100%' }}>
            <div style={{ position: 'relative', marginBottom: '24px' }}>
              <div 
                id="search-icon"
                style={{
                  position: 'absolute',
                  left: '20px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#9ca3af',
                  fontSize: '28px',
                  zIndex: 1,
                  lineHeight: '1',
                  transition: 'all 0.3s ease',
                  pointerEvents: 'none'
                }}>
                🔍
              </div>
              <textarea
                value={movies}
                onChange={(e) => setMovies(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Input movies separated by commas ex. Dune 2, Midsommar, Whiplash"
                data-gramm="false"
                data-gramm_editor="false"
                data-enable-grammarly="false"
                spellCheck="false"
                style={{
                  width: '100%',
                  padding: '30px 24px 10px 60px',
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  border: 'none',
                  borderRadius: '50px',
                  color: '#000000',
                  fontSize: '22px',
                  fontWeight: '500',
                  minHeight: '50px',
                  resize: 'none',
                  outline: 'none',
                  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
                  transition: 'all 0.3s ease',
                  boxSizing: 'border-box',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  textAlign: 'left',
                  lineHeight: '1.2'
                }}
                onFocus={(e) => {
                  e.target.style.boxShadow = '0 15px 35px rgba(139, 92, 246, 0.4)';
                  e.target.style.transform = 'translateY(-2px)';
                  const icon = document.getElementById('search-icon');
                  if (icon) icon.style.transform = 'translateY(-50%) translateY(-2px)';
                }}
                onBlur={(e) => {
                  e.target.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.3)';
                  e.target.style.transform = 'translateY(0)';
                  const icon = document.getElementById('search-icon');
                  if (icon) icon.style.transform = 'translateY(-50%) translateY(0px)';
                }}
              />
            </div>
            
            <div style={{ textAlign: 'center' }}>
              <button
                type="submit"
                disabled={isLoading}
                style={{
                  backgroundColor: '#8b5cf6',
                  color: '#ffffff',
                  padding: '16px 48px',
                  borderRadius: '50px',
                  border: 'none',
                  fontSize: '18px',
                  fontWeight: '600',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.7 : 1,
                  transition: 'all 0.3s ease',
                  boxShadow: '0 8px 25px rgba(139, 92, 246, 0.4)',
                  minWidth: '200px'
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = '#7c3aed';
                    e.currentTarget.style.transform = 'translateY(-2px) scale(1.05)';
                    e.currentTarget.style.boxShadow = '0 12px 35px rgba(139, 92, 246, 0.5)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = '#8b5cf6';
                    e.currentTarget.style.transform = 'translateY(0) scale(1)';
                    e.currentTarget.style.boxShadow = '0 8px 25px rgba(139, 92, 246, 0.4)';
                  }
                }}
              >
                {isLoading ? 'Finding Movies...' : 'Get Movies'}
              </button>
            </div>
          </form>
        </div>

        {error && (
          <div style={{ 
            maxWidth: '800px', 
            margin: '0 auto 40px auto',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
            padding: '16px 24px',
            borderRadius: '12px',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        {/* Scroll Down Arrow */}
        <div style={{
          textAlign: 'center',
          margin: '80px 0 60px 0'
        }}>
          <div style={{
            fontSize: '16px',
            color: '#8b5cf6',
            marginBottom: '8px',
            fontWeight: '500'
          }}>
            Scroll to learn more
          </div>
          <div style={{
            fontSize: '24px',
            color: '#8b5cf6',
            animation: 'bounce 2s infinite'
          }}>
            ↓
          </div>
        </div>

        {/* Spacer to push about section lower */}
        <div style={{ height: '200px' }} />

        {/* Purple Line Divider */}
        <div style={{
          width: '100%',
          height: '3px',
          background: 'linear-gradient(90deg, #8b5cf6 0%, #a78bfa 50%, #8b5cf6 100%)',
          margin: '60px auto',
          borderRadius: '2px',
          boxShadow: '0 0 20px rgba(139, 92, 246, 0.5)'
        }} />

        {/* About Section */}
        <div style={{
          maxWidth: '800px',
          margin: '0 auto 120px auto',
          textAlign: 'center'
        }}>
          <h2 style={{
            fontSize: '64px',
            fontWeight: 'bold',
            color: '#ffffff',
            marginBottom: '42px',
            background: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            About
          </h2>
          
          <div style={{
            fontSize: '20px',
            lineHeight: '1.8',
            color: '#e5e7eb',
            textAlign: 'left',
            maxWidth: '700px',
            margin: '0 auto'
          }}>
            <p style={{ marginBottom: '24px' }}>
              Movie night is hard; Toss the Remote can make it easier.
            </p>
            
            <p style={{ marginBottom: '24px' }}>
              Our site helps you discover the perfect movie by blending recommendations based on what you already love. Just input a few movies you like, and Toss the Remote will generate new suggestions that mix and match genres, vibes, and storytelling styles.
            </p>
            
            <p style={{ marginBottom: '24px' }}>
              One of the best ways to use the site is during group movie nights. Everybody at the watch party can input 1 movie, and our AI will find something that hits the sweet spot for everyone.
            </p>
            
                         <p style={{ marginBottom: '24px' }}>
               No more endless scrolling, no more debates, it&apos;s time to Toss the Remote!
             </p>
 
             <p style={{ marginBottom: '0px', lineHeight: '1.2' }}>
               Enjoy,<br/>
               Sammy
             </p>
          </div>
        </div>

        {/* Recommendations Section */}
        {recommendationList.length > 0 && (
          <div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              marginBottom: '40px',
              maxWidth: '1400px',
              margin: '0 auto 40px auto'
            }}>
              <h2 style={{ 
                fontSize: '32px', 
                fontWeight: 'bold', 
                color: '#ffffff',
                margin: 0
              }}>
                Recommendations
              </h2>
              <button
                onClick={handleGetMoreMovies}
                disabled={isLoadingMore}
                style={{
                  color: isLoadingMore ? '#9ca3af' : '#8b5cf6',
                  fontSize: '16px',
                  fontWeight: '600',
                  background: 'none',
                  border: 'none',
                  cursor: isLoadingMore ? 'not-allowed' : 'pointer',
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {isLoadingMore ? 'Loading more...' : 'View more →'}
              </button>
            </div>

            {/* Movie Cards Grid */}
            <div style={{ 
              display: 'flex',
              gap: '20px',
              marginBottom: '60px',
              justifyContent: 'center',
              maxWidth: '2000px',
              margin: '0 auto 60px auto'
            }}>
              {recommendationList.slice(0, 7).map((movie, index) => (
                <div
                  key={index}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    transition: 'all 0.3s ease',
                    cursor: 'pointer',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    position: 'relative',
                    width: '180px',
                    flexShrink: 0
                  }}
                  onClick={() => {
                    fetchModalData(movie);
                    setModalMovie(movie);
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-8px)';
                    e.currentTarget.style.boxShadow = '0 20px 40px rgba(139, 92, 246, 0.2)';
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                  }}
                >
                  {/* Movie Poster */}
                  <div style={{ 
                    width: '100%', 
                    height: '270px', 
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    overflow: 'hidden'
                  }}>
                    {loadingMobilePosters[movie] ? (
                      <div style={{ color: '#9ca3af', fontSize: '14px' }}>Loading...</div>
                    ) : mobilePosters[movie] ? (
                      <Image
                        src={mobilePosters[movie]}
                        alt={movie.split(' (')[0]}
                        fill
                        style={{ 
                          borderRadius: '0',
                          objectFit: 'cover',
                          objectPosition: 'center top'
                        }}
                      />
                    ) : (
                      <div style={{ 
                        color: '#9ca3af', 
                        fontSize: '14px',
                        textAlign: 'center',
                        padding: '20px'
                      }}>
                        {movie.split(' (')[0]}
                      </div>
                    )}
                  </div>
                  
                  {/* Movie Info */}
                  <div style={{ padding: '20px' }}>
                    <h3 style={{ 
                      fontSize: '12px', 
                      fontWeight: '600', 
                      color: '#ffffff',
                      margin: '0 0 6px 0',
                      lineHeight: '1.3'
                    }}>
                      {movie.split(' (')[0]}
                    </h3>
                    
                    <div style={{ 
                      fontSize: '10px', 
                      color: '#9ca3af',
                      marginBottom: '8px'
                    }}>
                      {movie.match(/\((\d{4})\)/) ? movie.match(/\((\d{4})\)/)![1] : ''}
                      {movie.includes(' - ') && (
                        <span style={{ marginLeft: '8px' }}>
                          • {movie.split(' - ')[1]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>


          </div>
        )}
      </div>
      <NetflixModal />
    </div>
  );
}
