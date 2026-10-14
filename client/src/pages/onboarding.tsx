import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, ChefHat, CircleHelp, Link2, LoaderCircle, LogOut, ShieldCheck, Sparkles, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";

export default function OnboardingPage() {
  const [, setLocation] = useLocation();
  const { user, profile, signOut } = useAuth();
  const [messName, setMessName] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMess = async () => {
    if (isCreating) return;
    const name = messName.trim();
    if (!name) { setError("Enter a name for your mess."); return; }
    setIsCreating(true);
    setError(null);
    try {
      const { error: createError } = await supabase.rpc("create_mess", { mess_name: name });
      if (createError) throw createError;
      window.location.assign("/app");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "We couldn’t finish setting up your mess. Please try again.");
      setIsCreating(false);
    }
  };

  const openInvite = () => {
    const value = inviteLink.trim();
    if (!value) { setError("Paste the invite link your manager sent you."); return; }
    try {
      const url = new URL(value, window.location.origin);
      const token = url.pathname.match(/^\/invite\/([^/]+)\/?$/)?.[1];
      const directToken = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
      if (url.origin !== window.location.origin && !directToken) throw new Error("That doesn’t look like a MealTrack invite link.");
      if (!token && !directToken) throw new Error("That doesn’t look like a MealTrack invite link. Paste the full link from your manager.");
      setError(null);
      setLocation(`/invite/${encodeURIComponent(token ?? directToken!)}`);
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Check the invite link and try again.");
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setError(null);
    try {
      await signOut();
      setLocation("/auth");
    } catch {
      setError("We couldn’t sign you out. Please try again.");
      setIsSigningOut(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)/0.13),transparent_42rem)] px-4 py-6 sm:px-6 sm:py-10">
      <div aria-hidden="true" className="pointer-events-none absolute -left-28 top-64 h-72 w-72 rounded-full bg-primary/[0.04] blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-16 h-80 w-80 rounded-full bg-emerald-400/[0.05] blur-3xl" />

      <div className="relative mx-auto max-w-5xl">
        <nav className="mb-10 flex items-center justify-between sm:mb-14">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20"><ChefHat className="h-5 w-5" /></span>
            <span className="font-heading text-lg font-bold tracking-tight">MealTrack</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden max-w-48 truncate text-sm text-muted-foreground sm:inline">{profile?.full_name ?? user?.email}</span>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => void handleSignOut()} disabled={isSigningOut}>
              {isSigningOut ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              <span>{isSigningOut ? "Signing out…" : "Sign out"}</span>
            </Button>
          </div>
        </nav>

        <header className="mx-auto mb-9 max-w-2xl text-center sm:mb-11">
          <div className="mx-auto mb-4 inline-flex items-center gap-1.5 rounded-full border bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary" /> One quick step to get started
          </div>
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Welcome to MealTrack</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            Create a shared mess, or join your household using an invitation from its manager.
          </p>
        </header>

        <div className="grid items-stretch gap-4 md:grid-cols-2 md:gap-6">
          <Card className="relative flex flex-col overflow-hidden border-primary/25 shadow-lg shadow-primary/[0.06]">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-emerald-400 to-primary/30" />
            <CardHeader className="pb-4 pt-6 sm:px-6 sm:pt-7">
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><ChefHat className="h-5 w-5" /></div>
              <CardTitle className="text-xl">Create a mess</CardTitle>
              <CardDescription className="leading-relaxed">Start a shared home for meals, expenses, and member balances. You’ll be the manager.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4 sm:px-6">
              <div className="space-y-2">
                <Label htmlFor="mess-name">What should your mess be called?</Label>
                <Input id="mess-name" placeholder="e.g. Green House Mess" value={messName} onChange={(event) => setMessName(event.target.value)} disabled={isCreating} onKeyDown={(event) => { if (event.key === "Enter") void createMess(); }} />
              </div>
              <div className="mt-auto pt-1">
                <Button className="w-full gap-2" disabled={isCreating} onClick={() => void createMess()}>
                  {isCreating ? <><LoaderCircle className="h-4 w-4 animate-spin" />Creating your mess…</> : <>Create a mess<ArrowRight className="h-4 w-4" /></>}
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">You can invite your household after setup.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-col bg-card/85 shadow-sm backdrop-blur-sm">
            <CardHeader className="pb-4 pt-6 sm:px-6 sm:pt-7">
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-foreground"><UsersRound className="h-5 w-5" /></div>
              <CardTitle className="text-xl">Join a mess</CardTitle>
              <CardDescription className="leading-relaxed">Joining is private and invite-only. Your manager can send you a secure link.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4 sm:px-6">
              <div className="space-y-2">
                <Label htmlFor="invite-link">Paste your invite link</Label>
                <div className="flex gap-2">
                  <Input id="invite-link" placeholder="https://…/invite/…" value={inviteLink} onChange={(event) => setInviteLink(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") openInvite(); }} />
                  <Button variant="secondary" className="shrink-0 gap-2" onClick={openInvite}><Link2 className="h-4 w-4" /><span className="hidden sm:inline">Continue</span><ArrowRight className="h-4 w-4 sm:hidden" /></Button>
                </div>
              </div>
              <div className="mt-auto rounded-xl border bg-muted/30 p-3.5">
                <div className="flex gap-2.5">
                  <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="text-sm">
                    <p className="font-medium">Don’t have an invite yet?</p>
                    <p className="mt-0.5 leading-relaxed text-muted-foreground">Ask your manager to create one for you. You can sign out and come back when it arrives.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {error ? <p role="alert" className="mx-auto mt-5 max-w-2xl rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}

        <footer className="mx-auto mt-8 flex max-w-2xl items-center justify-center gap-2 text-center text-xs leading-relaxed text-muted-foreground sm:mt-10">
          <ShieldCheck className="h-4 w-4 shrink-0" /> Your data stays private to the mess you create or join.
        </footer>
      </div>
    </main>
  );
}
