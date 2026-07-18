import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';
  const search = request.nextUrl.search;
  return NextResponse.redirect(`${apiBase}/auth/youtube/callback${search}`, { status: 302 });
}
