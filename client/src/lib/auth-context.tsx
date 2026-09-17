import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  lastAuthEvent: AuthChangeEvent | null;
  profile: { id: string; full_name: string; email: string; role: "manager" | "coordinator" | "member"; mess_id: string | null; picture_url: string | null } | null;
  profileLoading: boolean;
  canManageMembers: boolean;
  canManageRoles: boolean;
  canOperateMeals: boolean;
  canManageExpenses: boolean;
  canManageDeposits: boolean;
  canManageCycles: boolean;
  canManageMess: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastAuthEvent, setLastAuthEvent] = useState<AuthChangeEvent | null>(
    null,
  );
  const [profile, setProfile] = useState<AuthContextValue["profile"]>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();

      if (!active) {
        return;
      }

      if (error) {
        console.error("Error loading auth session:", error);
      }

      const sessionUser = data.session?.user;
      if (sessionUser) {
        const cacheKey = `mealtrack-profile-${sessionUser.id}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed && typeof parsed === "object") {
              setProfile(parsed);
              setProfileLoading(false);
            }
          } catch {
            /* ignore */
          }
        }
      }

      setSession(data.session ?? null);
      setLoading(false);
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) {
        return;
      }

      setLastAuthEvent(event);
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const fetchProfile = async () => {
    if (!session?.user) return;
    setProfileLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, mess_id, picture_url")
      .eq("id", session.user.id)
      .maybeSingle();
    if (error) console.error("Error loading profile:", error);
    if (data) {
      setProfile(data as AuthContextValue["profile"]);
      try {
        localStorage.setItem(`mealtrack-profile-${session.user.id}`, JSON.stringify(data));
      } catch {
        /* ignore */
      }
    }
    setProfileLoading(false);
  };

  useEffect(() => {
    let active = true;
    if (!session?.user) {
      setProfile(null);
      setProfileLoading(false);
      return;
    }

    const cacheKey = `mealtrack-profile-${session.user.id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === "object") {
          setProfile(parsed);
          setProfileLoading(false);
        }
      } catch {
        setProfileLoading(true);
      }
    } else {
      setProfileLoading(true);
    }

    void supabase
      .from("profiles")
      .select("id, full_name, email, role, mess_id, picture_url")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("Error loading profile:", error);
          if (!cached) {
            setProfile(null);
          }
        } else {
          setProfile(data as AuthContextValue["profile"]);
          if (data) {
            try {
              localStorage.setItem(cacheKey, JSON.stringify(data));
            } catch {
              /* ignore */
            }
          }
        }
        setProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  const isManager = profile?.role === "manager";
  const canOperate = isManager || profile?.role === "coordinator";

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    lastAuthEvent,
    profile,
    profileLoading,
    canManageMembers: isManager,
    canManageRoles: isManager,
    canOperateMeals: canOperate,
    canManageExpenses: canOperate,
    canManageDeposits: canOperate,
    canManageCycles: isManager,
    canManageMess: isManager,
    signOut: async () => {
      if (session?.user) {
        window.sessionStorage.removeItem(`mealtrack:notification-onboarding-dismissed:${session.user.id}`);
      }
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }
    },
    refreshProfile: fetchProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
