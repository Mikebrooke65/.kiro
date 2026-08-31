import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { rolesApi } from '../../lib/roles-api';
import { invitesApi } from '../../lib/invites-api';
import type { TeamMemberWithTeam, TeamRole, InviteCode } from '../../types/database';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  cellphone?: string;
  role: string;
  user_type?: string;
  active: boolean;
  last_login?: string;
}

interface Team {
  id: string;
  name: string;
  age_group: string;
}

const roleOptions = [
  { value: 'player', label: 'Player', color: 'bg-blue-100 text-blue-700' },
  { value: 'caregiver', label: 'Caregiver', color: 'bg-green-100 text-green-700' },
  { value: 'coach', label: 'Coach', color: 'bg-purple-100 text-purple-700' },
  { value: 'manager', label: 'Manager', color: 'bg-orange-100 text-orange-700' },
  { value: 'admin', label: 'Admin', color: 'bg-red-100 text-red-700' },
];

export function UserManagement() {
  const { user: currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterUserType, setFilterUserType] = useState('all');
  const [userMemberships, setUserMemberships] = useState<Record<string, TeamMemberWithTeam[]>>({});
  const [pendingInvites, setPendingInvites] = useState<InviteCode[]>([]);
  const [editMemberships, setEditMemberships] = useState<TeamMemberWithTeam[]>([]);
  const [newAssignment, setNewAssignment] = useState({ teamId: '', role: 'player' as TeamRole });

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    role: 'player',
    active: true,
    teamId: '',
    cellphone: '',
    password: '',
  });

  // Import state
  const [importData, setImportData] = useState('');

  // Fetch users and teams
  useEffect(() => {
    fetchUsers();
    fetchTeams();
  }, []);

  // Check for edit parameter in URL
  useEffect(() => {
    const editUserId = searchParams.get('edit');
    if (editUserId && users.length > 0) {
      const userToEdit = users.find(u => u.id === editUserId);
      if (userToEdit) {
        handleOpenModal(userToEdit);
        // Clear the URL parameter
        setSearchParams({});
      }
    }
  }, [searchParams, users]);

  const fetchUsers = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('last_name');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTeams = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('id, name, age_group')
        .order('age_group', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      setTeams(data || []);
    } catch (error) {
      console.error('Error fetching teams:', error);
    }
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    const matchesStatus =
      filterStatus === 'all' || (filterStatus === 'active' ? user.active : !user.active);
    const matchesUserType = filterUserType === 'all' || user.user_type === filterUserType;
    return matchesSearch && matchesRole && matchesStatus && matchesUserType;
  });

  const handleOpenModal = async (user?: any) => {
    if (user) {
      setEditingUser(user);
      
      // Fetch all team assignments for this user
      const memberships = await rolesApi.getUserTeamMemberships(user.id);
      setEditMemberships(memberships);
      
      // Use first team for backward compat
      const firstMembership = memberships[0];
      
      setFormData({
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        active: user.active,
        teamId: firstMembership?.team_id || '',
        cellphone: user.cellphone || '',
        password: '',
      });
      setNewAssignment({ teamId: '', role: 'player' });
    } else {
      setEditingUser(null);
      setFormData({
        email: '',
        first_name: '',
        last_name: '',
        role: 'player',
        active: true,
        teamId: '',
        cellphone: '',
        password: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setEditMemberships([]);
    setNewAssignment({ teamId: '', role: 'player' });
  };

  const handleSave = async () => {
    try {
      if (editingUser) {
        // Update existing user in users table
        const { error } = await supabase
          .from('users')
          .update({
            first_name: formData.first_name,
            last_name: formData.last_name,
            cellphone: formData.cellphone,
            role: formData.role,
            active: formData.active,
          })
          .eq('id', editingUser.id);

        if (error) throw error;

        // Update team assignment
        // Remove from old team first
        const { error: deleteError } = await supabase
          .from('team_members')
          .delete()
          .eq('user_id', editingUser.id);

        if (deleteError) {
          console.error('Error removing from old team:', deleteError);
        }

        // Add to new team if one is selected
        if (formData.teamId) {
          const { error: insertError } = await supabase
            .from('team_members')
            .insert({
              team_id: formData.teamId,
              user_id: editingUser.id,
              role: formData.role === 'coach' ? 'coach' : 'player',
            });

          if (insertError) {
            console.error('Error adding to new team:', insertError);
            throw insertError;
          }
        }

        alert('User updated successfully');
      } else {
        // Create new user via Netlify Function
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        
        if (!token) {
          throw new Error('No active session');
        }

        console.log('Calling Netlify function...');
        
        const response = await fetch('/.netlify/functions/create-user', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            first_name: formData.first_name,
            last_name: formData.last_name,
            role: formData.role,
            active: formData.active,
            cellphone: formData.cellphone,
            team_id: formData.teamId || null,
          }),
        });

        const result = await response.json();
        console.log('Netlify function response:', result);

        if (!response.ok) {
          throw new Error(result.error || 'Failed to create user');
        }

        alert(`User created successfully!\n\nEmail: ${formData.email}\n${formData.password ? 'Password: ' + formData.password : 'A random password was generated - user can reset via email'}`);
      }

      handleCloseModal();
      fetchUsers(); // Refresh the list
    } catch (error: any) {
      console.error('Error saving user:', error);
      alert(`Error: ${error.message}`);
    }
  };

  /**
   * 2026-08-31 — pre-existing bug, found while relocating Deactivate/
   * Reactivate here from the Team Page (see `permissions-logic.ts`'s
   * `canRemoveTeamMember` doc comment for why they moved). This button has
   * always been local-state-only: it filters `users` in memory and never
   * calls the database, so refreshing the page (or `fetchUsers()` running
   * again) undoes it silently. NOT fixed as part of this change — a real
   * "Delete" here would need its own design decision (hard-delete the
   * account? cascade to every team/caregiver link? this is a much bigger
   * question than relocating Deactivate/Reactivate) — flagged here and in
   * CHANGELOG.md as a known, separate gap rather than silently patched or
   * silently left undocumented.
   */
  const handleDelete = (userId: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      setUsers(users.filter((u) => u.id !== userId));
    }
  };

  /**
   * 2026-08-31 — now a real, DB-persisting whole-account Deactivate/
   * Reactivate, relocated here from the Team Page's roster row (see
   * `permissions-logic.ts`'s `canRemoveTeamMember` doc comment for why:
   * this flips `users.active` account-wide, every team and role at once —
   * a genuinely different, coarser action than the new per-role "Remove").
   *
   * This was previously local-state-only, like `handleDelete` above, AND
   * had a second, independent bug: it read/wrote `u.status`, a field that
   * doesn't exist on the `User` interface (`active: boolean` is the real
   * field) — so it silently did nothing to any real data even in memory.
   * Both are fixed together here since a genuinely functional Deactivate/
   * Reactivate is the whole point of moving it to this Admin-only screen.
   */
  const handleToggleStatus = async (userId: string) => {
    const target = users.find((u) => u.id === userId);
    if (!target) return;
    const nextActive = !target.active;
    try {
      const { error } = await supabase.from('users').update({ active: nextActive }).eq('id', userId);
      if (error) throw new Error(error.message);
      setUsers(users.map((u) => (u.id === userId ? { ...u, active: nextActive } : u)));
    } catch (error: any) {
      console.error('Error updating user status:', error);
      alert(`Error: ${error.message}`);
    }
  };

  const handleImport = async () => {
    try {
      // Parse CSV data
      const lines = importData.trim().split('\n');
      if (lines.length < 2) {
        alert('Invalid CSV format. Please include headers and at least one user.');
        return;
      }

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const usersToCreate = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map((v) => v.trim());
        const userData: any = {};

        headers.forEach((header, index) => {
          if (header === 'email') userData.email = values[index];
          else if (header === 'first_name' || header === 'firstname') userData.first_name = values[index];
          else if (header === 'last_name' || header === 'lastname') userData.last_name = values[index];
          else if (header === 'role') userData.role = values[index] || 'player';
          else if (header === 'active' || header === 'status') {
            userData.active = values[index]?.toLowerCase() === 'active' || values[index]?.toLowerCase() === 'true';
          }
          else if (header === 'team') userData.team_name = values[index];
          else if (header === 'cellphone' || header === 'phone') userData.cellphone = values[index];
          else if (header === 'password') userData.password = values[index];
        });

        // Validate required fields
        if (userData.email && userData.first_name && userData.last_name) {
          usersToCreate.push(userData);
        }
      }

      if (usersToCreate.length === 0) {
        alert('No valid users found in CSV data');
        return;
      }

      // Call bulk create Netlify function
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      
      if (!token) {
        throw new Error('No active session');
      }
      
      const response = await fetch('/.netlify/functions/bulk-create-users', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ users: usersToCreate }),
      });

      const results = await response.json();

      if (!response.ok) {
        throw new Error(results.error || 'Failed to import users');
      }

      // Show results
      let message = `Import complete!\n\nSuccessfully created: ${results.success} users\nFailed: ${results.failed} users`;
      if (results.errors && results.errors.length > 0) {
        message += '\n\nErrors:\n' + results.errors.slice(0, 5).map((e: any) => 
          `${e.email}: ${e.error}`
        ).join('\n');
        if (results.errors.length > 5) {
          message += `\n... and ${results.errors.length - 5} more errors`;
        }
      }
      alert(message);

      setImportData('');
      setIsImportModalOpen(false);
      fetchUsers(); // Refresh the list
    } catch (error: any) {
      console.error('Error importing users:', error);
      alert(`Import failed: ${error.message}`);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    return roleOptions.find((r) => r.value === role)?.color || 'bg-gray-100 text-gray-700';
  };

  const handleAddTeamAssignment = async () => {
    if (!editingUser || !newAssignment.teamId) return;
    try {
      await rolesApi.addTeamMember(newAssignment.teamId, editingUser.id, newAssignment.role);
      const memberships = await rolesApi.getUserTeamMemberships(editingUser.id);
      setEditMemberships(memberships);
      setNewAssignment({ teamId: '', role: 'player' });
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleChangeTeamRole = async (membershipId: string, role: TeamRole) => {
    try {
      await rolesApi.updateTeamMemberRole(membershipId, role);
      setEditMemberships(prev => prev.map(m => m.id === membershipId ? { ...m, role } : m));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleRemoveTeamAssignment = async (membershipId: string) => {
    if (!confirm('Remove this team assignment?')) return;
    try {
      await rolesApi.removeTeamMember(membershipId);
      setEditMemberships(prev => prev.filter(m => m.id !== membershipId));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handlePromoteToFull = async (userId: string) => {
    if (!confirm('Promote this lite user to full membership?')) return;
    try {
      await rolesApi.promoteToFullUser(userId);
      fetchUsers();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-600 mt-1">Manage user accounts and permissions</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              Import CSV
            </button>
            <button
              onClick={() => handleOpenModal()}
              className="px-4 py-2 bg-[#0091f3] text-white rounded-lg font-medium hover:bg-[#0077cc] flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add User
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search users by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0091f3]"
            />
            <svg
              className="absolute left-3 top-2.5 w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0091f3]"
          >
            <option value="all">All Roles</option>
            {roleOptions.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0091f3]"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          <select
            value={filterUserType}
            onChange={(e) => setFilterUserType(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0091f3]"
          >
            <option value="all">All Types</option>
            <option value="full">Full Members</option>
            <option value="lite">Lite Users</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="flex-1 bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Team
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Login
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredUsers.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-[#0091f3] bg-opacity-10 flex items-center justify-center">
                        <span className="text-[#0091f3] font-medium">
                          {user.first_name[0]}
                          {user.last_name[0]}
                        </span>
                      </div>
                      <div className="ml-3">
                        <div className="font-medium text-gray-900">
                          {user.first_name} {user.last_name}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(user.role)}`}>
                      {roleOptions.find((r) => r.value === user.role)?.label || user.role}
                    </span>
                    {user.user_type === 'lite' && (
                      <span className="ml-1 px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">Lite</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{user.team}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => handleToggleStatus(user.id)}
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        user.active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {user.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.last_login}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleOpenModal(user)}
                      className="text-[#0091f3] hover:text-[#0077cc] mr-3"
                    >
                      Edit
                    </button>
                    {user.user_type === 'lite' && (
                      <button
                        onClick={() => handlePromoteToFull(user.id)}
                        className="text-green-600 hover:text-green-800 mr-3"
                      >
                        Promote
                      </button>
                    )}
                    <button onClick={() => handleDelete(user.id)} className="text-red-600 hover:text-red-800">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <svg
              className="w-12 h-12 text-gray-300 mx-auto mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            <p className="text-gray-500">No users found</p>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingUser ? 'Edit User' : 'Add New User'}
              </h2>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0091f3]"
                    placeholder="John"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0091f3]"
                    placeholder="Smith"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={!!editingUser}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0091f3] disabled:bg-gray-100"
                  placeholder="john.smith@example.com"
                />
                {editingUser && (
                  <p className="text-xs text-gray-500 mt-1">Email cannot be changed after creation</p>
                )}
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password {!editingUser && '*'}
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0091f3]"
                    placeholder="Leave blank for random password"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    If left blank, a random password will be generated. User can reset via email.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.cellphone}
                  onChange={(e) => setFormData({ ...formData, cellphone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0091f3]"
                  placeholder="021-123-4567"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0091f3]"
                  >
                    {roleOptions.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                  <select
                    value={formData.active ? 'active' : 'inactive'}
                    onChange={(e) => setFormData({ ...formData, active: e.target.value === 'active' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0091f3]"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  {/* 2026-08-31 — previously bound to `formData.status`, a
                      field that doesn't exist on this form's state (only
                      `active: boolean` does), so this dropdown silently had
                      no effect on save at all — `handleSubmit` already only
                      ever read `formData.active`. Fixed as part of
                      relocating Deactivate/Reactivate to this screen. */}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team Assignments</label>
                {editingUser ? (
                  <div className="space-y-2">
                    {editMemberships.map(m => (
                      <div key={m.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                        <span className="flex-1 text-sm">{m.team?.age_group} {m.team?.name}</span>
                        <select value={m.role} onChange={e => handleChangeTeamRole(m.id, e.target.value as TeamRole)}
                          className="px-2 py-1 border rounded text-sm">
                          <option value="player">Player</option>
                          <option value="coach">Coach</option>
                          <option value="manager">Manager</option>
                        </select>
                        <button onClick={() => handleRemoveTeamAssignment(m.id)}
                          className="text-red-500 hover:text-red-700 text-sm">✕</button>
                      </div>
                    ))}
                    {editMemberships.length === 0 && <p className="text-sm text-gray-400">No team assignments</p>}
                    <div className="flex gap-2 mt-2">
                      <select value={newAssignment.teamId} onChange={e => setNewAssignment({ ...newAssignment, teamId: e.target.value })}
                        className="flex-1 px-2 py-1 border rounded text-sm">
                        <option value="">+ Add to team...</option>
                        {teams.filter(t => !editMemberships.some(m => m.team_id === t.id)).map(t => (
                          <option key={t.id} value={t.id}>{t.age_group} {t.name}</option>
                        ))}
                      </select>
                      <select value={newAssignment.role} onChange={e => setNewAssignment({ ...newAssignment, role: e.target.value as TeamRole })}
                        className="px-2 py-1 border rounded text-sm">
                        <option value="player">Player</option>
                        <option value="coach">Coach</option>
                        <option value="manager">Manager</option>
                      </select>
                      <button onClick={handleAddTeamAssignment} disabled={!newAssignment.teamId}
                        className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">Add</button>
                    </div>
                  </div>
                ) : (
                  <select
                    value={formData.teamId}
                    onChange={(e) => setFormData({ ...formData, teamId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0091f3]"
                  >
                    <option value="">None (Unassigned)</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.age_group} {team.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-[#0091f3] text-white rounded-lg font-medium hover:bg-[#0077cc]"
              >
                {editingUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl mx-4">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Import Users from CSV</h2>
              <p className="text-sm text-gray-600 mt-1">
                Paste CSV data with headers: email, first_name, last_name, role, active, team, cellphone, password (optional)
              </p>
            </div>

            <div className="p-6">
              <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800 font-medium mb-2">Example CSV format:</p>
                <code className="text-xs text-blue-900 block">
                  email,first_name,last_name,role,active,team,cellphone,password
                  <br />
                  john@example.com,John,Doe,coach,true,Rangers U10 Blue,021-123-4567,MyPassword123
                  <br />
                  jane@example.com,Jane,Smith,player,true,Rangers U12 Red,021-987-6543,
                </code>
                <p className="text-xs text-blue-700 mt-2">
                  • Password is optional - if blank, a random password will be generated
                  <br />
                  • Active can be: true/false or active/inactive
                  <br />
                  • Role can be: player, caregiver, coach, manager, admin
                  <br />
                  • Team name will be matched (partial match OK)
                </p>
              </div>

              <textarea
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                className="w-full h-64 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0091f3] font-mono text-sm"
                placeholder="Paste CSV data here..."
              />
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportData('');
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                className="px-4 py-2 bg-[#0091f3] text-white rounded-lg font-medium hover:bg-[#0077cc]"
              >
                Import Users
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
