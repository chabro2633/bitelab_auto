'use client';

import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  username: string;
  role: string;
  allowedBrands?: string[];
  createdAt: string;
}

export default function UserManagement() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showChangePasswordForm, setShowChangePasswordForm] = useState(false);
  const [showBrandPermissionForm, setShowBrandPermissionForm] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedUserForBrands, setSelectedUserForBrands] = useState<string>('');
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user', allowedBrands: [] as string[] });
  const [newPassword, setNewPassword] = useState('');
  const [userBrands, setUserBrands] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const availableBrands = ['바르너', '릴리이브', '보호리', '먼슬리픽', '색동서울'];

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (session && session.user.role !== 'admin') {
      router.push('/admin');
    }
  }, [status, session, router]);

  useEffect(() => {
    if (session?.user.role === 'admin') {
      fetchUsers();
    }
  }, [session]);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        setUsers(data.users);
      }
    } catch (fetchError) {
      console.error('Failed to fetch users:', fetchError);
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
        const data = await response.json();
        setUsers([...users, data.user]);
        setNewUser({ username: '', password: '', role: 'user' });
        setShowAddForm(false);
      } else {
        const error = await response.json();
        alert(error.error);
      }
    } catch (addError) {
      alert('Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/users/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: selectedUser,
          newPassword: newPassword,
        }),
      });

      if (response.ok) {
        alert('비밀번호가 성공적으로 변경되었습니다!');
        setNewPassword('');
        setSelectedUser('');
        setShowChangePasswordForm(false);
      } else {
        const error = await response.json();
        alert(error.error);
      }
    } catch (changeError) {
      alert('비밀번호 변경에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateBrandPermissions = async (e: React.FormEvent) => {
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
        fetchUsers(); // 사용자 목록 새로고침
      } else {
        const error = await response.json();
        alert(error.error);
      }
    } catch (brandError) {
      alert('브랜드 권한 업데이트에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleBrandToggle = (brand: string) => {
    setUserBrands(prev =>
      prev.includes(brand)
        ? prev.filter(b => b !== brand)
        : [...prev, brand]
    );
  };

  const handleSelectAllBrands = () => {
    setUserBrands(availableBrands);
  };

  const handleDeselectAllBrands = () => {
    setUserBrands([]);
  };

  const handleUserSelectForBrands = (username: string) => {
    setSelectedUserForBrands(username);
    const user = users.find(u => u.username === username);
    if (user) {
      setUserBrands(user.allowedBrands || []);
    }
  };

  const handleLogout = () => {
    signOut({ callbackUrl: '/login' });
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!session || session.user.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
              <p className="text-sm text-gray-600">Welcome, {session.user.username}</p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => router.push('/admin')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Admin Dashboard
              </button>
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-medium text-gray-900">Users</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                  >
                    {showAddForm ? 'Cancel' : 'Add User'}
                  </button>
                  <button
                    onClick={() => setShowChangePasswordForm(!showChangePasswordForm)}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                  >
                    {showChangePasswordForm ? 'Cancel' : 'Change Password'}
                  </button>
                  <button
                    onClick={() => setShowBrandPermissionForm(!showBrandPermissionForm)}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md text-sm font-medium"
                  >
                    {showBrandPermissionForm ? 'Cancel' : 'Brand Permissions'}
                  </button>
                </div>
              </div>

              {/* Add User Form */}
              {showAddForm && (
                <form onSubmit={handleAddUser} className="mb-6 p-4 bg-gray-50 rounded-md">
                  <h3 className="text-md font-medium text-gray-900 mb-4">Add New User</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label htmlFor="username" className="block text-sm font-medium text-gray-700">
                        Username
                      </label>
                      <input
                        type="text"
                        id="username"
                        required
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={newUser.username}
                        onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                        Password
                      </label>
                      <input
                        type="password"
                        id="password"
                        required
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                        Role
                      </label>
                      <select
                        id="role"
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={newUser.role}
                        onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                  
                  {/* Brand Permissions for non-admin users */}
                  {newUser.role === 'user' && (
                    <div className="mt-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Allowed Brands
                      </label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => setNewUser({ ...newUser, allowedBrands: availableBrands })}
                          className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 px-2 py-1 rounded"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewUser({ ...newUser, allowedBrands: [] })}
                          className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-2 py-1 rounded"
                        >
                          Deselect All
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {availableBrands.map((brand) => (
                          <label key={brand} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={newUser.allowedBrands.includes(brand)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewUser({ ...newUser, allowedBrands: [...newUser.allowedBrands, brand] });
                                } else {
                                  setNewUser({ ...newUser, allowedBrands: newUser.allowedBrands.filter(b => b !== brand) });
                                }
                              }}
                              className="mr-1"
                            />
                            <span className="text-sm text-gray-700">{brand}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-4">
                    <button
                      type="submit"
                      disabled={loading}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-medium"
                    >
                      {loading ? 'Creating...' : 'Create User'}
                    </button>
                  </div>
                </form>
              )}

              {/* Change Password Form */}
              {showChangePasswordForm && (
                <form onSubmit={handleChangePassword} className="mb-6 p-4 bg-yellow-50 rounded-md">
                  <h3 className="text-md font-medium text-gray-900 mb-4">Change User Password</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="selectedUser" className="block text-sm font-medium text-gray-700">
                        Select User
                      </label>
                      <select
                        id="selectedUser"
                        required
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={selectedUser}
                        onChange={(e) => setSelectedUser(e.target.value)}
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
                      <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                        New Password
                      </label>
                      <input
                        type="password"
                        id="newPassword"
                        required
                        className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <button
                      type="submit"
                      disabled={loading}
                      className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-medium"
                    >
                      {loading ? 'Changing...' : 'Change Password'}
                    </button>
                  </div>
                </form>
              )}

              {/* Brand Permission Form */}
              {showBrandPermissionForm && (
                <form onSubmit={handleUpdateBrandPermissions} className="mb-6 p-4 bg-purple-50 rounded-md">
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
                        onChange={(e) => handleUserSelectForBrands(e.target.value)}
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
                      <div className="flex flex-wrap gap-2 mb-2">
                        <button
                          type="button"
                          onClick={handleSelectAllBrands}
                          className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 px-2 py-1 rounded"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={handleDeselectAllBrands}
                          className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-2 py-1 rounded"
                        >
                          Deselect All
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {availableBrands.map((brand) => (
                          <label key={brand} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={userBrands.includes(brand)}
                              onChange={() => handleBrandToggle(brand)}
                              className="mr-1"
                            />
                            <span className="text-sm text-gray-700">{brand}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <button
                      type="submit"
                      disabled={loading || !selectedUserForBrands}
                      className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-md text-sm font-medium"
                    >
                      {loading ? 'Updating...' : 'Update Brand Permissions'}
                    </button>
                  </div>
                </form>
              )}

              {/* Users List */}
              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Username
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Role
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Allowed Brands
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Created At
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {user.username}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            user.role === 'admin' 
                              ? 'bg-red-100 text-red-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {user.role === 'admin' ? (
                            <span className="text-blue-600 font-medium">All Brands</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {(user.allowedBrands || []).map((brand) => (
                                <span key={brand} className="inline-flex px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                                  {brand}
                                </span>
                              ))}
                              {(user.allowedBrands || []).length === 0 && (
                                <span className="text-gray-400 text-xs">No brands assigned</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
