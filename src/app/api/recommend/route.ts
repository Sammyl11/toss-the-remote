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
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a movie recommendation expert. Always format your responses consistently with exactly one movie per line, using the format: 'Title (Year) - Director'"
        },
        {
          role: "user",
          content: `Based on these movies: ${movies}

Please recommend 10 NEW and DIFFERENT movies that match the genre mix, intended audience, ratings, and time periods of the input movies. Consider the ratio of genres in each movie and include at least one movie that blends multiple genres from the input movies.

CRITICAL: Do NOT recommend any of these movies under any circumstances:
${excludeMovies.length > 0 ? excludeMovies.join('\n') : 'None specified'}

${excludeMovies.length > 0 ? `These movies are ABSOLUTELY FORBIDDEN from your recommendations. If any of your recommendations has the same TITLE as any movie in the forbidden list above, do NOT include it - even if the year, director, or format is different. For example, if "The Departed" is forbidden, do not recommend "The Departed (2006) - Martin Scorsese" or any other version of The Departed.` : ''}

Format each recommendation exactly as: Title (Year) - Director
Example format:
The Godfather (1972) - Francis Ford Coppola
Inception (2010) - Christopher Nolan

Return exactly 10 movies, one per line, no additional text or explanations.`
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