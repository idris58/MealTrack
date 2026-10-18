import { toast } from 'sonner';

/** Run a user-triggered mutation and surface failures without leaking rejections. */
export async function runMutation(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (error) {
    const message = error instanceof Error && error.message.trim()
      ? error.message
      : 'Something went wrong. Please try again.';
    toast.error(message);
    return false;
  }
}
