import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

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
    authorized({ auth: session }) {
      return !!session?.user;
    },
  },
});

export const { handlers, auth, signIn, signOut } = nextAuth;
