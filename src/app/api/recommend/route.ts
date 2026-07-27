import { OpenAI } from 'openai';
import { NextResponse } from 'next/server';
import { isLikelySequelPair } from '@/app/lib/movieMatching';

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

    const { movies, excludeMovies = [], services = [], preferPopular = false, useOriginalModel = false } = await request.json();
    console.log('Received excludeMovies:', excludeMovies);
    if (!movies) {
      return NextResponse.json(
        { error: 'Please provide a list of movies' },
        { status: 400 }
      );
    }

    // The original gpt-4o-mini uses `max_tokens`; the newer gpt-5.4-nano requires
    // `max_completion_tokens` instead — the API rejects the wrong one per model.
    const model = useOriginalModel ? 'gpt-4o-mini' : 'gpt-5.4-nano';
    const tokenLimitParam = useOriginalModel ? { max_tokens: 500 } : { max_completion_tokens: 500 };

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "You are a movie recommendation expert. Format every response as exactly one movie per line: 'Title (Year) - Director'. Always include the year to distinguish movies with the same title. Never include two movies in the same response where one is a direct sequel or prequel of the other (e.g. don't include both 'Avatar' and 'Avatar: The Way of Water') — movies from the same franchise are fine as long as neither is a direct sequel/prequel of the other."
        },
        {
          role: "user",
          content: `Based on these movies: ${movies}

Recommend 7 movies that match the genre mix, tone, intended audience, quality ratings, and time periods of the input movies. Consider the ratio of genres and include at least one movie that blends multiple genres from the input list.

${excludeMovies.length > 0 ? `Do not recommend any of these movies:\n${excludeMovies.join('\n')}` : ''}
${services.length > 0 ? `When possible, prefer movies commonly available for streaming on: ${services.join(', ')}.` : ''}
${preferPopular ? 'Favor well-known, broadly popular, mainstream movies over obscure or niche picks when the fit is comparable.' : ''}

Return exactly 7 movies, one per line, no additional text.`
        }
      ],
      temperature: 0.7,
      ...tokenLimitParam,
    });

    // Server-side filtering as backup: drop exact excluded-title matches, and drop
    // any movie that's a direct sequel/prequel of one already excluded or already
    // kept earlier in this same batch (defense in depth on top of the prompt rule).
    const recommendationLines = (completion.choices[0].message.content || '')
      .split('\n')
      .filter(line => line.trim() !== '');

    const kept: string[] = [];
    for (const recommendation of recommendationLines) {
      const titleMatch = recommendation.match(/^(.+?)\s*\(/);
      const recTitle = titleMatch ? titleMatch[1].trim().toLowerCase() : recommendation.toLowerCase();

      const isExcluded = excludeMovies.some((excludedMovie: string) => {
        const excludedTitle = excludedMovie.split('(')[0].trim().toLowerCase();
        return recTitle === excludedTitle;
      });
      const clashesWithExcluded = excludeMovies.some((excludedMovie: string) => isLikelySequelPair(excludedMovie, recommendation));
      const clashesWithKept = kept.some(k => isLikelySequelPair(k, recommendation));

      if (!isExcluded && !clashesWithExcluded && !clashesWithKept) {
        kept.push(recommendation);
      }
    }

    const recommendations = kept.join('\n');
    console.log('Filtered recommendations:', recommendations);

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