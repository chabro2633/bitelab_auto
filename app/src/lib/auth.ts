import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

// 권한 타입 정의
export type UserRole = 'admin' | 'sales_viewer' | 'user';

export interface User {
  id: string;
  username: string;
  password: string;
  role: UserRole;
  allowedBrands?: string[]; // 접근 가능한 브랜드 목록 (admin은 모든 브랜드 접근 가능)
  mustChangePassword?: boolean; // 최초 로그인 시 비밀번호 변경 필요 여부
  createdAt: string;
}

// 초기 비밀번호 상수
export const DEFAULT_INITIAL_PASSWORD = 'qkdlxmfoq123';

export interface ExecutionLog {
  id: string;
  userId: string;
  username: string;
  executionType: 'manual' | 'scheduled' | 'api' | 'retry';
  brands: string[];
  date?: string;
  status: 'success' | 'failed' | 'running';
  startTime: string;
  endTime?: string;
  errorMessage?: string;
  workflowUrl?: string;
  // 스케줄 실패 대응 관련 필드
  isRetryOf?: string; // 원본 실패 워크플로우 ID
  retryAttempt?: number; // 재시도 횟수
}

export interface ScheduleFailureLog {
  id: string;
  scheduleRunId: string;
  scheduleRunUrl: string;
  failedAt: string;
  failureReason?: string;
  // 대응 상태
  responseStatus: 'pending' | 'responded' | 'response_failed' | 'ignored';
  respondedAt?: string;
  respondedBy?: string;
  // 재시도 정보
  retryRunId?: string;
  retryRunUrl?: string;
  retryStatus?: 'success' | 'failed' | 'running';
  retryErrorMessage?: string;
  // 메모
  notes?: string;
}

const USERS_FILE = process.env.NODE_ENV === 'production'
  ? '/tmp/users.json'
  : path.join(process.cwd(), 'src/lib/users.json');
const EXECUTION_LOGS_FILE = process.env.NODE_ENV === 'production'
  ? '/tmp/execution-logs.json'
  : path.join(process.cwd(), 'src/lib/execution-logs.json');
const SCHEDULE_FAILURE_LOGS_FILE = process.env.NODE_ENV === 'production'
  ? '/tmp/schedule-failure-logs.json'
  : path.join(process.cwd(), 'src/lib/schedule-failure-logs.json');

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export async function getUsers(): Promise<User[]> {
  try {
    if (!fs.existsSync(USERS_FILE)) {
      await initializeUsers();
    }
    
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.users || [];
  } catch (error) {
    console.error('Error reading users:', error);
    return [];
  }
}

async function initializeUsers(): Promise<void> {
  try {
    console.log('Initializing users data...');
    
    // 백업 파일이 있으면 복원, 없으면 기본 사용자 생성
    const backupFile = path.join(process.cwd(), 'src/lib/users-backup.json');
    let defaultUsers;
    
    if (fs.existsSync(backupFile)) {
      console.log('Restoring users from backup file...');
      const backupData = fs.readFileSync(backupFile, 'utf8');
      const backupParsed = JSON.parse(backupData);
      defaultUsers = backupParsed.users || [];
    } else {
      console.log('Creating default users...');
      defaultUsers = [
        {
          id: "admin",
          username: "admin",
          password: "$2b$10$3HQpehcWiR7OkStPA5iT6OBveKnqDingWeAYNhds6baUGqlOrlWie", // admin123
          role: "admin",
          allowedBrands: [],
          createdAt: "2024-01-01T00:00:00.000Z"
        }
      ];
    }
    
    // 디렉토리가 존재하는지 확인하고 생성
    const dir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dir)) {
      console.log('Creating directory:', dir);
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const data = JSON.stringify({ users: defaultUsers }, null, 2);
    fs.writeFileSync(USERS_FILE, data, 'utf8');
    console.log('Users initialized successfully');
  } catch (error) {
    console.error('Error initializing users:', error);
  }
}

