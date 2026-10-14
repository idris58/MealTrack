import { useState } from 'react';
import { Download, Share, Plus, MonitorSmartphone, CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePwaInstall } from '@/lib/pwa';

type PwaInstallButtonProps = {
  appId: 'main' | 'shared';
  appName: string;
  className?: string;
  size?: 'default' | 'sm';
};

// ── iOS step-by-step install guide ────────────────────────────────────────────
function IosInstallDialog({
  open,
  onClose,
  appName,
}: {
  open: boolean;
  onClose: () => void;
  appName: string;
}) {
  const steps = [
    {
      icon: Share,
      label: 'Tap the Share button',
      sub: "It's the box with an arrow at the bottom of Safari",
    },
    {
      icon: Plus,
      label: 'Tap "Add to Home Screen"',
      sub: 'Scroll down the share sheet to find this option',
    },
    {
      icon: MonitorSmartphone,
      label: 'Tap "Add" to confirm',
      sub: `${appName} will appear on your home screen like a native app`,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm gap-0 overflow-hidden p-0">
        {/* Header with gradient */}
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-600 px-6 pb-5 pt-6 text-white">
          {/* Ambient glow orbs */}
          <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-4 left-4 h-20 w-20 rounded-full bg-emerald-300/20 blur-xl" />
          <DialogHeader className="relative gap-2">
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 shadow-inner backdrop-blur-sm">
              <MonitorSmartphone className="h-5 w-5 text-white" />
            </div>
            <DialogTitle className="text-left font-heading text-lg font-bold text-white">
              Install {appName}
            </DialogTitle>
            <p className="text-left text-sm leading-relaxed text-emerald-100">
              Add to your home screen for the best experience — works offline and launches instantly.
            </p>
          </DialogHeader>
        </div>

        {/* Steps */}
        <div className="space-y-px bg-border/30 px-0">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={i}
                className="flex items-start gap-4 bg-card px-5 py-4 first:mt-px"
              >
                {/* Step number + icon */}
                <div className="relative mt-0.5 shrink-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground shadow">
                    {i + 1}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{step.label}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.sub}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-muted/70 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Got it
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function PwaInstallButton({
  appId,
  appName,
  className,
  size = 'sm',
}: PwaInstallButtonProps) {
  const { canInstall, isInstalled, isIos, promptInstall } = usePwaInstall(appId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  if (isInstalled || (!canInstall && !isIos)) {
    return null;
  }

  const handleInstall = async () => {
    if (canInstall) {
      const result = await promptInstall();
      if (result.outcome === 'accepted') {
        setJustInstalled(true);
      }
      return;
    }
    if (isIos) {
      setDialogOpen(true);
    }
  };

  return (
    <>
      {/* Premium install button */}
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={handleInstall}
        className={[
          // Base shape & layout
          'group relative inline-flex items-center gap-1.5 overflow-hidden',
          'rounded-full border font-medium',
          // Subtle emerald accent: border + bg
          'border-emerald-500/30 bg-emerald-500/8',
          // Text
          'text-emerald-700 dark:text-emerald-400',
          // Hover lift
          'transition-all duration-200',
          'hover:border-emerald-500/50 hover:bg-emerald-500/12 hover:shadow-md hover:shadow-emerald-500/15',
          'hover:-translate-y-px active:translate-y-0',
          // Focus ring
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40',
          className ?? '',
        ].join(' ')}
      >
        {/* Shimmer sweep on hover */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -translate-x-full rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-500 group-hover:translate-x-full"
        />

        {/* Icon */}
        {justInstalled ? (
          <CheckCircle2 className="relative h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Download className="relative h-3.5 w-3.5 transition-transform duration-200 group-hover:-translate-y-px" />
        )}

        {/* Label */}
        <span className="relative">
          {justInstalled ? 'Installing…' : 'Install App'}
        </span>
      </Button>

      {/* iOS install guide dialog */}
      <IosInstallDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        appName={appName}
      />
    </>
  );
}
