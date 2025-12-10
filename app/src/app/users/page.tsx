'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  username: string;
  role: string;
  allowedBrands?: string[];
  mustChangePassword?: boolean;
  createdAt: string;
}

// 권한별 설명
const roleDescriptions: Record<string, { label: string; description: string; color: string }> = {
  admin: {
    label: '관리자',
    description: '모든 기능 접근 가능',
    color: 'bg-red-100 text-red-800',
  },
  sales_viewer: {
    label: '매출 조회',
    description: '실시간 매출 조회만 가능',
    color: 'bg-blue-100 text-blue-800',
  },
  user: {
    label: '일반 사용자',
    description: '스크래핑 실행 및 로그 조회 가능',
    color: 'bg-green-100 text-green-800',
  },
};

export default function UserManagement() {
  const router = useRouter();
  const [user, setUser] = useState<{ userId: string; username: string; role: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showBrandPermissionForm, setShowBrandPermissionForm] = useState(false);
  const [selectedUserForBrands, setSelectedUserForBrands] = useState<string>('');
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user', allowedBrands: [] as string[] });
  const [inviteUser, setInviteUser] = useState({ username: '', role: 'sales_viewer', allowedBrands: [] as string[] });
  const [userBrands, setUserBrands] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const availableBrands = ['바르너', '릴리이브', '보호리', '먼슬리픽', '색동서울'];

  // 세션 확인
  useEffect(() => {
    const checkSession = async () => {
      try {
        const response = await fetch('/api/session');
        const data = await response.json();
        
        if (data.authenticated && data.user.role === 'admin') {
          setUser(data.user);
          fetchUsers();
        } else {
          router.push('/admin'); // Admin이 아니면 admin 페이지로 리다이렉트
        }
      } catch (error) {
        console.error('Session check error:', error);
        router.push('/login');
      } finally {
        setIsLoading(false);
      }
    };

    checkSession();
  }, [router]);

  // 로그아웃 함수
  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []); // data.users 배열을 사용
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newUser),
      });

      if (response.ok) {
        alert('사용자가 성공적으로 생성되었습니다!');
        setNewUser({ username: '', password: '', role: 'user', allowedBrands: [] });
        setShowAddForm(false);
        fetchUsers();
      } else {
        const errorData = await response.json();
        alert(`오류: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error adding user:', error);
      alert('사용자 생성 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateBrands = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/users/update-brands', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: selectedUserForBrands,
          allowedBrands: userBrands,
        }),
      });

      if (response.ok) {
        alert('브랜드 권한이 성공적으로 업데이트되었습니다!');
        setUserBrands([]);
        setSelectedUserForBrands('');
        setShowBrandPermissionForm(false);
        fetchUsers();
      } else {
        const errorData = await response.json();
        alert(`오류: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error updating brands:', error);
      alert('브랜드 권한 업데이트 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 사용자 초대 (기본 비밀번호 적용)
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/users/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(inviteUser),
      });

      if (response.ok) {
        alert(`사용자 "${inviteUser.username}"이(가) 성공적으로 초대되었습니다!\n\n초기 비밀번호: qkdlxmfoq123\n\n첫 로그인 시 비밀번호 변경이 필요합니다.`);
        setInviteUser({ username: '', role: 'sales_viewer', allowedBrands: [] });
        setShowInviteForm(false);
        fetchUsers();
      } else {
        const errorData = await response.json();
        alert(`오류: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error inviting user:', error);
      alert('사용자 초대 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 비밀번호 초기화
  const handleResetPassword = async (username: string) => {
    if (!confirm(`"${username}" 사용자의 비밀번호를 초기화하시겠습니까?\n\n초기 비밀번호: qkdlxmfoq123`)) {
      return;
    }

    try {
      const response = await fetch('/api/users/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      });

      if (response.ok) {
        alert(`비밀번호가 초기화되었습니다.\n\n초기 비밀번호: qkdlxmfoq123\n\n다음 로그인 시 비밀번호 변경이 필요합니다.`);
        fetchUsers();
      } else {
        const errorData = await response.json();
        alert(`오류: ${errorData.error}`);
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      alert('비밀번호 초기화 중 오류가 발생했습니다.');
    }
  };

  const handleLogoutClick = async () => {
    await handleLogout();
  };

  // 로딩 중이면 로딩 화면 표시
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // 사용자가 없으면 아무것도 렌더링하지 않음 (리다이렉트 중)
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900">사용자 관리</h1>
            <div className="flex space-x-4">
              <button
                onClick={() => router.push('/admin')}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                관리자 페이지로
              </button>
              <button
                onClick={handleLogoutClick}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                로그아웃
              </button>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex flex-wrap gap-3 mb-6">
              <button
                onClick={() => {
                  setShowInviteForm(!showInviteForm);
                  setShowAddForm(false);
                  setShowBrandPermissionForm(false);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                {showInviteForm ? '취소' : '사용자 초대'}
              </button>
              <button
                onClick={() => {
                  setShowAddForm(!showAddForm);
                  setShowInviteForm(false);
                  setShowBrandPermissionForm(false);
                }}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                {showAddForm ? '취소' : '직접 추가'}
              </button>
              <button
                onClick={() => {
                  setShowBrandPermissionForm(!showBrandPermissionForm);
                  setShowAddForm(false);
                  setShowInviteForm(false);
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                {showBrandPermissionForm ? '취소' : '브랜드 권한 관리'}
              </button>
            </div>

            {/* 권한 안내 */}
            <div className="mb-6 p-4 bg-gray-50 rounded-md">
              <h3 className="text-sm font-medium text-gray-700 mb-2">권한 안내</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                {Object.entries(roleDescriptions).map(([role, info]) => (
                  <div key={role} className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full font-semibold ${info.color}`}>
                      {info.label}
                    </span>
                    <span className="text-gray-500">{info.description}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 사용자 초대 폼 */}
            {showInviteForm && (
              <form onSubmit={handleInviteUser} className="mb-6 p-4 bg-indigo-50 rounded-md">
                <h3 className="text-md font-medium text-gray-900 mb-2">사용자 초대</h3>
                <p className="text-sm text-gray-500 mb-4">
                  초기 비밀번호: <code className="bg-gray-200 px-1 rounded">qkdlxmfoq123</code> (첫 로그인 시 변경 필요)
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="inviteUsername" className="block text-sm font-medium text-gray-700">
                      사용자명
                    </label>
                    <input
                      type="text"
                      id="inviteUsername"
                      required
                      placeholder="예: hong.gildong"
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                      value={inviteUser.username}
                      onChange={(e) => setInviteUser({ ...inviteUser, username: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="inviteRole" className="block text-sm font-medium text-gray-700">
                      권한
                    </label>
                    <select
                      id="inviteRole"
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                      value={inviteUser.role}
                      onChange={(e) => setInviteUser({ ...inviteUser, role: e.target.value })}
                    >
                      <option value="sales_viewer">매출 조회 (실시간 매출만 조회)</option>
                      <option value="user">일반 사용자 (스크래핑 실행)</option>
                      <option value="admin">관리자 (전체 권한)</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500">
                      {roleDescriptions[inviteUser.role]?.description}
                    </p>
                  </div>
                  {inviteUser.role !== 'admin' && (
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        접근 가능 브랜드
                      </label>
                      <div className="flex flex-wrap gap-3">
                        {availableBrands.map((brand) => (
                          <label key={brand} className="flex items-center">
                            <input
                              type="checkbox"
                              className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                              checked={inviteUser.allowedBrands.includes(brand)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setInviteUser({
                                    ...inviteUser,
                                    allowedBrands: [...inviteUser.allowedBrands, brand],
                                  });
                                } else {
                                  setInviteUser({
                                    ...inviteUser,
                                    allowedBrands: inviteUser.allowedBrands.filter((b) => b !== brand),
                                  });
                                }
                              }}
                            />
                            <span className="ml-2 text-sm text-gray-700">{brand}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                  >
                    {loading ? '초대 중...' : '초대하기'}
                  </button>
                </div>
              </form>
            )}

            {showAddForm && (
              <form onSubmit={handleAddUser} className="mb-6 p-4 bg-green-50 rounded-md">
                <h3 className="text-md font-medium text-gray-900 mb-4">사용자 직접 추가</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                      사용자명
                    </label>
                    <input
                      type="text"
                      id="username"
                      required
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                      비밀번호
                    </label>
                    <input
                      type="password"
                      id="password"
                      required
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                      권한
                    </label>
                    <select
                      id="role"
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-gray-900"
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    >
                      <option value="sales_viewer">매출 조회</option>
                      <option value="user">일반 사용자</option>
                      <option value="admin">관리자</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Allowed Brands
                    </label>
                    <div className="space-y-2">
                      {availableBrands.map((brand) => (
                        <label key={brand} className="flex items-center">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                            checked={newUser.allowedBrands.includes(brand)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setNewUser({
                                  ...newUser,
                                  allowedBrands: [...newUser.allowedBrands, brand],
                                });
                              } else {
                                setNewUser({
                                  ...newUser,
                                  allowedBrands: newUser.allowedBrands.filter((b) => b !== brand),
                                });
                              }
                            }}
                          />
                          <span className="ml-2 text-sm text-gray-700">{brand}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                  >
                    {loading ? 'Adding...' : 'Add User'}
                  </button>
                </div>
              </form>
            )}

            {showBrandPermissionForm && (
              <form onSubmit={handleUpdateBrands} className="mb-6 p-4 bg-purple-50 rounded-md">
                <h3 className="text-md font-medium text-gray-900 mb-4">Update Brand Permissions</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="selectedUserForBrands" className="block text-sm font-medium text-gray-700">
                      Select User
                    </label>
                    <select
                      id="selectedUserForBrands"
                      required
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={selectedUserForBrands}
                      onChange={(e) => {
                        setSelectedUserForBrands(e.target.value);
                        const user = users.find((u) => u.username === e.target.value);
                        setUserBrands(user?.allowedBrands || []);
                      }}
                    >
                      <option value="">Select a user...</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.username}>
                          {user.username} ({user.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Allowed Brands
                    </label>
                    <div className="space-y-2">
                      {availableBrands.map((brand) => (
                        <label key={brand} className="flex items-center">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300 text-indigo-600 shadow-sm focus:border-indigo-300 focus:ring focus:ring-indigo-200 focus:ring-opacity-50"
                            checked={userBrands.includes(brand)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setUserBrands([...userBrands, brand]);
                              } else {
                                setUserBrands(userBrands.filter((b) => b !== brand));
                              }
                            }}
                          />
                          <span className="ml-2 text-sm text-gray-700">{brand}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    type="submit"
                    disabled={loading}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50"
                  >
                    {loading ? 'Updating...' : 'Update Permissions'}
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      사용자명
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      권한
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      접근 브랜드
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      상태
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      생성일
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      관리
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map((tableUser) => (
                    <tr key={tableUser.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {tableUser.username}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          roleDescriptions[tableUser.role]?.color || 'bg-gray-100 text-gray-800'
                        }`}>
                          {roleDescriptions[tableUser.role]?.label || tableUser.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {tableUser.role === 'admin' ? (
                          <span className="text-gray-400">전체 브랜드</span>
                        ) : tableUser.allowedBrands?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {tableUser.allowedBrands.map((brand) => (
                              <span
                                key={brand}
                                className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800"
                              >
                                {brand}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-400">없음</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {tableUser.mustChangePassword ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            비밀번호 변경 필요
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            정상
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(tableUser.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {tableUser.username !== 'admin' && (
                          <button
                            onClick={() => handleResetPassword(tableUser.username)}
                            className="text-orange-600 hover:text-orange-900 text-xs"
                          >
                            비밀번호 초기화
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}