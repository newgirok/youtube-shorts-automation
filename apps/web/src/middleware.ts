export { auth as middleware } from './auth';

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|_next|login|close|popup|favicon.ico|.*\\.(?:jpg|jpeg|png|gif|svg|webp|ico|mp4|webm|ogg)$).*)'],
};
