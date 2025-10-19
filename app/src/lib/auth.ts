import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

export interface User {
  id: string;
  username: string;
  password: string;
  role: string;
  allowedBrands?: string[]; // 접근 가능한 브랜드 목록 (admin은 모든 브랜드 접근 가능)
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

export async function createUser(username: string, password: string, role: string = 'user', allowedBrands: string[] = []): Promise<User> {
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
    allowedBrands: role === 'admin' ? [] : allowedBrands, // admin은 빈 배열 (모든 브랜드 접근 가능)
    createdAt: new Date().toISOString()
  };
  
  users.push(newUser);
  saveUsers(users);
  
export async function updateUserBrands(username: string, allowedBrands: string[]): Promise<User> {
  const users = getUsers();
  const userIndex = users.findIndex(u => u.username === username);
  
  if (userIndex === -1) {
    throw new Error('User not found');
  }
  
  // admin은 브랜드 제한이 없음
  if (users[userIndex].role === 'admin') {
    users[userIndex].allowedBrands = [];
  } else {
    users[userIndex].allowedBrands = allowedBrands;
  }
  
  saveUsers(users);
  return users[userIndex];
}

export function getUserAllowedBrands(user: User): string[] {
  // admin은 모든 브랜드 접근 가능
  if (user.role === 'admin') {
    return ['바르너', '릴리이브', '보호리', '먼슬리픽', '색동서울'];
  }
  
  // 일반 사용자는 할당된 브랜드만 접근 가능
  return user.allowedBrands || [];
}
