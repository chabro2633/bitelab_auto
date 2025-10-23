import NextAuth from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      role: string;
      allowedBrands?: string[];
    };
  }

  interface User {
    id: string;
    username: string;
    role: string;
    allowedBrands?: string[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    username: string;
    role: string;
    allowedBrands?: string[];
  }
}
