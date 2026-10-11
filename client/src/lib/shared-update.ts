import { supabase } from './supabase';

/** Notify active Meal Code viewers after a successful mess mutation. */
export async function broadcastSharedUpdate() {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) return;

  try {
    const response = await fetch('/api/share/broadcast', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      console.error('Error broadcasting shared update:', await response.text());
    }
  } catch (error) {
    console.error('Error broadcasting shared update:', error);
  }
}
