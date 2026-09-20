import { isViaCustomDomain, readAgentContext } from '@/lib/agent-context';

export function getBioAgentPath(agentSlug: string, path = '') {
  const normalizedPath = path.replace(/^\/+/, '');
  const context = readAgentContext();
  // Bukan `context?.customDomain`: field itu terisi juga di alhijaz.co (ia
  // menjawab "agent ini punya domain apa"), jadi dulu link bio di alhijaz.co
  // kehilangan slug agent-nya — /jadwal, bukan /nikita/jadwal.
  const onOwnCustomDomain = Boolean(
    isViaCustomDomain(context) &&
    context?.slug?.toLowerCase() === agentSlug.toLowerCase()
  );

  if (onOwnCustomDomain) {
    return normalizedPath ? `/${normalizedPath}` : '/';
  }
  return normalizedPath ? `/${agentSlug}/${normalizedPath}` : `/${agentSlug}`;
}