export async function saveUsers(users: User[]): Promise<void> {
  try {
    console.log('Saving users to:', USERS_FILE);
    console.log('Current working directory:', process.cwd());
    
    // 디렉토리가 존재하는지 확인하고 생성
    const dir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dir)) {
      console.log('Creating directory:', dir);
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const data = JSON.stringify({ users }, null, 2);
    fs.writeFileSync(USERS_FILE, data, 'utf8');
    console.log('Users saved successfully');
    
    // 백업 파일도 자동으로 업데이트
    await updateBackupFile(users);
  } catch (error) {
    console.error('Error saving users:', error);
    throw new Error(`Failed to save users: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// 백업 파일 자동 업데이트 함수
async function updateBackupFile(users: User[]): Promise<void> {
  try {
    const backupFile = path.join(process.cwd(), 'src/lib/users-backup.json');
    const backupData = JSON.stringify({ users }, null, 2);
    
    // 백업 파일 디렉토리 확인 및 생성
    const backupDir = path.dirname(backupFile);
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    fs.writeFileSync(backupFile, backupData, 'utf8');
    console.log('Backup file updated successfully');
  } catch (error) {
    console.error('Error updating backup file:', error);
    // 백업 파일 업데이트 실패는 치명적이지 않으므로 에러를 던지지 않음
  }
}

export async function authenticateUser(username: string, password: string): Promise<User | null> {
  const users = await getUsers();
  const user = users.find(u => u.username === username);
  
  if (!user) {
    return null;
  }
  
  const isValid = await verifyPassword(password, user.password);
  return isValid ? user : null;
}

export async function createUser(
  username: string,
  password: string,
  role: UserRole = 'user',
  allowedBrands: string[] = [],
  mustChangePassword: boolean = false
): Promise<User> {
  const users = await getUsers();

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
    mustChangePassword,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  await saveUsers(users);

  return newUser;
}

// 초대 기능으로 사용자 생성 (기본 비밀번호 + 비밀번호 변경 필수)
export async function inviteUser(
  username: string,
  role: UserRole = 'sales_viewer',
  allowedBrands: string[] = []
): Promise<User> {
  return createUser(username, DEFAULT_INITIAL_PASSWORD, role, allowedBrands, true);
}

// 비밀번호 변경 함수
export async function changePassword(username: string, newPassword: string): Promise<void> {
  const users = await getUsers();
  const userIndex = users.findIndex(u => u.username === username);

  if (userIndex === -1) {
    throw new Error('User not found');
  }

  const hashedPassword = await hashPassword(newPassword);
  users[userIndex].password = hashedPassword;
  users[userIndex].mustChangePassword = false;

  await saveUsers(users);
}

// 사용자 권한 변경 함수
export async function updateUserRole(username: string, role: UserRole): Promise<User> {
  const users = await getUsers();
  const userIndex = users.findIndex(u => u.username === username);

  if (userIndex === -1) {
    throw new Error('User not found');
  }

  users[userIndex].role = role;

  // admin으로 변경시 브랜드 제한 해제
  if (role === 'admin') {
    users[userIndex].allowedBrands = [];
  }

  await saveUsers(users);
  return users[userIndex];
}

// 권한별 접근 가능한 기능 정의
export function getRolePermissions(role: UserRole): {
  canViewSales: boolean;
  canRunScraping: boolean;
  canManageUsers: boolean;
  canViewLogs: boolean;
  canManageSchedule: boolean;
} {
  switch (role) {
    case 'admin':
      return {
        canViewSales: true,
        canRunScraping: true,
        canManageUsers: true,
        canViewLogs: true,
        canManageSchedule: true,
      };
    case 'sales_viewer':
      return {
        canViewSales: true,
        canRunScraping: false,
        canManageUsers: false,
        canViewLogs: false,
        canManageSchedule: false,
      };
    case 'user':
    default:
      return {
        canViewSales: false,
        canRunScraping: true,
        canManageUsers: false,
        canViewLogs: true,
        canManageSchedule: false,
      };
  }
}

export async function updateUserBrands(username: string, allowedBrands: string[]): Promise<User> {
  const users = await getUsers();
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
  
  await saveUsers(users);
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

export async function migrateUsersToIncludeBrands(): Promise<void> {
  const users = await getUsers();
  let needsUpdate = false;
  
  const updatedUsers = users.map(user => {
    const needsBrandsUpdate = !user.allowedBrands;
    
    if (needsBrandsUpdate) {
      needsUpdate = true;
      return {
        ...user,
        allowedBrands: user.role === 'admin' ? [] : [],
      };
    }
    
    return user;
  });
  
  if (needsUpdate) {
    await saveUsers(updatedUsers);
    console.log('✅ 사용자 데이터에 브랜드 권한 필드가 추가되었습니다.');
  }
}

// 실행 로그 관리 함수들
export function getExecutionLogs(): ExecutionLog[] {
  try {
    if (!fs.existsSync(EXECUTION_LOGS_FILE)) {
      // 프로덕션 환경에서 빈 로그 파일 생성
      if (process.env.NODE_ENV === 'production') {
        const data = JSON.stringify({ logs: [] }, null, 2);
        fs.writeFileSync(EXECUTION_LOGS_FILE, data, 'utf8');
      }
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

// 스케줄 실패 로그 관리 함수들
export function getScheduleFailureLogs(): ScheduleFailureLog[] {
  try {
    if (!fs.existsSync(SCHEDULE_FAILURE_LOGS_FILE)) {
      if (process.env.NODE_ENV === 'production') {
        const data = JSON.stringify({ logs: [] }, null, 2);
        fs.writeFileSync(SCHEDULE_FAILURE_LOGS_FILE, data, 'utf8');
      }
      return [];
    }
    const data = fs.readFileSync(SCHEDULE_FAILURE_LOGS_FILE, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.logs || [];
  } catch (error) {
    console.error('Error reading schedule failure logs file:', error);
    return [];
  }
}

export function saveScheduleFailureLogs(logs: ScheduleFailureLog[]): void {
  try {
    const data = JSON.stringify({ logs }, null, 2);
    fs.writeFileSync(SCHEDULE_FAILURE_LOGS_FILE, data, 'utf8');
  } catch (error) {
    console.error('Error saving schedule failure logs file:', error);
    throw new Error('Failed to save schedule failure logs');
  }
}

export function addScheduleFailureLog(log: Omit<ScheduleFailureLog, 'id'>): ScheduleFailureLog {
  const logs = getScheduleFailureLogs();

  // 같은 scheduleRunId가 이미 있으면 추가하지 않음
  const existing = logs.find(l => l.scheduleRunId === log.scheduleRunId);
  if (existing) {
    return existing;
  }

  const newLog: ScheduleFailureLog = {
    ...log,
    id: Date.now().toString()
  };

  logs.unshift(newLog);

  // 최대 50개 로그만 유지
  if (logs.length > 50) {
    logs.splice(50);
  }

  saveScheduleFailureLogs(logs);
  return newLog;
}

export function updateScheduleFailureLog(logId: string, updates: Partial<ScheduleFailureLog>): ScheduleFailureLog | null {
  const logs = getScheduleFailureLogs();
  const logIndex = logs.findIndex(log => log.id === logId);

  if (logIndex !== -1) {
    logs[logIndex] = { ...logs[logIndex], ...updates };
    saveScheduleFailureLogs(logs);
    return logs[logIndex];
  }
  return null;
}

export function getScheduleFailureLogByRunId(scheduleRunId: string): ScheduleFailureLog | null {
  const logs = getScheduleFailureLogs();
  return logs.find(log => log.scheduleRunId === scheduleRunId) || null;
}

