import { Nav } from '@/components/Nav';
import { JourneyClient } from '@/components/JourneyClient';
import { requirePageSession } from '@/lib/guard';
import { OWNER_ID } from '@/lib/auth';
import { getEnv } from '@/lib/runtime';
import { journeyStats } from '@/lib/journey-stats';

export default async function JourneyPage() {
  await requirePageSession();
  const stats = await journeyStats(getEnv().DB, OWNER_ID);
  return <div className="flex min-h-[100dvh] flex-col"><Nav /><JourneyClient stats={stats} /></div>;
}
