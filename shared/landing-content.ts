/**
 * Landing-page FAQ content — the single source of truth shared by:
 *   - the React landing page (through the EN/BN locale dictionaries)
 *   - the server-injected FAQPage JSON-LD (server/public-meta.ts)
 *   - the prerendered public pages (script/prerender.tsx)
 *
 * Keep the two languages in sync by editing here only.
 */
export interface FaqItem {
  readonly q: string;
  readonly a: string;
}

export const LANDING_FAQS = [
  {
    q: "Is MealTrack free?",
    a: "Yes. Anyone can sign up and create a mess for free — no card, no trial countdown. Joining a mess is free too; your manager's invite link is all you need.",
  },
  {
    q: "How do I invite my housemates?",
    a: "The manager creates an invite link from inside the app and shares it however works — chat, SMS, anything. Anyone who opens it can sign up and join that mess.",
  },
  {
    q: "How does MealTrack split costs?",
    a: "Meal expenses are split by meals actually eaten (meal rate = meal costs ÷ total meals). Utility and other fixed costs are split equally, prorated to how long each member was in the mess during the cycle.",
  },
  {
    q: "What happens when the month ends?",
    a: "The manager closes the cycle. MealTrack computes every member's balance — who pays in, who gets a refund — to whole-taka precision, and archives the cycle read-only in History.",
  },
  {
    q: "Who can see my mess's data?",
    a: "Only the members of your mess. Numbers are never public. If the manager enables a shared (“Meal Code”) view, it's read-only and meant for sharing balances — and they control it.",
  },
  {
    q: "Do I need to install anything?",
    a: "No. It runs in your browser on phone and desktop. If you want it on your home screen, it's installable as a web app — and it updates itself.",
  },
] as const satisfies readonly FaqItem[];

export const LANDING_FAQS_BN = [
  {
    q: "MealTrack কি ফ্রি?",
    a: "হ্যাঁ। যে কেউ ফ্রিতে সাইন আপ করে মেস তৈরি করতে পারে — কোনো কার্ড বা ট্রায়াল কাউন্টডাউন নেই। মেসে যোগ দেওয়াও ফ্রি; আপনার ম্যানেজারের ইনভাইট লিংক-ই যথেষ্ট।",
  },
  {
    q: "কিভাবে বাড়ির সবাইকে ইনভাইট করবো?",
    a: "ম্যানেজার অ্যাপ থেকেই ইনভাইট লিংক তৈরি করে শেয়ার করবেন — চ্যাট, SMS, যা সুবিধা। যে কেউ লিংকটি খুলে সাইন আপ করে মেসে যোগ দিতে পারে।",
  },
  {
    q: "MealTrack খরচ কিভাবে ভাগ করে?",
    a: "খাবারের খরচ ভাগা হয় কত খাবার খাওয়া হয়েছে তার ওপর (খাবারের হার = খাবারের খরচ ÷ মোট খাবার)। ইউটিলিটি ও অন্যান্য ফিক্সড খরচ সমান ভাগে, মেসে সদস্য থাকার সময়ের অনুপাতে ভাগ হয়।",
  },
  {
    q: "মাস শেষ হলে কি হয়?",
    a: "ম্যানেজার সাইকেল বন্ধ করেন। MealTrack সবার ব্যালেন্স হিসাব করে — কারা কত দেবে, কারা ফেরত পাবে — পূর্ণ টাকার নির্ভুলতায়, আর সাইকেলটি History-তে পড়ে-শুধু আর্কাইভে যায়।",
  },
  {
    q: "আমার মেসের তথ্য কে দেখতে পাবে?",
    a: "শুধু আপনার মেসের সদস্যরাই। সংখ্যা কখনোই সবার জন্য নয়। ম্যানেজার চাইলে শেয়ার্ড (“Meal Code”) ভিউ চালু করতে পারেন — সেটি রিড-অনলি, আর আপনার ম্যানেজারের নিয়ন্ত্রণে থাকবে।",
  },
  {
    q: "ইনস্টল করতে হবে কি?",
    a: "না। ফোনে ও ডেস্কটপে ব্রাউজারেই চলে। হোম স্ক্রিনে নিতে চাইলে এটি ইনস্টলযোগ্য ওয়েব অ্যাপ (PWA) — নিজে থেকেই আপডেট হয়।",
  },
] as const satisfies readonly FaqItem[];

export const LANDING_FAQS_BY_LOCALE: Record<"en" | "bn", readonly FaqItem[]> = {
  en: LANDING_FAQS,
  bn: LANDING_FAQS_BN,
};

/** Produces the flat `faq.q1` / `faq.a1` … entries used by the locale dictionaries. */
export function faqDictionaryEntries(faqs: readonly FaqItem[]): Record<string, string> {
  const entries: Record<string, string> = {};
  faqs.forEach(({ q, a }, index) => {
    entries[`faq.q${index + 1}`] = q;
    entries[`faq.a${index + 1}`] = a;
  });
  return entries;
}
