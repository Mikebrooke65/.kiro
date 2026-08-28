import { useState, useEffect } from 'react';
import { Upload, X, Calendar, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { TargetingSelector, type TargetingData } from '../../components/shared/TargetingSelector';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

interface Announcement {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  is_ongoing: boolean;
  expires_at: string | null;
  target_roles: string[] | null;
  target_team_types: string[] | null;
  target_divisions: string[] | null;
  target_age_groups: string[] | null;
  target_team_ids: string[] | null;
  created_at: string;
  created_by: string | null;
}

export function Announcements() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    is_ongoing: false,
  });

  const [targetingData, setTargetingData] = useState<TargetingData>({
    target_roles: [],
    target_team_types: [],
    target_divisions: [],
    target_age_groups: [],
    target_team_ids: [],
    target_user_ids: [], // Not used for announcements but required by interface
  });

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (error) {
      console.error('Error fetching announcements:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (announcement?: Announcement) => {
    if (announcement) {
      setEditingAnnouncement(announcement);
      setFormData({
        title: announcement.title,
        content: announcement.content,
        is_ongoing: announcement.is_ongoing,
      });
      setTargetingData({
        target_roles: announcement.target_roles || [],
        target_team_types: announcement.target_team_types || [],
        target_divisions: announcement.target_divisions || [],
        target_age_groups: announcement.target_age_groups || [],
        target_team_ids: announcement.target_team_ids || [],
        target_user_ids: [], // Not used for announcements
      });
    } else {
      setEditingAnnouncement(null);
      setFormData({
        title: '',
        content: '',
        is_ongoing: false,
      });
      setTargetingData({
        target_roles: [],
        target_team_types: [],
        target_divisions: [],
        target_age_groups: [],
        target_team_ids: [],
        target_user_ids: [],
      });
    }
    setImageFile(null);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.content) {
      alert('Please provide title and content');
      return;
    }

    try {
      let imageUrl = editingAnnouncement?.image_url || null;

      // Upload image if provided
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `${Date.now()}_${imageFile.name}`;
        const filePath = `announcements/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('announcements')
          .upload(filePath, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('announcements')
          .getPublicUrl(filePath);

        imageUrl = publicUrl;
      }

      const announcementData = {
        title: formData.title,
        content: formData.content,
        image_url: imageUrl,
        is_ongoing: formData.is_ongoing,
        target_roles: targetingData.target_roles.length > 0 ? targetingData.target_roles : null,
        target_team_types: targetingData.target_team_types.length > 0 ? targetingData.target_team_types : null,
        target_divisions: targetingData.target_divisions.length > 0 ? targetingData.target_divisions : null,
        target_age_groups: targetingData.target_age_groups.length > 0 ? targetingData.target_age_groups : null,
        target_team_ids: targetingData.target_team_ids.length > 0 ? targetingData.target_team_ids : null,
        created_by: user?.id,
      };

      if (editingAnnouncement) {
        const { error } = await supabase
          .from('announcements')
          .update(announcementData)
          .eq('id', editingAnnouncement.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('announcements')
          .insert(announcementData);

        if (error) throw error;
      }

      await fetchAnnouncements();
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving announcement:', error);
      alert('Failed to save announcement. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;

    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchAnnouncements();
    } catch (error) {
      console.error('Error deleting announcement:', error);
      alert('Failed to delete announcement. Please try again.');
    }
  };

  const getExpiryStatus = (announcement: Announcement) => {
    if (announcement.is_ongoing) {
      return { label: 'Ongoing', color: 'bg-green-100 text-green-700' };
    }
    if (!announcement.expires_at) {
      return { label: 'Active', color: 'bg-blue-100 text-blue-700' };
    }
    const expiryDate = new Date(announcement.expires_at);
    const now = new Date();
    if (expiryDate < now) {
      return { label: 'Expired', color: 'bg-gray-100 text-gray-700' };
    }
    const daysLeft = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return { label: `${daysLeft}d left`, color: 'bg-yellow-100 text-yellow-700' };
  };

  const getTargetingSummary = (announcement: Announcement) => {
    const parts = [];
    if (announcement.target_roles && announcement.target_roles.length > 0) {
      parts.push(announcement.target_roles.join(', '));
    }
    if (announcement.target_age_groups && announcement.target_age_groups.length > 0) {
      parts.push(announcement.target_age_groups.join(', '));
    }
    if (announcement.target_team_ids && announcement.target_team_ids.length > 0) {
      parts.push(`${announcement.target_team_ids.length} team(s)`);
    }
    return parts.length > 0 ? parts.join(' • ') : 'All users';
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Announcements</h1>
            <p className="text-gray-600 mt-1">Manage announcements for the Landing Page</p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="px-4 py-2 bg-[#0091f3] text-white rounded-lg font-medium hover:bg-[#0077cc] flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Announcement
          </button>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0091f3]"></div>
          </div>
        ) : announcements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Targeting</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {announcements.map((announcement) => {
                  const status = getExpiryStatus(announcement);
                  return (
                    <tr key={announcement.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-3">
                          {announcement.image_url && (
                            <img 
                              src={announcement.image_url} 
                              alt="" 
                              className="w-12 h-12 rounded object-cover"
                            />
                          )}
                          <div>
                            <div className="font-medium text-gray-900">{announcement.title}</div>
                            <div 
                              className="text-sm text-gray-600 line-clamp-2"
                              dangerouslySetInnerHTML={{ __html: announcement.content }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {getTargetingSummary(announcement)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${status.color}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(announcement.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm font-medium">
                        <button
                          onClick={() => handleOpenModal(announcement)}
                          className="text-[#0091f3] hover:text-[#0077cc] mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(announcement.id)}
                          className="text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">No announcements yet</p>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 my-8">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {editingAnnouncement ? 'Edit Announcement' : 'New Announcement'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* Targeting — was a broken, half-finished duplicate of this
                  same UI inline right here, reading `formData.target_roles`
                  etc. (never actually part of `formData`'s state — see the
                  history for this file) and an undeclared `teams` variable.
                  It crashed every single time this modal opened (New or
                  Edit) with "Cannot read properties of undefined (reading
                  'includes')" — found live 2026-08-27 during Task 12
                  testing. `targetingData` state and the `TargetingSelector`
                  import were already present and already correctly wired up
                  in `handleOpenModal`/`handleSave` below; the only thing
                  missing was actually rendering the component. */}
              <TargetingSelector value={targetingData} onChange={setTargetingData} />

              {/* Basic Info */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0091f3]"
                  placeholder="e.g., Season 2026 Kickoff"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content *</label>
                <ReactQuill
                  value={formData.content}
                  onChange={(value) => setFormData({ ...formData, content: value })}
                  modules={{
                    toolbar: [
                      [{ 'header': [2, 3, false] }],
                      ['bold', 'italic', 'underline'],
                      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                      ['clean']
                    ]
                  }}
                  formats={['header', 'bold', 'italic', 'underline', 'list', 'bullet']}
                  className="bg-white"
                  style={{ height: '300px', marginBottom: '50px' }}
                  placeholder="Announcement message..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Image (Optional)</label>
                <input
                  type="file"
                  onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                  accept="image/*"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0091f3]"
                />
                {editingAnnouncement?.image_url && !imageFile && (
                  <img 
                    src={editingAnnouncement.image_url} 
                    alt="Current" 
                    className="mt-2 w-32 h-32 rounded object-cover"
                  />
                )}
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_ongoing}
                  onChange={(e) => setFormData({ ...formData, is_ongoing: e.target.checked })}
                  className="w-4 h-4 text-[#0091f3] border-gray-300 rounded focus:ring-[#0091f3]"
                />
                <label className="ml-2 text-sm text-gray-700">
                  Ongoing (won't expire after 7 days)
                </label>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 bg-[#0091f3] text-white rounded-lg font-medium hover:bg-[#0077cc]"
              >
                {editingAnnouncement ? 'Save Changes' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
