import { supabase } from '@/lib/supabase';

async function getAuthHeader(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function triggerDepositPush(payload: { depositId: string }) {
  try {
    const headers = await getAuthHeader();
    if (!headers) return;
    await fetch('/api/push/deposit', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Failed to trigger deposit push:', error);
  }
}

export async function triggerSettlementPendingPush(payload: { cycleId: string }) {
  try {
    const headers = await getAuthHeader();
    if (!headers) return;
    await fetch('/api/push/settlement-pending', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Failed to trigger settlement pending push:', error);
  }
}

export async function triggerMealOffSubmitPush(payload: {
  requestId: string;
  memberName: string;
  startDate: string;
  endDate: string;
  mealPeriod: string;
}) {
  try {
    const headers = await getAuthHeader();
    if (!headers) return;
    await fetch('/api/push/meal-off/submit', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Failed to trigger meal-off submit push:', error);
  }
}

export async function triggerMealOffDecisionPush(payload: { requestId: string }) {
  try {
    const headers = await getAuthHeader();
    if (!headers) return;
    await fetch('/api/push/meal-off/decision', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Failed to trigger meal-off decision push:', error);
  }
}
