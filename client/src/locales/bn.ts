import { LANDING_FAQS_BN, faqDictionaryEntries } from "@shared/landing-content";

const bn = {
  // Nav
  "nav.skipToContent": "সরাসরি মূল অংশে যান",
  "nav.features": "বৈশিষ্ট্য",
  "nav.howItWorks": "কিভাবে কাজ করে",
  "nav.faq": "প্রশ্নোত্তর",
  "nav.signIn": "লগইন",
  "nav.createMess": "শুরু করুন",
  "nav.productAria": "প্রোডাক্ট",
  "nav.accountAria": "অ্যাকাউন্ট",
  "nav.switchLang": "View in English",

  // Hero
  "hero.eyebrowFree": "প্রতিটি মেসের জন্য ফ্রি",
  "hero.titleA": "প্রতিটি খাবারের হিসাব।",
  "hero.titleB": "প্রতিটি টাকা মিটমাট।",
  "hero.lede":
    "MealTrack হলো মেস ও শেয়ারড বাসার শেয়ারড লেজার — খাবার ও বাজারের খরচ লগ করুন, জমা ট্র্যাক করুন, মাস শেষে সবার ব্যালেন্স হিসাব হয়ে যাবে।",
  "hero.createMessFree": "আপনার মেস তৈরি করুন — ফ্রি",
  "hero.signIn": "লগইন",
  "hero.trustFree": "তৈরি ফ্রি · কোনো ক্রেডিট কার্ড লাগে না · আপনার মেসের জন্য প্রাইভেট",
  "hero.inviteHint":
    "মেসে যোগ দিচ্ছেন? ম্যানেজার আপনাকে একটি ইনভাইট লিংক পাঠাবে — সেটি খুললেই আপনি মেম্বার।",
  "hero.replaces": "কাগজের রেজিস্টার, ক্যালকুলেটর অ্যাপ আর মাস শেষের হিসাব-মেলানো — সব এক জায়গায়।",
  "hero.illPreview": "ইলাস্ট্রেটিভ প্রিভিউ",
  "hero.frameTitle": "MealTrack — বর্তমান সাইকেল",
  "hero.altPhoto":
    "কাঠের টেবিলে চাল, ডাল, তরকারি, ছোলা আর রুটিসহ সাজানো মেসের টেবিল — উপর থেকে শট",

  // Capability strip
  "strip.offline": "অফলাইনেও চলে",
  "strip.push": "পুশ রিমাইন্ডার",
  "strip.reports": "শেয়ারযোগ্য রিপোর্ট",
  "strip.rls": "রো-লেভেল নিরাপত্তা",
  "strip.halfMeal": "আধা খাবারেরও হিসাব",

  // Command center
  "showcase.kicker": "কমান্ড সেন্টার",
  "showcase.title": "মাস শেষের আগেই ব্যালেন্স জেনে নিন।",
  "showcase.body":
    "ম্যানেজারের জন্য একটাই লাইভ চিত্র — জমা কত, খরচ কত, মাথাপিছু খাবারের হার, হাতে অবশিষ্ট, এবং সাইকেল বন্ধ হলে কে কত দেবে। ফিক্সড খরচ সবার মধ্যে সমান ভাগে (সময়ানুযায়ী), খাবারের খরচ খাবার অনুযায়ী ভাগা হয়।",
  "showcase.b1": "প্রতিবার লগ করলেই খাবারের হার আপডেট হয় — স্প্রেডশিট ফর্মুলা নয়।",
  "showcase.b2": "প্রতিটি মেম্বারের জমা ট্র্যাক হয় খাবার ও ফিক্সড খরচের সাথে।",
  "showcase.b3": "সেটেলমেন্ট হয় পূর্ণ টাকায় — হিসাব সবসময় মিলবে।",

  // How it works
  "how.kicker": "কিভাবে কাজ করে",
  "how.title": "তিনটি ধাপে মাসের হিসাব মিটে।",
  "how.step1Title": "মেস তৈরি করুন",
  "how.step1Body":
    "ফ্রিতে সাইন আপ করুন, মেসের নাম দিন, একসাথে বাসার সবাইকে যোগ করুন। আপনি হয়ে যান ম্যানেজার।",
  "how.step2Title": "খাবার ও খরচ লগ করুন",
  "how.step2Body":
    "খাবার, বাজার, বিল — মাত্র কয়েক সেকেন্ডে লগ করুন। প্রতিটি পরিবর্তনে শেয়ারড লেজার মুহূর্তেই আপডেট হয়।",
  "how.step3Title": "ঝগড়া নয়, মিটমাট",
  "how.step3Body":
    "সাইকেল বন্ধ করুন, MealTrack সবার ব্যালেন্স হিসাব করে দেয় — জমা বনাম খরচ, পূর্ণ টাকায়।",
  "how.stepBadge": "ধাপ",
  "how.invitePrefix": "যোগ দিচ্ছেন?",
  "how.inviteRest":
    "ম্যানেজার যে ইনভাইট লিংক পাঠিয়েছেন সেটি খুলুন — এক মিনিটেই মেম্বার হয়ে যান।",

  // Features
  "features.kicker": "যা যা পাচ্ছেন",
  "features.title": "পুরো মাসের হিসাবের জন্য তৈরি — শুধু ম্যাথ নয়।",
  "features.subtitle":
    "মাসের প্রথম খাবার থেকে শেষ সেটেলমেন্ট পর্যন্ত, মেসের সব কাজ এক জায়গায় — ঠিকঠাক।",
  "features.mealTitle": "খাবারের লগ রাখুন সহজভাবে",
  "features.mealBody":
    "নাস্তা, দুপুরের খাবার, রাতের খাবার — প্রতি মেম্বার, প্রতি দিন। খাবারের হার লাইভ হিসাব হয় আসল খাবার থেকে, আনুমানিক নয়।",
  "features.depositsTitle": "জমার ঝামেলা ছাড়া",
  "features.depositsBody":
    "কে কত টাকার জমা দিল, কবে দিল, কত — সব মুহূর্তে আপডেট; কারো স্মৃতিতে হিসাব হয় না।",
  "features.bazarTitle": "বাজার ও বিল, সমান ভাগে",
  "features.bazarBody":
    "বাজারের খরচ খাবারের অনুপাতে; ফিক্সড খরচ — ভাড়া, গ্যাস, ওয়াই-ফাই, বিদ্যুৎ — সমান ভাগে, সময়ানুযায়ী।",
  "features.settleTitle": "এক ট্যাপে সেটেলমেন্ট",
  "features.settleBody":
    "সাইকেল বন্ধ করুন, প্রতিটি মেম্বারের সঠিক ব্যালেন্স দেখুন — নেগেটিভ মানে দিতে হবে, পজিটিভ মানে ফেরত পাবেন।",
  "features.rolesTitle": "ম্যানেজার ও মেম্বার ভিউ",
  "features.rolesBody":
    "ম্যানেজার সাইকেল, জমা ও রিপোর্ট চালান। মেম্বার নিজের খাবার লগ করে, নিজের অবস্থান দেখেন।",
  "features.reportsTitle": "রিপোর্ট ও ইতিহাস",
  "features.reportsBody":
    "প্রতিটি বন্ধ সাইকেল পড়ে-শুধু আর্কাইভে — টোটাল, খাবারের হার, মেম্বারভিত্তিক ব্রেকডাউন। প্রুফ লাগলে PDF এক্সপোর্ট করুন।",

  // Roles
  "roles.kicker": "কার জন্য",
  "roles.title": "এক মেস, দুই আসন।",
  "roles.managerEyebrow": "ম্যানেজারের জন্য",
  "roles.managerTitle": "মেস চালান, নাটক নয়।",
  "roles.m1": "মেস তৈরি, সাইকেল সেট, মেম্বারদের আমন্ত্রণ জানান",
  "roles.m2": "জমা অনুমোদন ও শেয়ার্ড ফান্ড ট্র্যাক করুন",
  "roles.m3": "সাইকেল বন্ধ করুন, রিড-অনলি রিপোর্ট পাবলিশ করুন",
  "roles.m4": "সম্পূর্ণ ভিউ — খাবার, খরচ, ব্যালেন্স, সেটেলমেন্ট",
  "roles.managerCta": "আপনার মেস তৈরি করুন — ফ্রি",
  "roles.memberEyebrow": "মেম্বারের জন্য",
  "roles.memberTitle": "খান। লগ করুন। ব্যালেন্স দেখুন।",
  "roles.p1": "ম্যানেজারের ইনভাইট লিংক দিয়ে এক মিনিটে যোগ দিন",
  "roles.p2": "নিজের খাবার লগ করুন — নাস্তা, দুপুর, রাত",
  "roles.p3":
    "সাইকেল শেষে নিজের ব্যালেন্স, খাবারের হার, ফেরত (বা জমা) কত — ঠিক দেখে নিন",
  "roles.p4": "ম্যানেজারের দেখা সংখ্যাই আপনার সংখ্যা — প্যারালেল লেজার, কোনো সন্দেহ নেই",
  "roles.memberCta": "ইনভাইট আছে? লগইন করুন",

  // FAQ — Q&A comes from the shared source so it matches the JSON-LD exactly
  "faq.kicker": "প্রশ্নোত্তর",
  "faq.title": "সহজ প্রশ্নোত্তর।",
  ...faqDictionaryEntries(LANDING_FAQS_BN),

  // Final CTA
  "cta.title": "পরের সাইকেল নাটক ছাড়াই মিটিয়ে ফেলুন।",
  "cta.sub":
    "দুই মিনিটে মেস তৈরি করুন — ফ্রি শুরু করুন, বাসাটা আপনার, হিসাব পূর্ণ টাকায়।",
  "cta.button": "আপনার মেস তৈরি করুন — ফ্রি",
  "cta.signIn": "লগইন",
  "cta.micro": "তৈরি ফ্রি · কোনো ক্রেডিট কার্ড নেই · সেটআপের পর হাউসমেটদের আমন্ত্রণ জানান",

  // Footer
  "footer.brandLine":
    "মেস ও শেয়ারড হাউসেলের শেয়ারড খাবার, জমা ও সেটেলমেন্ট ট্র্যাকার।",
  "footer.product": "প্রোডাক্ট",
  "footer.account": "অ্যাকাউন্ট",
  "footer.features": "বৈশিষ্ট্য",
  "footer.howItWorks": "কিভাবে কাজ করে",
  "footer.faq": "প্রশ্নোত্তর",
  "footer.commandCenter": "কমান্ড সেন্টার",
  "footer.createMess": "মেস তৈরি করুন",
  "footer.signIn": "লগইন",
  "footer.joinInvite": "ইনভাইট দিয়ে যোগ দিন",

  // Auth — left column
  "auth.trustedBy": "হোস্টেল, মেস ও সহবাসীদের ভরসা",
  "auth.headlineA": "Meal management,",
  "auth.headlineB": "সহজ করে।",
  "auth.lede":
    "খাবার লগ করুন, খরচ ভাগ করুন, ব্যালেন্স মিটমাট করুন — আপনার মেসের জন্য একটাই সুরক্ষিত শেয়ারড ওয়ার্কস্পেস।",
  "auth.card1Title": "প্রতিদিনের খাবার ট্র্যাকিং",
  "auth.card1Desc":
    "নাস্তা, দুপুরের খাবার, রাতের খাবার — প্রতি মেম্বারের জন্য লগ করুন। নিজের খাবারের হার স্বয়ংক্রিয় হিসাব হয়।",
  "auth.card2Title": "ট্রান্সপারেন্ট শেয়ার্ড লেজার",
  "auth.card2Desc":
    "জমা, বাজার ও ইউটিলিটি বিলের লাইভ ট্র্যাক — সবাই একই সংখ্যা দেখেন।",
  "auth.card3Title": "ঝটপট সেটেলমেন্ট",
  "auth.card3Desc":
    "সাইকেল বন্ধ করুন, সাথে সাথে দেখুন কে কত দেবেন। চূড়ান্ত সাইকেলগুলো History-তে আর্কাইভে থাকে।",
  "auth.compactLede":
    "খাবার লগ করুন, খরচ ভাগ করুন, ব্যালেন্স মিটমাট করুন — সব এক জায়গায়।",

  // Auth — card chrome
  "auth.titleLogin": "আবার স্বাগতম",
  "auth.titleSignup": "অ্যাকাউন্ট তৈরি করুন",
  "auth.titleForgot": "পাসওয়ার্ড রিসেট করুন",
  "auth.titleReset": "নতুন পাসওয়ার্ড দিন",
  "auth.modeSignIn": "লগইন",
  "auth.modeCreate": "অ্যাকাউন্ট তৈরি",
  "auth.backToSignIn": "লগইনে ফিরে যান",
  "auth.google": "Google দিয়ে লগইন করুন",
  "auth.googleRedirecting": "রিডাইরেক্ট হচ্ছে…",
  "auth.orUseEmail": "অথবা ইমেইল দিয়ে",
  "auth.emailLabel": "ইমেইল",
  "auth.nameLabel": "নাম",
  "auth.namePlaceholder": "আপনার পুরো নাম দিন",
  "auth.passwordLabel": "পাসওয়ার্ড",
  "auth.newPasswordLabel": "নতুন পাসওয়ার্ড",
  "auth.passwordPlaceholder": "আপনার পাসওয়ার্ড দিন",
  "auth.newPasswordPlaceholder": "নতুন পাসওয়ার্ড দিন",
  "auth.confirmPasswordPlaceholder": "পাসওয়ার্ড আবার দিন",
  "auth.confirmPasswordLabel": "পাসওয়ার্ড নিশ্চিত করুন",
  "auth.forgotPassword": "পাসওয়ার্ড ভুলে গেছেন?",
  "auth.hidePassword": "পাসওয়ার্ড লুকান",
  "auth.showPassword": "পাসওয়ার্ড দেখুন",

  // Auth — hints
  "auth.hintLogin": "ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করুন।",
  "auth.hintSignup": "ইমেইল ও পাসওয়ার্ড দিয়ে অ্যাকাউন্ট তৈরি করুন।",
  "auth.hintForgot":
    "আপনার ইমেইল ঠিকানা দিন, আমরা পাসওয়ার্ড রিসেট লিংক পাঠিয়ে দেব।",
  "auth.hintReset":
    "একটি শক্তিশালী নতুন পাসওয়ার্ড বেছে নিন, পরেরবার লগইনে সেটিই ব্যবহার করবেন।",

  // Auth — submit buttons
  "auth.submitLogin": "ইমেইল দিয়ে লগইন",
  "auth.submitSignup": "অ্যাকাউন্ট তৈরি করুন",
  "auth.submitForgot": "রিসেট লিংক পাঠান",
  "auth.submitReset": "পাসওয়ার্ড আপডেট করুন",
  "auth.processing": "প্রসেস হচ্ছে…",

  // Auth — resend
  "auth.resendButton": "কনফার্মেশন ইমেইল আবার পাঠান",
  "auth.resending": "কনফার্মেশন পাঠানো হচ্ছে…",

  // Auth — messages
  "auth.msgResetSent":
    "পাসওয়ার্ড রিসেট ইমেইল পাঠানো হয়েছে। আপনার ইনবক্স চেক করুন।",
  "auth.msgPasswordUpdated":
    "পাসওয়ার্ড আপডেট হয়েছে। নতুন পাসওয়ার্ড দিয়ে লগইন করুন।",
  "auth.msgAlreadyRegistered":
    "এই ইমেইলটি আগে থেকেই রেজিস্টার্ড। লগইন করার চেষ্টা করুন।",
  "auth.msgSignupConfirmSent":
    "অ্যাকাউন্ট তৈরি হয়েছে। আপনার ইমেইলে কনফার্মেশন লিংক চেক করুন।",
  "auth.msgSignedIn": "অ্যাকাউন্ট তৈরি হয়েছে। আপনি এখন সাইন ইন আছেন।",
  "auth.msgResendSent":
    "যদি অ্যাকাউন্টের কনফার্মেশন দরকার হয়, নতুন ইমেইল পাঠানো হয়েছে।",
  "auth.recoveryMessage": "আপনার অ্যাকাউন্টের জন্য নতুন পাসওয়ার্ড দিন।",

  // Auth — validation
  "auth.vNameMissing": "নাম লিখুন।",
  "auth.vEmailInvalid": "সঠিক ইমেইল ঠিকানা দিন।",
  "auth.vPasswordShort": "পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।",
  "auth.vPasswordsMismatch": "পাসওয়ার্ড দুটি মিলছে না।",

  // Auth — password strength
  "auth.strengthLabel": "শক্তিশালীতা:",
  "auth.strengthWeak": "দুর্বল",
  "auth.strengthGood": "ভালো",
  "auth.strengthStrong": "শক্তিশালী",
  "auth.sixPlusChars": "✓ ৬+ অক্ষর",
  "auth.atLeastSix": "অন্তত ৬ অক্ষর লাগবে",

  // Auth — errors
  "auth.errEmailNotConfirmed":
    "লগইনের আগে আপনার ইমেইল কনফার্ম করুন। নিচ থেকে আবার কনফার্মেশন ইমেইল চাইতে পারেন।",
  "auth.errInvalidCredentials": "ইমেইল বা পাসওয়ার্ড সঠিক নয়।",
  "auth.errCreateFailed":
    "এই অ্যাকাউন্ট ভেরিফাই করা যায়নি। আপনার ইমেইল চেক করুন অথবা লগইন করার চেষ্টা করুন।",
  "auth.errAlreadyExists":
    "এই ইমেইলটি আগে থেকেই রেজিস্টার্ড। লগইন করার চেষ্টা করুন।",
  "auth.errWeakPassword":
    "অ্যাকাউন্টের প্রয়োজনীয়তা অনুসারে শক্তিশালী পাসওয়ার্ড দিন।",
  "auth.errSignupDisabled":
    "বর্তমানে নতুন অ্যাকাউন্ট খোলা বন্ধ। এক্সেস পেতে ম্যানেজারের সাথে কথা বলুন।",
  "auth.errRateLimit":
    "সম্প্রতি পাসওয়ার্ড রিসেট ইমেইল চাওয়ার একটা অনুরোধ এসেছে। একটু পরে আবার চেষ্টা করুন।",
  "auth.errNetwork":
    "অথেনটিকেশন সার্ভিসে পৌঁছানো যায়নি। আপনার সংযোগ চেক করে আবার চেষ্টা করুন।",
  "auth.errInvalidGrant":
    "রিসেট লিংকটি অবৈধ বা মেয়াদ শেষ। নতুন করে অনুরোধ করুন।",
  "auth.errRedirect": "এই অ্যাপ URL-টি Supabase Auth এর রিডাইরেক্ট সেটিং-এ অনুমোদিত নয়। সেখানে যোগ করুন অথবা ডেপ্লয়ড অ্যাপ থেকে আবার চেষ্টা করুন।",
  "auth.errGeneric": "কিছু সমস্যা হয়েছে। আবার চেষ্টা করুন।",
} as const;

export default bn;
