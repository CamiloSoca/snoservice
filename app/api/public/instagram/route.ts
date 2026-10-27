import { NextResponse } from 'next/server';
import { getPublicInstagramFeed } from '@/lib/instagram-server';

export async function GET() {
  const posts = await getPublicInstagramFeed();
  return NextResponse.json({ posts }, {
    headers: { 'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=120' },
  });
}
