import { RouterProvider, useNavigate } from 'react-router';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { router } from './routes';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useResponsive } from './hooks/useResponsive';
import { usePushNotifications } from './hooks/usePushNotifications';
import { useEffect } from 'react';

function AppInitializer() {
  const { isLoading, isAuthenticated } = useAuth();
  
  // Initialize hooks that need to run at app level
  useOnlineStatus();
  useResponsive();
  usePushNotifications();

  // Show loading screen while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-[#0091f3]"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <RouterProvider router={router} />
      {/* Renders in-app toasts for pushNotificationReceived (foreground
          pushes) — see hooks/usePushNotifications.ts. Not tied to a route so
          it survives navigation. */}
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInitializer />
    </AuthProvider>
  );
}
