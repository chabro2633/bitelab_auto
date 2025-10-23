import NextAuth from 'next-auth';
import { authOptions } from '../../../lib/auth-config';

export default NextAuth(authOptions);
