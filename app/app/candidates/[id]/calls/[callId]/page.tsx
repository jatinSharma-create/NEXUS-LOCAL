import { redirect } from 'next/navigation';

export default function LegacyCallDetailRedirect({
  params,
}: {
  params: { id: string; callId: string };
}) {
  redirect(`/calls/${params.callId}`);
}
