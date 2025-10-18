import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

export interface User {
  id: string;
  username: string;
  password: string;
  role: string;
  createdAt: string;
}

const USERS_FILE = path.join(process.cwd(), 'src/lib/users.json');

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export function getUsers(): User[] {
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.users || [];
  } catch (error) {
    console.error('Error reading users file:', error);
    return [];
  }
}

export function saveUsers(users: User[]): void {
  try {
    const data = JSON.stringify({ users }, null, 2);
    fs.writeFileSync(USERS_FILE, data, 'utf8');
  } catch (error) {
    console.error('Error saving users file:', error);
    throw new Error('Failed to save users');
  }
}

export async function authenticateUser(username: string, password: string): Promise<User | null> {
  const users = getUsers();
  const user = users.find(u => u.username === username);
  
  if (!user) {
    return null;
  }
  
  const isValid = await verifyPassword(password, user.password);
  return isValid ? user : null;
}

export async function createUser(username: string, password: string, role: string = 'user'): Promise<User> {
  const users = getUsers();
  
  // Check if user already exists
  if (users.find(u => u.username === username)) {
    throw new Error('User already exists');
  }
  
  const hashedPassword = await hashPassword(password);
  const newUser: User = {
    id: Date.now().toString(),
    username,
    password: hashedPassword,
    role,
    createdAt: new Date().toISOString()
  };
  
  users.push(newUser);
  saveUsers(users);
  
  return newUser;
}
