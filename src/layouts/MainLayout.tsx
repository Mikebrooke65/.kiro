import { Outlet, NavLink } from 'react-router';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types/database';
import { LogoutButton } from '../components/LogoutButton';
import gannetWhite from '../assets/e2b3da3f33b0748e111b306a15bee82b12f28232.png';

// Bottom-nav tab definition. Visibility is driven purely by App_Role
// (users.role), independent of user_type (a lite manager sees the same tabs as
// a full manager). Page colours follow the project's semantic scheme; Team
// adopts the (now-freed) Resources purple. Resources is no longer a bottom tab —
// it lives as a second-level page reached from Home.
interface TabDef {
  to: string;
  label: string;
  color: string;
  icon: JSX.Element;
  end?: boolean;
}

const ICONS: Record<string, JSX.Element> = {
  home: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
    />
  ),
  team: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
    />
  ),
  coaching: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
    />
  ),
  games: (
    <>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </>
  ),
  schedule: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
    />
  ),
  messages: (
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
    />
  ),
};

/**
 * Build the bottom-nav tabs for a given App_Role. Every role gets Home, Team,
 * Schedule and Messages. Coaching is Coach/Admin only; Games is
 * Manager/Coach/Admin (its coach-only sections are gated inside the page). The
 * result is always <= 6 tabs.
 */
function tabsForRole(role: UserRole | undefined): TabDef[] {
  const showCoaching = role === UserRole.ADMIN || role === UserRole.COACH;
  const showGames =
    role === UserRole.ADMIN || role === UserRole.COACH || role === UserRole.MANAGER;

  return [
    { to: '/', label: 'Home', color: '#0091f3', icon: ICONS.home, end: true },
    { to: '/team', label: 'Team', color: '#8b5cf6', icon: ICONS.team },
    ...(showCoaching
      ? [{ to: '/coaching', label: 'Coaching', color: '#22c55e', icon: ICONS.coaching }]
      : []),
    ...(showGames
      ? [{ to: '/games', label: 'Games', color: '#ea7800', icon: ICONS.games }]
      : []),
    { to: '/schedule', label: 'Schedule', color: '#06b6d4', icon: ICONS.schedule },
    { to: '/messaging', label: 'Messages', color: '#545859', icon: ICONS.messages },
  ];
}

export function MainLayout() {
  const { user } = useAuth();
  const tabs = tabsForRole(user?.role);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header — safe-area-top keeps the title clear of the status bar /
          notch on devices where the app draws edge-to-edge */}
      <header className="bg-[#0091f3] text-white safe-area-top">
        <div className="px-4 py-3 flex justify-between items-center">
          {/* Logo & Title with Gannet Silhouette */}
          <div className="relative">
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-24 h-24 opacity-40 pointer-events-none">
              <img src={gannetWhite} alt="" className="w-full h-full object-contain" />
            </div>
            <div className="relative z-10 pl-10">
              <h1 className="font-bold text-2xl leading-tight">Urrah</h1>
              <p className="text-xs opacity-90">
                {user?.first_name} {user?.last_name} • {user?.role}
              </p>
            </div>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-3">
            <LogoutButton className="text-white hover:bg-white/10 p-2 rounded-md transition-colors" />
          </div>
        </div>
      </header>

      {/* Main content — bottom padding clears the fixed nav below (its own
          height plus whatever safe-area it adds for a gesture bar) so the
          last bit of page content is never hidden behind it */}
      <main
        className="flex-1 overflow-auto"
        style={{ paddingBottom: 'calc(4.25rem + env(safe-area-inset-bottom))' }}
      >
        <Outlet />
      </main>

      {/* Bottom navigation — per-role tabs, max 6, driven by App_Role.
          safe-area-bottom keeps the tabs clear of a gesture-nav bar; each
          tab targets a >=48px min-height touch target (Material Design's
          recommended minimum) rather than shrink-wrapping to the icon. */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50 safe-area-bottom">
        <div
          className="grid max-w-lg mx-auto gap-1 px-2 py-1.5"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center min-h-[48px] py-2 px-1 rounded-lg text-white transition-all ${
                  isActive ? 'opacity-100' : 'opacity-70'
                }`
              }
              style={{ backgroundColor: tab.color }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {tab.icon}
              </svg>
              <span className="text-[10px] font-normal leading-tight mt-0.5">{tab.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
