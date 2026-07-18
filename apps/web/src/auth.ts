import NextAuth, { type DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';
import { prisma } from '@shorts/shared/prisma.js';

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}

const nextAuth = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: { params: { prompt: 'select_account' } },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      const found = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      return !!found;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const found = await prisma.user.findUnique({
          where: { email: user.email.toLowerCase() },
          select: { id: true },
        });
        if (found) token.userId = found.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string;
      return session;
    },
    authorized({ auth: session }) {
      return !!session?.user;
    },
  },
});

export const { handlers, auth, signIn, signOut } = nextAuth;
