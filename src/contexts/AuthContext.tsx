import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { User as SupabaseUser, Session } from '@supabase/supabase-js';
import type { User, UserProfile, TeamMember, Team } from '../types/database';

interface AuthState {
  user: UserProfile | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isAuthenticated: false,
    isLoading: true,
  });
  
  // Track if we're currently fetching to prevent duplicate fetches
  const isFetchingProfile = useRef(false);

  // Fetch user profile with team assignments
  const fetchUserProfile = async (userId: string): Promise<UserProfile | null> => {
    // Prevent duplicate fetches
    if (isFetchingProfile.current) {
      console.log('Profile fetch already in progress, skipping...');
      return null;
    }

    isFetchingProfile.current = true;
    
    try {
      console.log('Fetching user profile for:', userId);
      
      // Fetch user details
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userError) {
        console.error('Error fetching user:', userError);
        throw userError;
      }

      console.log('User data fetched:', userData);

      // Fetch team memberships from team_members (source of truth)
      const { data: teamMemberships, error: teamsError } = await supabase
        .from('team_members')
        .select(`
          *,
          team:teams(*)
        `)
        .eq('user_id', userId);

      if (teamsError) {
        console.warn('Error fetching team memberships (continuing anyway):', teamsError);
      }

      console.log('Team memberships fetched:', teamMemberships?.length || 0);

      // Find default team (first membership)
      const defaultTeam = teamMemberships?.[0]?.team;

      const profile = {
        ...userData,
        teams: [], // legacy field — kept for backward compat
        teamMemberships: teamMemberships || [],
        defaultTeam,
      } as UserProfile;
      
      console.log('Profile complete:', profile);
      return profile;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    } finally {
      isFetchingProfile.current = false;
    }
  };

  // Initialize auth state
  useEffect(() => {
    let mounted = true;

    // Check active session - simplified without timeout
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (!mounted) return;
        
        if (error) {
          console.error('Error getting session:', error);
          setState({
            user: null,
            session: null,
            isAuthenticated: false,
            isLoading: false,
          });
          return;
        }
        
        if (session?.user) {
          console.log('Session found, fetching profile...');
          fetchUserProfile(session.user.id).then((profile) => {
            if (!mounted) return;
            console.log('Profile fetched, setting authenticated state');
            setState({
              user: profile,
              session,
              isAuthenticated: !!profile,
              isLoading: false,
            });
          }, (err) => {
            if (!mounted) return;
            console.error('Profile fetch failed:', err);
            // Even if profile fetch fails, keep the session
            setState({
              user: null,
              session,
              isAuthenticated: true, // Changed: Keep authenticated if session exists
              isLoading: false,
            });
          });
        } else {
          console.log('No session found');
          setState({
            user: null,
            session: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      }, (error) => {
        if (!mounted) return;
        console.error('Error initializing auth:', error);
        setState({
          user: null,
          session: null,
          isAuthenticated: false,
          isLoading: false,
        });
      });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event, !!session);
      
      // Only handle SIGNED_OUT events - SIGNED_IN is handled by getSession above
      if (event === 'SIGNED_OUT') {
        setState({
          user: null,
          session: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
      // Ignore SIGNED_IN and INITIAL_SESSION - already handled by getSession
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Login function
  const login = async (email: string, password: string) => {
    console.log('Login function called with email:', email);

    try {
      console.log('Calling Supabase signInWithPassword...');
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log('Supabase response received:', { hasData: !!data, hasError: !!error });

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      if (data.user && data.session) {
        console.log('User authenticated, setting state immediately...');
        
        // Set authenticated state immediately - no loading spinner
        setState({
          user: null, // Will be populated by profile fetch
          session: data.session,
          isAuthenticated: true,
          isLoading: false,
        });
        
        // Fetch profile in background
        const profile = await fetchUserProfile(data.user.id);

        console.log('Login successful, updating with profile');
        setState({
          user: profile,
          session: data.session,
          isAuthenticated: true,
          isLoading: false,
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  };

  // Logout function
  const logout = async () => {
    setState((prev) => ({ ...prev, isLoading: true }));

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setState({
        user: null,
        session: null,
        isAuthenticated: false,
        isLoading: false,
      });
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  };

  // Reset password function — sends the reset email (step 1 of 2). The link
  // in that email lands back on /reset-password with a short-lived recovery
  // session already established by the Supabase client (detectSessionInUrl,
  // on by default) by the time this app's own auth-state check resolves.
  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) throw error;
  };

  // Update password function — step 2 of the reset flow (ResetPassword.tsx),
  // and reusable anywhere else a signed-in user wants to change their
  // password. Requires an active session; the recovery-link session from
  // resetPasswordForEmail above is sufficient, no separate re-auth needed.
  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  // Update profile function
  const updateProfile = async (updates: Partial<User>) => {
    if (!state.user) throw new Error('No user logged in');

    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', state.user.id);

    if (error) throw error;

    // Refresh user profile
    const profile = await fetchUserProfile(state.user.id);
    setState((prev) => ({ ...prev, user: profile }));
  };

  const value: AuthContextType = {
    ...state,
    login,
    logout,
    resetPassword,
    updatePassword,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
