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

    const { movies } = await request.json();
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

Please recommend 10 NEW and DIFFERENT movies (do not include any of the input movies) that match the genre mix, ratings, and time periods of the input movies. Consider the ratio of genres in each movie and include at least one movie that blends multiple genres from the input movies.

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

    return NextResponse.json({
      recommendations: completion.choices[0].message.content
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