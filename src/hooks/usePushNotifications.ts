import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { App } from '@capacitor/app';
import { useAuth } from '../contexts/AuthContext';
import { deviceTokensApi } from '../lib/device-tokens-api';
import { supabase } from '../lib/supabase';

/**
 * Registers this device for push notifications (via Firebase Cloud Messaging)
 * once a user is authenticated, and stores the resulting token in Supabase
 * so Edge Functions can look it up to send notifications.
 *
 * Also reconnects Supabase Realtime when the app returns to the foreground —
 * mobile OSes suspend WebSocket connections while the app is backgrounded,
 * so without this, Team Messaging can appear "frozen" until a manual refresh.
 *
 * No-ops entirely on web (Capacitor.isNativePlatform() is false there) —
 * this only does anything inside the native iOS/Android app.
 */
// Tracks the token registered by this device for the currently signed-in
// user, so we can remove it if they sign out (matters most on shared
// devices — a signed-out device shouldn't keep receiving another user's
// push notifications). Capacitor doesn't expose a "get current token"
// getter, so we have to remember it ourselves from the 'registration' event.
let lastRegisteredToken: string | null = null;

export function usePushNotifications() {
  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Realtime reconnect on app resume — safe to register regardless of auth state
    const appStateListener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        supabase.realtime.connect();
      }
    });

    return () => {
      appStateListener.remove();
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    if (!isAuthenticated || !user) {
      // Signed out while the app is running — stop this device receiving
      // pushes for the user that just signed out
      if (lastRegisteredToken) {
        const tokenToRemove = lastRegisteredToken;
        lastRegisteredToken = null;
        deviceTokensApi.removeToken(tokenToRemove).catch((err) => {
          console.error('Failed to remove device token on sign out:', err);
        });
      }
      return;
    }

    let registrationListener: { remove: () => void } | undefined;
    let errorListener: { remove: () => void } | undefined;

    const setup = async () => {
      const permission = await PushNotifications.checkPermissions();

      if (permission.receive === 'prompt') {
        const requested = await PushNotifications.requestPermissions();
        if (requested.receive !== 'granted') {
          console.log('Push notification permission denied');
          return;
        }
      } else if (permission.receive !== 'granted') {
        console.log('Push notification permission not granted:', permission.receive);
        return;
      }

      registrationListener = await PushNotifications.addListener('registration', async (token) => {
        const platform = Capacitor.getPlatform() as 'ios' | 'android';
        try {
          await deviceTokensApi.registerToken(token.value, platform);
          lastRegisteredToken = token.value;
          console.log('Device token registered for push notifications');
        } catch (err) {
          console.error('Failed to register device token:', err);
        }
      });

      errorListener = await PushNotifications.addListener('registrationError', (err) => {
        console.error('Push notification registration error:', err);
      });

      await PushNotifications.register();
    };

    setup();

    return () => {
      registrationListener?.remove();
      errorListener?.remove();
    };
  }, [isAuthenticated, user]);
}
