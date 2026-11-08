import { CounterDetail } from '@/components/CounterDetail';

export default function CounterPage({ params }: { params: { id: string } }) {
  return <CounterDetail id={params.id} />;
}
