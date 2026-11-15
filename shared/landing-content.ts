/**
 * Landing-page FAQ content — shared between the React page
 * (client/src/pages/landing.tsx) and the server-injected
 * structured data (server/public-meta.ts, FAQPage JSON-LD).
 * Keep the two consumers in sync by editing here only.
 */
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
] as const;
