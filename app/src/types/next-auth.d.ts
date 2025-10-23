import NextAuth from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      role: string;
      allowedBrands?: string[];
      isFirstLogin?: boolean;
    };
  }

  interface User {
    id: string;
    username: string;
    role: string;
    allowedBrands?: string[];
    isFirstLogin?: boolean;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    username: string;
    role: string;
    allowedBrands?: string[];
    isFirstLogin?: boolean;
  }
}
