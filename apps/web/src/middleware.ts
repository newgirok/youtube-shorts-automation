import { auth } from './auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  if (!req.auth) {
    return NextResponse.redirect(new URL('/login', req.url));
  }
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|_next|login|close|popup|terms|privacy|favicon.ico|.*\\.(?:jpg|jpeg|png|gif|svg|webp|ico|mp4|webm|ogg)$).*)'],
};
