import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface OpenAIError {
  message: string;
  type?: string;
  response?: {
    data?: unknown;
    status?: number;
  };
}

export async function POST(request: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error('OpenAI API key is missing');
      return NextResponse.json(
        { error: 'OpenAI API key is not configured' },
        { status: 500 }
      );
    }

    const { movies, excludeMovies = [] } = await request.json();
    console.log('Received excludeMovies:', excludeMovies);
    if (!movies) {
      return NextResponse.json(
        { error: 'Please provide a list of movies' },
        { status: 400 }
      );
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a movie recommendation expert. Format every response as exactly one movie per line: 'Title (Year) - Director'. Always include the year to distinguish movies with the same title."
        },
        {
          role: "user",
          content: `Based on these movies: ${movies}

Recommend 7 movies that match the genre mix, tone, intended audience, quality ratings, and time periods of the input movies. Consider the ratio of genres and include at least one movie that blends multiple genres from the input list.

${excludeMovies.length > 0 ? `Do not recommend any of these movies:\n${excludeMovies.join('\n')}` : ''}

Return exactly 7 movies, one per line, no additional text.`
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    // Server-side filtering as backup
    let recommendations = completion.choices[0].message.content || '';
    
    if (excludeMovies.length > 0) {
      const recommendationLines = recommendations.split('\n').filter(line => line.trim() !== '');
      const filteredRecommendations = recommendationLines.filter(recommendation => {
        // Extract title from recommendation format "Title (Year) - Director"
        const titleMatch = recommendation.match(/^(.+?)\s*\(/);
        const recTitle = titleMatch ? titleMatch[1].trim().toLowerCase() : recommendation.toLowerCase();
        
        // Check if this recommendation matches any excluded movie
        return !excludeMovies.some((excludedMovie: string) => {
          const excludedTitle = excludedMovie.split('(')[0].trim().toLowerCase();
          return recTitle === excludedTitle;
        });
      });
      
      recommendations = filteredRecommendations.join('\n');
      console.log('Filtered recommendations:', recommendations);
    }

    return NextResponse.json({
      recommendations
    });
    
  } catch (error: unknown) {
    const openaiError = error as OpenAIError;
    console.error('Detailed error:', {
      message: openaiError.message,
      type: openaiError.type,
      response: openaiError.response?.data,
      status: openaiError.response?.status
    });
    
    let errorMessage = 'Failed to get recommendations';
    
    if (!process.env.OPENAI_API_KEY) {
      errorMessage = 'API key not configured properly';
    } else if (openaiError.response?.status === 401) {
      errorMessage = 'Invalid API key';
    } else if (openaiError.message) {
      errorMessage = `Error: ${openaiError.message}`;
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: openaiError.response?.status || 500 }
    );
  }
} 