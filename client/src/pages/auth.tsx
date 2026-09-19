import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChefHat,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  Mail,
  TrendingDown,
  User,
  Utensils,
  Wallet,
} from "lucide-react";
import type { User as SupabaseUser } from "@supabase/supabase-js";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { PasswordStrengthIndicator } from "@/components/password-strength-indicator";

type AuthMode = "login" | "signup" | "forgot-password" | "reset-password";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getAuthRedirectUrl() {
  const origin = window.location.origin;
  const hostname = window.location.hostname.toLowerCase();
  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1";

  return isLocalHost ? `${origin}/` : `${origin}/auth`;
}

function mapAuthError(error: unknown, mode: AuthMode) {
  if (typeof error === "object" && error !== null) {
    const authErr = error as any;
    if (authErr.status === 400 || authErr.code === "invalid_credentials" || authErr.code === "email_not_confirmed") {
      return mode === "login"
        ? "The email or password is incorrect, or your email has not been confirmed yet."
        : "This account is not ready yet. Check your email for the confirmation link.";
    }
    if (authErr.code === "user_already_exists") {
      return "This email is already registered. Try logging in instead.";
    }
    if (authErr.code === "over_email_send_rate_limit" || authErr.status === 429) {
      return mode === "forgot-password"
        ? "A reset email was requested recently. Please wait a little and try again."
        : "Please wait a little before trying again.";
    }
    if (authErr.status === 0 || authErr.message?.toLowerCase().includes("network") || authErr.message?.toLowerCase().includes("fetch")) {
      return "We could not reach the authentication service. Please check your network connection and try again.";
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials") || normalized.includes("email not confirmed")) {
    return mode === "login"
      ? "The email or password is incorrect, or your email has not been confirmed yet."
      : "This account is not ready yet. Check your email for the confirmation link.";
  }
  if (normalized.includes("user already registered") || normalized.includes("already been registered")) {
    return "This email is already registered. Try logging in instead.";
  }
  if (normalized.includes("expired") || normalized.includes("otp") || normalized.includes("token") || normalized.includes("invalid grant")) {
    return "This link is invalid or has expired. Request a new password reset email.";
  }
  if (normalized.includes("network")) {
    return "We could not reach the authentication service. Please try again.";
  }
  if (normalized.includes("rate limit") || normalized.includes("security purposes") || normalized.includes("too many requests")) {
    return mode === "forgot-password"
      ? "A reset email was requested recently. Please wait a little and try again."
      : "Please wait a little before trying again.";
  }
  if (normalized.includes("redirect") || normalized.includes("redirect_to") || normalized.includes("not allowed") || normalized.includes("invalid redirect")) {
    return "This app URL is not allowed in Supabase Auth redirect settings. Add it there or try again from the deployed app.";
  }

  return "Authentication failed. Please try again.";
}

// ── Google logo SVG ───────────────────────────────────────────────────────────

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

// ── Feature highlight card ────────────────────────────────────────────────────

function FeatureCard({
  icon: Icon,
  iconClass,
  iconBgClass,
  title,
  description,
}: {
  icon: React.ElementType;
  iconClass: string;
  iconBgClass: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3.5 rounded-2xl border border-border/70 bg-card/75 p-4 shadow-sm backdrop-blur-sm transition-all hover:border-primary/30 hover:shadow-md dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/[0.08]">
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", iconBgClass)}>
        <Icon className={cn("h-4 w-4", iconClass)} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export default function AuthPage() {
  const { lastAuthEvent } = useAuth();
  const inviteToken = new URLSearchParams(window.location.search).get("invite");
  const requestedMode = new URLSearchParams(window.location.search).get("mode");
  const [mode, setMode] = useState<AuthMode>(requestedMode === "signup" ? "signup" : "login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const isRecoveryLink = useMemo(() => {
    const hash = window.location.hash.toLowerCase();
    const search = window.location.search.toLowerCase();
    return (
      hash.includes("type=recovery") ||
      hash.includes("access_token") ||
      search.includes("type=recovery") ||
      lastAuthEvent === "PASSWORD_RECOVERY"
    );
  }, [lastAuthEvent]);

  useEffect(() => {
    if (isRecoveryLink) {
      setMode("reset-password");
      setError(null);
      setMessage("Set a new password for your account.");
    }
  }, [isRecoveryLink]);

  useEffect(() => {
    if (!isRecoveryLink && requestedMode === "signup") setMode("signup");
  }, [isRecoveryLink, requestedMode]);

  const authRedirectUrl = inviteToken
    ? `${window.location.origin}/invite/${encodeURIComponent(inviteToken)}`
    : `${window.location.origin}/`;

  const switchMode = (next: AuthMode) => {
    if (mode === "reset-password" && next !== "reset-password") {
      window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
    }
    setMode(next);
    setError(null);
    setMessage(null);
    setFullName("");
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const validateForm = (currentMode: AuthMode) => {
    if (currentMode === "signup" && !fullName.trim()) return "Enter your name.";
    if (currentMode !== "reset-password" && !EMAIL_PATTERN.test(email.trim())) return "Enter a valid email address.";
    if (currentMode !== "forgot-password" && password.length < 6) return "Password must be at least 6 characters.";
    if ((currentMode === "signup" || currentMode === "reset-password") && password !== confirmPassword) return "Passwords do not match.";
    return null;
  };

  const handleEmailAuth = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const validationError = validateForm(mode);
      if (validationError) { setError(validationError); return; }

      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
        return;
      }
      if (mode === "forgot-password") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: getAuthRedirectUrl() });
        if (resetError) throw resetError;
        setMessage("Password reset email sent. Check your inbox for the reset link.");
        return;
      }
      if (mode === "reset-password") {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        setPassword(""); setConfirmPassword("");
        window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
        switchMode("login");
        setMessage("Password updated. You can now log in with your new password.");
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: {
          emailRedirectTo: authRedirectUrl,
          data: { full_name: fullName.trim(), name: fullName.trim() },
        },
      });
      if (signUpError) throw signUpError;
      if (
        data.user &&
        Array.isArray((data.user as SupabaseUser & { identities?: unknown[] }).identities) &&
        ((data.user as SupabaseUser & { identities?: unknown[] }).identities?.length ?? 0) === 0
      ) {
        setError("This email is already registered. Try logging in instead.");
        return;
      }
      if (!data.session) {
        setEmail(""); setPassword(""); setFullName(""); setConfirmPassword("");
        setMessage("Account created. Check your email to confirm your account.");
      } else {
        setMessage("Account created. You are now signed in.");
      }
    } catch (caughtError) {
      if (mode === "forgot-password") console.error("Password reset email error:", caughtError);
      setError(mapAuthError(caughtError, mode));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    setError(null);
    setMessage(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: authRedirectUrl },
    });
    if (oauthError) { setGoogleLoading(false); setError(mapAuthError(oauthError, "login")); return; }
    setTimeout(() => setGoogleLoading(false), 10_000);
  };

  const title =
    mode === "login" ? "Welcome back"
      : mode === "signup" ? "Create your account"
        : mode === "forgot-password" ? "Reset your password"
          : "Choose a new password";

  const submitLabel =
    mode === "login" ? "Sign in with Email"
      : mode === "signup" ? "Create Account"
        : mode === "forgot-password" ? "Send Reset Link"
          : "Update Password";

  const EyeToggle = ({ show, onToggle }: { show: boolean; onToggle: () => void }) => (
    <button
      type="button"
      className="text-muted-foreground/60 transition-colors hover:text-foreground"
      onClick={onToggle}
      aria-label={show ? "Hide password" : "Show password"}
    >
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground selection:bg-primary/20">
      {/* ── Theme Toggle in top-right corner ── */}
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      {/* ── Ambient background glows ── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full bg-primary/10 blur-[130px] dark:bg-primary/[0.13]" />
        <div className="absolute -bottom-40 -right-20 h-[500px] w-[500px] rounded-full bg-emerald-500/10 blur-[110px] dark:bg-emerald-500/[0.09]" />
        <div className="absolute bottom-10 left-1/3 h-[300px] w-[400px] rounded-full bg-sky-500/5 blur-[90px] dark:bg-violet-500/[0.07]" />
        {/* Subtle dot mesh */}
        <div
          className="absolute inset-0 opacity-[0.035] dark:opacity-[0.03]"
          style={{ backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)", backgroundSize: "28px 28px" }}
        />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-12 px-4 py-12 lg:flex-row lg:items-center lg:gap-16 lg:px-8">

        {/* ── Left: Hero section ── */}
        <section className="max-w-lg space-y-8">
          {/* Trust badge */}
          <div className="inline-flex items-center gap-2.5 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1.5 text-xs font-semibold text-primary backdrop-blur-sm">
            <ChefHat className="h-3.5 w-3.5 text-primary" />
            Trusted by hostels, messes &amp; flatmates
          </div>

          {/* Headline */}
          <div className="space-y-4">
            <h1 className="font-heading text-4xl font-bold leading-[1.15] tracking-tight text-foreground md:text-5xl">
              Meal management,{" "}
              <span className="bg-gradient-to-r from-primary via-emerald-500 to-teal-500 bg-clip-text text-transparent">
                made simple.
              </span>
            </h1>
            <p className="max-w-md text-base leading-7 text-muted-foreground">
              Track meals, split expenses, and settle balances — all in one
              secure shared workspace built for your mess.
            </p>
          </div>

          {/* Feature highlights */}
          <div className="space-y-3">
            <FeatureCard
              icon={Utensils}
              iconClass="text-emerald-600 dark:text-emerald-400"
              iconBgClass="bg-emerald-500/10 dark:bg-emerald-500/15"
              title="Daily Meal Tracking"
              description="Log breakfast, lunch & dinner per member. Auto-calculates your individual meal rate."
            />
            <FeatureCard
              icon={Wallet}
              iconClass="text-sky-600 dark:text-sky-400"
              iconBgClass="bg-sky-500/10 dark:bg-sky-500/15"
              title="Transparent Shared Ledger"
              description="Track deposits, grocery bills, and fixed costs in real time — everyone sees the same numbers."
            />
            <FeatureCard
              icon={TrendingDown}
              iconClass="text-violet-600 dark:text-violet-400"
              iconBgClass="bg-violet-500/10 dark:bg-violet-500/15"
              title="Zero-Friction Settlement"
              description="Close a cycle and instantly see who owes what. Archive finalized cycles in History."
            />
          </div>
        </section>

        {/* ── Right: Auth card ── */}
        <Card className="w-full max-w-md shrink-0 border-border/80 bg-card/85 shadow-xl shadow-primary/5 backdrop-blur-xl transition-shadow hover:shadow-2xl hover:shadow-primary/10 dark:border-white/10 dark:bg-card/50 dark:shadow-black/50">
          <CardHeader className="space-y-5 pb-2">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
                <ChefHat className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">MealTrack</p>
                <CardTitle className="mt-0.5 text-xl font-bold font-heading text-foreground">{title}</CardTitle>
              </div>
            </div>

            {/* Mode switcher */}
            {mode === "login" || mode === "signup" ? (
              <div className="grid grid-cols-2 rounded-xl bg-muted/70 p-1 border border-border/40">
                {(["login", "signup"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    className={cn(
                      "rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                      mode === m
                        ? "bg-card text-foreground font-semibold shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {m === "login" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                className="inline-flex items-center gap-2 self-start text-sm font-medium text-muted-foreground transition hover:text-foreground"
                onClick={() => switchMode("login")}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </button>
            )}
          </CardHeader>

          <CardContent className="space-y-5 pt-2">
            <form className="space-y-4" onSubmit={handleEmailAuth}>

              {/* Email */}
              {mode !== "reset-password" && (
                <div className="space-y-1.5">
                  <Label htmlFor="auth-email">Email</Label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Mail className="h-4 w-4 text-muted-foreground/70" />
                    </div>
                    <Input
                      id="auth-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="pl-9 bg-background/60"
                      autoFocus={mode === "login" || mode === "forgot-password"}
                    />
                  </div>
                </div>
              )}

              {/* Full name (signup only) */}
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="auth-full-name">Name</Label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <User className="h-4 w-4 text-muted-foreground/70" />
                    </div>
                    <Input
                      id="auth-full-name"
                      type="text"
                      placeholder="Enter your full name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      autoComplete="name"
                      className="pl-9 bg-background/60"
                    />
                  </div>
                </div>
              )}

              {/* Password */}
              {mode !== "forgot-password" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auth-password">
                      {mode === "reset-password" ? "New Password" : "Password"}
                    </Label>
                    {mode === "login" && (
                      <button
                        type="button"
                        className="text-xs font-semibold text-primary transition-colors hover:text-primary/80"
                        onClick={() => switchMode("forgot-password")}
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Lock className="h-4 w-4 text-muted-foreground/70" />
                    </div>
                    <Input
                      id="auth-password"
                      type={showPassword ? "text" : "password"}
                      placeholder={mode === "reset-password" ? "Enter a new password" : "Enter your password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="pl-9 pr-10 bg-background/60"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                      <EyeToggle
                        show={showPassword}
                        onToggle={() => {
                          const next = !showPassword;
                          setShowPassword(next);
                          if (mode === "signup" || mode === "reset-password") setShowConfirmPassword(next);
                        }}
                      />
                    </div>
                  </div>
                  {(mode === "signup" || mode === "reset-password") && (
                    <PasswordStrengthIndicator password={password} />
                  )}
                </div>
              )}

              {/* Confirm password */}
              {(mode === "signup" || mode === "reset-password") && (
                <div className="space-y-1.5">
                  <Label htmlFor="auth-confirm-password">Confirm Password</Label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                      <Lock className="h-4 w-4 text-muted-foreground/70" />
                    </div>
                    <Input
                      id="auth-confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Re-enter your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className="pl-9 pr-10 bg-background/60"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                      <EyeToggle show={showConfirmPassword} onToggle={() => setShowConfirmPassword((v) => !v)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Contextual hint */}
              <p className="text-xs leading-5 text-muted-foreground">
                {mode === "login" && "Sign in with your email and password, or continue with Google below."}
                {mode === "signup" && "Create your account with email and password. Google sign-in is also available."}
                {mode === "forgot-password" && "Enter your email address and we'll send you a password reset link."}
                {mode === "reset-password" && "Choose a strong new password, then use it the next time you sign in."}
              </p>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-3 text-sm text-red-700 dark:text-red-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Success */}
              {message && (
                <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3.5 py-3 text-sm text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{message}</span>
                </div>
              )}

              {/* Submit */}
              <Button className="w-full gap-2 font-semibold shadow-md shadow-primary/20 hover:shadow-lg transition-all" type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Processing…
                  </>
                ) : submitLabel}
              </Button>
            </form>

            {/* Google OAuth */}
            {(mode === "login" || mode === "signup") && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-card px-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">or continue with</span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-3 border-border bg-background/60 hover:bg-muted/60 text-foreground transition-colors"
                  onClick={handleGoogleAuth}
                  disabled={googleLoading}
                >
                  {googleLoading ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Redirecting…
                    </>
                  ) : (
                    <>
                      <GoogleLogo className="h-4 w-4" />
                      Google
                    </>
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
