import { Nav } from '@/components/Nav';
import { JourneyClient } from '@/components/JourneyClient';
import { requirePageSession } from '@/lib/guard';
import { getEnv } from '@/lib/runtime';
import { journeyStats } from '@/lib/journey-stats';

export default async function JourneyPage() {
  const owner = await requirePageSession();
  const stats = await journeyStats(getEnv().DB, owner);
  return <div className="flex min-h-[100dvh] flex-col"><Nav /><JourneyClient stats={stats} /></div>;
}
