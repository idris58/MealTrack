import { CheckCircle2, ChevronLeft, ChevronRight, Receipt, Users, UtensilsCrossed, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ONBOARDING_KEY = "mealtrack:onboarding-complete";

const steps = [
  { icon: CheckCircle2, title: "Welcome to MealTrack", description: "Set up your shared meal workspace in just a few simple steps.", accent: "bg-primary/10 text-primary" },
  { icon: Users, title: "Add your members", description: "Start by adding everyone who shares meals and expenses. You can manage deposits for each person from the Members page.", accent: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  { icon: UtensilsCrossed, title: "Log meals daily", description: "Record the meal count for each member by date. Meal costs update automatically as you add expenses.", accent: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  { icon: Receipt, title: "Track shared expenses", description: "Add grocery, food, bill, and utility costs. MealTrack splits the costs and keeps every balance up to date.", accent: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { icon: WalletCards, title: "You are ready to go", description: "Use the dashboard to review balances and settle up at the end of each meal cycle.", accent: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
] as const;

export function OnboardingTour() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setOpen(window.localStorage.getItem(ONBOARDING_KEY) !== "true");
  }, []);

  const complete = () => {
    window.localStorage.setItem(ONBOARDING_KEY, "true");
    setOpen(false);
  };

  const current = steps[step];
  const Icon = current.icon;
  const isLastStep = step === steps.length - 1;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && complete()}>
      <DialogContent size="sm" className="overflow-hidden p-0 [&>button]:hidden">
        <div className="h-1.5 bg-muted">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>
        <div className="space-y-6 p-6 pt-3">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <span>Getting started</span>
            <span>{step + 1} of {steps.length}</span>
          </div>
          <DialogHeader className="items-center space-y-4 text-center sm:items-center sm:text-center">
            <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${current.accent}`}>
              <Icon className="h-8 w-8" />
            </div>
            <DialogTitle className="text-2xl font-heading">{current.title}</DialogTitle>
            <DialogDescription className="max-w-sm text-base leading-7">{current.description}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={complete}>Skip tour</Button>
            <div className="flex gap-2">
              {step > 0 && <Button variant="outline" size="icon" aria-label="Previous step" onClick={() => setStep((value) => value - 1)}><ChevronLeft className="h-4 w-4" /></Button>}
              <Button onClick={() => isLastStep ? complete() : setStep((value) => value + 1)}>
                {isLastStep ? "Start tracking" : "Next"}
                {!isLastStep && <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          {step === 1 && <Button variant="link" className="mx-auto flex" onClick={() => { complete(); setLocation("/app/members"); }}>Take me to Members</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
