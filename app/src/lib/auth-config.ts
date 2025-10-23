import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { authenticateUser, getUsers } from './auth';

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        try {
          const user = await authenticateUser(credentials.username, credentials.password);
          if (user) {
            return {
              id: user.id,
              username: user.username,
              role: user.role,
              allowedBrands: user.allowedBrands,
              isFirstLogin: user.isFirstLogin,
            };
          }
        } catch (error) {
          console.error('Authentication error:', error);
        }
        return null;
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.username = user.username;
        token.role = user.role;
        token.allowedBrands = user.allowedBrands;
        token.isFirstLogin = user.isFirstLogin;
      }
      
      // 매번 JWT 토큰이 생성될 때마다 최신 사용자 데이터 가져오기
      if (token.sub) {
        try {
          const users = await getUsers();
          const currentUser = users.find(u => u.id === token.sub);
          if (currentUser) {
            token.username = currentUser.username;
            token.role = currentUser.role;
            token.allowedBrands = currentUser.allowedBrands;
            token.isFirstLogin = currentUser.isFirstLogin;
            console.log('🔄 JWT updated with latest user data:', {
              id: currentUser.id,
              username: currentUser.username,
              isFirstLogin: currentUser.isFirstLogin
            });
          }
        } catch (error) {
          console.error('❌ Error fetching user data in JWT callback:', error);
        }
      }
      
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.sub!;
        session.user.username = token.username as string;
        session.user.role = token.role as string;
        session.user.allowedBrands = token.allowedBrands as string[];
        session.user.isFirstLogin = token.isFirstLogin as boolean;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  debug: process.env.NODE_ENV === 'development',
};
