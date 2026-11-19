import { LANDING_FAQS, faqDictionaryEntries } from "@shared/landing-content";

const en = {
  // Nav
  "nav.skipToContent": "Skip to content",
  "nav.features": "Features",
  "nav.howItWorks": "How it works",
  "nav.faq": "FAQ",
  "nav.signIn": "Sign in",
  "nav.createMess": "Get started",
  "nav.productAria": "Product",
  "nav.accountAria": "Account",
  "nav.switchLang": "বাংলায় দেখুন",

  // Hero
  "hero.eyebrowFree": "Free for every mess",
  "hero.titleA": "Every meal counted.",
  "hero.titleB": "Every taka settled.",
  "hero.lede":
    "MealTrack is the shared ledger for messes and shared households — log meals and bazar costs, track deposits, and close the month with every balance already computed.",
  "hero.createMessFree": "Create your mess — it's free",
  "hero.signIn": "Sign in",
  "hero.trustFree": "Free to create · No credit card · Private to your mess",
  "hero.inviteHint":
    "Joining a mess? Your manager sends an invite link — open it and you're in.",
  "hero.replaces": "Replaces paper registers, calculator apps and end-of-month math.",
  "hero.illPreview": "Illustrative preview",
  "hero.frameTitle": "MealTrack — current cycle",
  "hero.altPhoto":
    "Overhead shot of a shared Bangladeshi meal spread on a wooden table — rice, dals, curries, chickpeas, flatbreads",

  // Capability strip
  "strip.offline": "Works offline",
  "strip.push": "Push reminders",
  "strip.reports": "Shareable reports",
  "strip.rls": "Row-level security",
  "strip.halfMeal": "½-meal precision",

  // Command center
  "showcase.kicker": "The command center",
  "showcase.title": "Know the balance before the month ends.",
  "showcase.body":
    "One live picture for the manager — deposits in, costs out, meal rate per mouth, remaining cash, and exactly who owes what when the cycle closes. Fixed costs are shared equally (time-prorated); meal costs follow the meals actually eaten.",
  "showcase.b1": "Meal rate updates as you log — no spreadsheet formulas, ever.",
  "showcase.b2": "Deposits tracked per member against meals and fixed costs.",
  "showcase.b3": "Settlements rounded to whole taka — totals always add up exactly.",

  // How it works
  "how.kicker": "How it works",
  "how.title": "Three steps to a settled month.",
  "how.step1Title": "Create your mess",
  "how.step1Body":
    "Sign up free, name your mess, and add the people you live with. You become the manager.",
  "how.step2Title": "Log as you live",
  "how.step2Body":
    "Mark meals, grocery runs and shared bills in seconds. Every change updates the shared ledger instantly.",
  "how.step3Title": "Settle, don't argue",
  "how.step3Body":
    "Close the cycle and MealTrack computes each member's balance — deposited vs. consumed, to the whole taka.",
  "how.stepBadge": "Step",
  "how.invitePrefix": "Joining instead?",
  "how.inviteRest":
    "Open the invite link your manager sent you — you'll be a member of their mess in about a minute.",

  // Features
  "features.kicker": "What you get",
  "features.title": "Built for the whole cycle — not just the math.",
  "features.subtitle":
    "From the first meal of the month to the final settlement, everything a mess runs on lives in one place.",
  "features.mealTitle": "Meal logging that sticks",
  "features.mealBody":
    "Breakfast, lunch, dinner — per member, per day. Meal rate recalculates live from real meals, not estimates.",
  "features.depositsTitle": "Deposits without the chase",
  "features.depositsBody":
    "Record who topped up, when and how much. Balances update instantly — nothing is settled from memory.",
  "features.bazarTitle": "Bazar & bills, shared fairly",
  "features.bazarBody":
    "Grocery runs split by meal consumption; utility costs — rent share, gas, Wi-Fi, electricity — split equally, time-prorated.",
  "features.settleTitle": "Settlements in one tap",
  "features.settleBody":
    "Close the cycle and get exact per-member balances — negative means pays in, positive means gets back.",
  "features.rolesTitle": "Manager & member views",
  "features.rolesBody":
    "Managers run cycles, deposits and reports. Members mark their own meals and see exactly where they stand.",
  "features.reportsTitle": "Reports & history",
  "features.reportsBody":
    "Every closed cycle archived read-only — totals, meal rate, per-member breakdown. Export a PDF report when you need proof.",

  // Roles
  "roles.kicker": "Who it's for",
  "roles.title": "One mess, two seats.",
  "roles.managerEyebrow": "For the manager",
  "roles.managerTitle": "Run the mess. Not the drama.",
  "roles.m1": "Create the mess, set the cycle, invite members",
  "roles.m2": "Approve deposits and track the shared fund",
  "roles.m3": "Close cycles and publish read-only reports",
  "roles.m4": "Full visibility — meals, costs, balances, settlement",
  "roles.managerCta": "Create your mess — it's free",
  "roles.memberEyebrow": "For the member",
  "roles.memberTitle": "Eat. Log. See your balance. Done.",
  "roles.p1": "Join in a minute with your manager's invite link",
  "roles.p2": "Mark your own meals — breakfast, lunch, dinner",
  "roles.p3":
    "See your balance, meal rate and what you'll get back (or pay in) at cycle close",
  "roles.p4": "Same numbers the manager sees — no parallel ledgers, no doubt",
  "roles.memberCta": "Have an invite? Sign in",

  // FAQ — Q&A comes from the shared source so it matches the JSON-LD exactly
  "faq.kicker": "FAQ",
  "faq.title": "Fair questions, straight answers.",
  ...faqDictionaryEntries(LANDING_FAQS),

  // Final CTA
  "cta.title": "Close your next cycle without the drama.",
  "cta.sub":
    "Create your mess in two minutes — free to start, private to your household, settled down to the last taka.",
  "cta.button": "Create your mess — it's free",
  "cta.signIn": "Sign in",
  "cta.micro": "Free to create · No credit card · Invite your housemates after setup",

  // Footer
  "footer.brandLine":
    "The shared meal, deposit and settlement tracker for messes and shared households.",
  "footer.product": "Product",
  "footer.account": "Account",
  "footer.features": "Features",
  "footer.howItWorks": "How it works",
  "footer.faq": "FAQ",
  "footer.commandCenter": "The command center",
  "footer.createMess": "Create your mess",
  "footer.signIn": "Sign in",
  "footer.joinInvite": "Join with an invite",

  // Auth — left column
  "auth.trustedBy": "Trusted by hostels, messes & flatmates",
  "auth.headlineA": "Meal management,",
  "auth.headlineB": "made simple.",
  "auth.lede":
    "Track meals, split expenses, and settle balances — all in one secure shared workspace built for your mess.",
  "auth.card1Title": "Daily Meal Tracking",
  "auth.card1Desc":
    "Log breakfast, lunch & dinner per member. Auto-calculates your individual meal rate.",
  "auth.card2Title": "Transparent Shared Ledger",
  "auth.card2Desc":
    "Track deposits, grocery and utility bills in real time — everyone sees the same numbers.",
  "auth.card3Title": "Zero-Friction Settlement",
  "auth.card3Desc":
    "Close a cycle and instantly see who owes what. Archive finalized cycles in History.",
  "auth.compactLede":
    "Track meals, split expenses, and settle balances — all in one shared workspace.",

  // Auth — card chrome
  "auth.titleLogin": "Welcome back",
  "auth.titleSignup": "Create your account",
  "auth.titleForgot": "Reset your password",
  "auth.titleReset": "Choose a new password",
  "auth.modeSignIn": "Sign in",
  "auth.modeCreate": "Create account",
  "auth.backToSignIn": "Back to sign in",
  "auth.google": "Continue with Google",
  "auth.googleRedirecting": "Redirecting…",
  "auth.orUseEmail": "or use email",
  "auth.emailLabel": "Email",
  "auth.nameLabel": "Name",
  "auth.namePlaceholder": "Enter your full name",
  "auth.passwordLabel": "Password",
  "auth.newPasswordLabel": "New Password",
  "auth.passwordPlaceholder": "Enter your password",
  "auth.newPasswordPlaceholder": "Enter a new password",
  "auth.confirmPasswordPlaceholder": "Re-enter your password",
  "auth.confirmPasswordLabel": "Confirm Password",
  "auth.forgotPassword": "Forgot password?",
  "auth.hidePassword": "Hide password",
  "auth.showPassword": "Show password",

  // Auth — hints
  "auth.hintLogin": "Sign in with your email and password.",
  "auth.hintSignup": "Create your account with email and password.",
  "auth.hintForgot":
    "Enter your email address and we'll send you a password reset link.",
  "auth.hintReset":
    "Choose a strong new password, then use it the next time you sign in.",

  // Auth — submit buttons
  "auth.submitLogin": "Sign in with Email",
  "auth.submitSignup": "Create Account",
  "auth.submitForgot": "Send Reset Link",
  "auth.submitReset": "Update Password",
  "auth.processing": "Processing…",

  // Auth — resend
  "auth.resendButton": "Resend confirmation email",
  "auth.resending": "Sending confirmation…",

  // Auth — messages
  "auth.msgResetSent":
    "Password reset email sent. Check your inbox for the reset link.",
  "auth.msgPasswordUpdated":
    "Password updated. You can now log in with your new password.",
  "auth.msgAlreadyRegistered":
    "This email is already registered. Try logging in instead.",
  "auth.msgSignupConfirmSent":
    "Account created. Check your email to confirm your account.",
  "auth.msgSignedIn": "Account created. You are now signed in.",
  "auth.msgResendSent":
    "If this account needs confirmation, a new email has been sent.",
  "auth.recoveryMessage": "Set a new password for your account.",

  // Auth — validation
  "auth.vNameMissing": "Enter your name.",
  "auth.vEmailInvalid": "Enter a valid email address.",
  "auth.vPasswordShort": "Password must be at least 6 characters.",
  "auth.vPasswordsMismatch": "Passwords do not match.",

  // Auth — password strength
  "auth.strengthLabel": "Strength:",
  "auth.strengthWeak": "Weak",
  "auth.strengthGood": "Good",
  "auth.strengthStrong": "Strong",
  "auth.sixPlusChars": "✓ 6+ characters",
  "auth.atLeastSix": "At least 6 characters",

  // Auth — errors
  "auth.errEmailNotConfirmed":
    "Please confirm your email before signing in. You can request another confirmation email below.",
  "auth.errInvalidCredentials": "The email or password is incorrect.",
  "auth.errCreateFailed": "This account could not be verified. Check your email or try signing in.",
  "auth.errAlreadyExists": "This email is already registered. Try logging in instead.",
  "auth.errWeakPassword":
    "Choose a stronger password that meets the account password requirements.",
  "auth.errSignupDisabled":
    "New account registration is currently disabled. Contact the manager for access.",
  "auth.errRateLimit":
    "A reset email was requested recently. Please wait a little and try again.",
  "auth.errNetwork": "We could not reach the authentication service. Check your connection and try again.",
  "auth.errInvalidGrant":
    "The reset link is invalid or has expired. Request a new one.",
  "auth.errRedirect": "This app URL is not allowed in Supabase Auth redirect settings. Add it there or try again from the deployed app.",
  "auth.errGeneric": "Something went wrong. Please try again.",
} as const;

export default en;
