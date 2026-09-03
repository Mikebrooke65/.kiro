import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ReportFilters } from '../../components/reporting/ReportFilters';
import { ExportButton } from '../../components/reporting/ExportButton';
import { reportingApi, ReportFilters as Filters, GameFeedbackRow } from '../../lib/reporting-api';

export function GameFeedbackReport() {
  const navigate = useNavigate();
  const [data, setData] = useState<GameFeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (appliedFilters: Filters = {}) => {
    try {
      setLoading(true);
      setError(null);
      const result = await reportingApi.getGameFeedback(appliedFilters);
      setData(result);
    } catch (err) {
      console.error('Error loading game feedback:', err);
      setError('Failed to load game feedback. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = (newFilters: Filters) => {
    setFilters(newFilters);
    loadData(newFilters);
  };

  const handleClearFilters = () => {
    setFilters({});
    loadData({});
  };

  // Export columns for CSV
  const exportColumns = [
    { key: 'teamName', label: 'Team' },
    { key: 'gameDate', label: 'Date' },
    { key: 'opponent', label: 'Opponent' },
    { key: 'coachName', label: 'Coach' },
    { key: 'feedbackType', label: 'Type' },
    { key: 'playerName', label: 'Player' },
    { key: 'feedbackText', label: 'Feedback' },
    { key: 'phaseTags', label: 'Phase Tags' },
  ];

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="mb-4">
        <button
          onClick={() => navigate('/desktop/reporting')}
          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Reports
        </button>
      </div>

      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Game Feedback</h1>
        <p className="text-gray-600 mt-2">
          View team and individual feedback recorded against games
        </p>
      </div>

      {/* Filters */}
      <ReportFilters
        availableFilters={['dateRange', 'team', 'coach', 'ageGroup']}
        onApplyFilters={handleApplyFilters}
        onClearFilters={handleClearFilters}
      />

      {/* Summary Stats */}
      {!loading && !error && (
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Game Feedback Entries</p>
              <p className="text-2xl font-bold text-gray-900">{data.length}</p>
            </div>
            <div className="flex gap-2">
              <ExportButton
                format="csv"
                data={data}
                columns={exportColumns}
                filename={`game-feedback-${new Date().toISOString().split('T')[0]}`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm text-red-800">{error}</p>
              <button
                onClick={() => loadData(filters)}
                className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="h-20 bg-gray-200 rounded"></div>
                <div className="h-20 bg-gray-200 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && data.length === 0 && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No game feedback found</h3>
          <p className="mt-1 text-sm text-gray-500">
            No results match your filters. Try adjusting your criteria.
          </p>
        </div>
      )}

      {/* Game Feedback Cards */}
      {!loading && !error && data.length > 0 && (
        <div className="space-y-6">
          {data.map((feedback) => (
            <div key={feedback.id} className="bg-white rounded-lg shadow overflow-hidden">
              {/* Card Header */}
              <div className="px-6 py-4 border-b" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{feedback.teamName}</h3>
                    <p className="text-sm text-gray-600">
                      {new Date(feedback.gameDate).toLocaleDateString('en-GB', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                      {feedback.opponent && ` vs ${feedback.opponent}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Coach</p>
                    <p className="text-sm font-medium text-gray-900">{feedback.coachName}</p>
                  </div>
                </div>
              </div>

              {/* Feedback body */}
              <div className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-medium uppercase tracking-wide px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                    {feedback.feedbackType === 'player' ? 'Individual' : 'Team'}
                  </span>
                  {feedback.feedbackType === 'player' && feedback.playerName && (
                    <span className="text-sm font-medium text-gray-900">{feedback.playerName}</span>
                  )}
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{feedback.feedbackText}</p>
                {feedback.phaseTags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {feedback.phaseTags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: 'rgba(217, 119, 6, 0.15)', color: '#92400e' }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
