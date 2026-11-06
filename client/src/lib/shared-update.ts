import { supabase } from './supabase';

/** Notify active Meal Code viewers after a successful mess mutation. */
export async function broadcastSharedUpdate(shareLinkEnabled?: boolean) {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) return;

  try {
    const response = await fetch('/api/share/broadcast', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(shareLinkEnabled !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(shareLinkEnabled !== undefined ? { body: JSON.stringify({ shareLinkEnabled }) } : {}),
    });
    if (!response.ok) {
      console.error('Error broadcasting shared update:', await response.text());
    }
  } catch (error) {
    console.error('Error broadcasting shared update:', error);
  }
}
