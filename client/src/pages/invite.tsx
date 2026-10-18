import { useEffect, useState } from "react";
import { CheckCircle2, Clock3, Copy, LoaderCircle, UserPlus, UsersRound } from "lucide-react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-context";

type InvitePreview = { mess_name: string; target_member_name: string | null; expires_at: string; status: string };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function InvitePage({ token }: { token: string }) {
  const [, setLocation] = useLocation();
  const { session, profile, profileLoading, refreshProfile } = useAuth();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [claimAttempted, setClaimAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    let active = true;
    setPreview(null);
    setError(null);
    setLoading(true);
    if (!UUID_PATTERN.test(token)) {
      setError("This invite link was not found.");
      setLoading(false);
      return () => { active = false; };
    }
    void supabase.rpc("get_member_invite_preview", { invite_token: token }).then(({ data, error: previewError }) => {
      if (!active) return;
      if (previewError || !data?.[0]) setError("This invite link was not found.");
      else setPreview(data[0] as InvitePreview);
      setLoading(false);
    });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!session || profileLoading || !profile || !preview || preview.status !== "active" || claiming || claimed || claimAttempted) return;
    if (profile.mess_id) {
      setError("Your account already belongs to a mess.");
      return;
    }
    setClaimAttempted(true);
    setClaiming(true);
    void supabase.rpc("accept_member_invite", { invite_token: token }).then(async ({ error: claimError }) => {
      if (claimError) setError(claimError.message);
      else {
        await refreshProfile();
        setClaimed(true);
        window.setTimeout(() => setLocation("/app"), 1200);
      }
      setClaiming(false);
    });
  }, [claimAttempted, claimed, claiming, preview, profile, profileLoading, refreshProfile, session, setLocation, token]);

  const goToAuth = (mode: "login" | "signup") => setLocation(`/app/auth?invite=${encodeURIComponent(token)}&mode=${mode}`);
  const expiry = preview ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(preview.expires_at)) : "";

  return <div className="min-h-screen bg-background px-4 py-10"><div className="mx-auto flex min-h-[80vh] max-w-lg items-center"><Card className="w-full shadow-xl"><CardHeader className="text-center"><div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><UsersRound className="h-7 w-7" /></div><CardTitle className="text-2xl">Join a MealTrack mess</CardTitle><CardDescription>{loading ? "Checking your invitation..." : preview ? `You’ve been invited to ${preview.mess_name}.` : "We could not open this invitation."}</CardDescription></CardHeader><CardContent className="space-y-5">
    {loading ? <div className="flex justify-center py-8"><LoaderCircle className="h-6 w-6 animate-spin text-primary" /></div> : null}
    {!loading && preview?.status === "active" ? <><div className="rounded-xl border bg-muted/40 p-4 text-sm"><p className="font-semibold">{preview.target_member_name ? `Link your account to ${preview.target_member_name}` : "You’ll be added as a new member"}</p><p className="mt-1 text-muted-foreground">{preview.target_member_name ? "Your existing meal history and deposits will stay attached to this member." : "Your account name will be used for your member profile."}</p><p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> One-time link · expires {expiry}</p></div>
      {claiming ? <div className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" /> Joining mess...</div> : !session ? <div className="grid gap-3 sm:grid-cols-2"><Button onClick={() => goToAuth("signup")}><UserPlus className="h-4 w-4" />Create account</Button><Button variant="outline" onClick={() => goToAuth("login")}>Sign in</Button></div> : null}
    </> : null}
    {claimed ? <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"><CheckCircle2 className="h-5 w-5" /> You’re in! Opening your mess…</div> : null}
    {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}{session && preview?.status === "active" ? <Button variant="link" size="sm" className="ml-1 h-auto p-0 text-destructive underline" onClick={() => { setError(null); setClaimAttempted(false); }}>Try again</Button> : null}</div> : null}
    {!loading && preview && preview.status !== "active" ? <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">This invite link is {preview.status}. Ask your manager for a new one.</div> : null}
  </CardContent></Card></div></div>;
}
