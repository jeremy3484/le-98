"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

interface UserContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** Recharge le profil depuis la base (après édition du pseudo/avatar). */
  refreshProfile: () => Promise<void>;
  /** Déconnexion. */
  signOut: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({
  children,
  initialUser = null,
  initialProfile = null,
}: {
  children: React.ReactNode;
  initialUser?: User | null;
  initialProfile?: Profile | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(initialUser);
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [loading, setLoading] = useState(!initialUser);
  const userIdRef = useRef<string | null>(initialUser?.id ?? null);

  const fetchProfile = useCallback(
    async (userId: string) => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      setProfile((data as Profile) ?? null);
    },
    [supabase],
  );

  const refreshProfile = useCallback(async () => {
    if (!userIdRef.current) return;
    await fetchProfile(userIdRef.current);
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    userIdRef.current = null;
  }, [supabase]);

  useEffect(() => {
    let active = true;

    // Synchronise l'état d'auth (login, logout, refresh de token...).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      userIdRef.current = nextUser?.id ?? null;

      if (nextUser) {
        await fetchProfile(nextUser.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    // Premier chargement si non hydraté côté serveur.
    if (!initialUser) {
      supabase.auth.getUser().then(async ({ data }) => {
        if (!active) return;
        const u = data.user ?? null;
        setUser(u);
        userIdRef.current = u?.id ?? null;
        if (u) await fetchProfile(u.id);
        setLoading(false);
      });
    }

    return () => {
      active = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const value = useMemo<UserContextValue>(
    () => ({ user, profile, loading, refreshProfile, signOut }),
    [user, profile, loading, refreshProfile, signOut],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useUser doit être utilisé à l'intérieur de <UserProvider>");
  }
  return ctx;
}
