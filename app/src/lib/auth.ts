import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

export interface User {
  id: string;
  username: string;
  password: string;
  role: string;
  allowedBrands?: string[]; // 접근 가능한 브랜드 목록 (admin은 모든 브랜드 접근 가능)
  isFirstLogin?: boolean; // 최초 로그인 여부
  createdAt: string;
}

export interface ExecutionLog {
  id: string;
  userId: string;
  username: string;
  executionType: 'manual' | 'scheduled' | 'api';
  brands: string[];
  date?: string;
  status: 'success' | 'failed' | 'running';
  startTime: string;
  endTime?: string;
  errorMessage?: string;
  workflowUrl?: string;
}

const USERS_FILE = path.join(process.cwd(), 'src/lib/users.json');
const EXECUTION_LOGS_FILE = path.join(process.cwd(), 'src/lib/execution-logs.json');

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

export async function createUser(username: string, password: string = 'bitelab', role: string = 'user', allowedBrands: string[] = []): Promise<User> {
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
    isFirstLogin: true, // 모든 새 사용자는 최초 로그인으로 설정
    createdAt: new Date().toISOString()
  };
  
  users.push(newUser);
  saveUsers(users);
  
  return newUser;
}

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

export function migrateUsersToIncludeBrands(): void {
  const users = getUsers();
  let needsUpdate = false;
  
  const updatedUsers = users.map(user => {
    if (!user.allowedBrands) {
      needsUpdate = true;
      return {
        ...user,
        allowedBrands: user.role === 'admin' ? [] : [], // 기존 사용자는 빈 배열로 시작
        isFirstLogin: user.isFirstLogin === undefined ? true : user.isFirstLogin // 기존 사용자는 최초 로그인으로 설정
      };
    }
    return user;
  });
  
  if (needsUpdate) {
    saveUsers(updatedUsers);
    console.log('✅ 사용자 데이터에 브랜드 권한 필드가 추가되었습니다.');
  }
}

// 실행 로그 관리 함수들
export function getExecutionLogs(): ExecutionLog[] {
  try {
    if (!fs.existsSync(EXECUTION_LOGS_FILE)) {
      return [];
    }
    const data = fs.readFileSync(EXECUTION_LOGS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.logs || [];
  } catch (error) {
    console.error('Error reading execution logs file:', error);
    return [];
  }
}

export function saveExecutionLogs(logs: ExecutionLog[]): void {
  try {
    const data = JSON.stringify({ logs }, null, 2);
    fs.writeFileSync(EXECUTION_LOGS_FILE, data, 'utf8');
  } catch (error) {
    console.error('Error saving execution logs file:', error);
    throw new Error('Failed to save execution logs');
  }
}

export function addExecutionLog(log: Omit<ExecutionLog, 'id'>): ExecutionLog {
  const logs = getExecutionLogs();
  const newLog: ExecutionLog = {
    ...log,
    id: Date.now().toString()
  };
  
  logs.unshift(newLog); // 최신 로그를 맨 앞에 추가
  
  // 최대 100개 로그만 유지
  if (logs.length > 100) {
    logs.splice(100);
  }
  
  saveExecutionLogs(logs);
  return newLog;
}

export function updateExecutionLog(logId: string, updates: Partial<ExecutionLog>): void {
  const logs = getExecutionLogs();
  const logIndex = logs.findIndex(log => log.id === logId);
  
  if (logIndex !== -1) {
    logs[logIndex] = { ...logs[logIndex], ...updates };
    saveExecutionLogs(logs);
  }
}

export function markFirstLoginComplete(userId: string): void {
  const users = getUsers();
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex !== -1) {
    users[userIndex].isFirstLogin = false;
    saveUsers(users);
  }
}
