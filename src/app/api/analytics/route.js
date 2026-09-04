import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth';
import { getAllTransactions, getLongTermSavings, getMetals, getSavingsPlan } from '@/lib/db';
import { getTodayBeirut } from '@/lib/date';
import { buildStatistics, isValidMonth } from '@/lib/statistics';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = getTodayBeirut();
  const params = new URL(request.url).searchParams;
  const month = params.get('month') || undefined;
  const scope = params.get('scope') || 'all';
  if ((month && (!isValidMonth(month) || month > today.slice(0, 7))) || !['all', 'personal', 'business'].includes(scope)) {
    return NextResponse.json({ error: 'Choose a valid month and scope' }, { status: 400 });
  }

  try {
    const [transactions, savings, metals, plan] = await Promise.all([
      getAllTransactions(), getLongTermSavings(), getMetals(), getSavingsPlan(),
    ]);
    const statistics = buildStatistics({ transactions, savings, metals, planItems: plan.items, month, scope, today });
    return NextResponse.json(statistics, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('Error fetching dashboard:', error);
    return NextResponse.json({ error: 'Unable to load the dashboard' }, { status: 500 });
  }
}
