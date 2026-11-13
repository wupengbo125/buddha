import { Nav } from '@/components/Nav';
import { PracticeLibrary } from '@/components/PracticeLibrary';
import { requirePageSession } from '@/lib/guard';

export default async function PracticesPage() {
  await requirePageSession();
  return <div className="flex min-h-[100dvh] flex-col"><Nav /><PracticeLibrary kind="practices" /></div>;
}