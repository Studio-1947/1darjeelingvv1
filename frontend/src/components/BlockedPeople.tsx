import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleNotch as Loader2, Prohibit } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { BlockedPerson, listBlocked, unblockUser } from '@/lib/reviews';
import { Box, Button, MenuIcon } from '@/components/ag';

/**
 * The people this account has blocked, each with an Unblock button. Renders nothing until there
 * is someone on the list, so most dashboards never show it.
 */
export default function BlockedPeople() {
  const { t } = useTranslation();
  const [people, setPeople] = useState<BlockedPerson[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    listBlocked().then(setPeople).catch(() => setPeople([]));
  }, []);

  const unblock = async (p: BlockedPerson) => {
    setBusyId(p.id);
    try {
      await unblockUser(p.id);
      setPeople((list) => list.filter((x) => x.id !== p.id));
      toast.success(t('blocked.unblocked', { name: p.name }));
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || t('report.failed'));
    } finally {
      setBusyId(null);
    }
  };

  if (people.length === 0) return null;

  return (
    <Box data-testid="blocked-people" aria-labelledby="blocked-title">
      <div className="flex items-center gap-3">
        <MenuIcon><Prohibit /></MenuIcon>
        <div className="min-w-0">
          <h2 id="blocked-title">{t('blocked.title')}</h2>
          <p className="ag-small">{t('blocked.explain')}</p>
        </div>
      </div>
      <ul className="ag-menu">
        {people.map((p) => (
          <li key={p.id}>
            <span className="flex-1 min-w-0 truncate">{p.name}</span>
            <Button size="sm" onClick={() => unblock(p)} disabled={busyId !== null} data-testid={`unblock-${p.id}`}
              icon={busyId === p.id ? <Loader2 className="animate-spin" /> : undefined}>
              {t('blocked.unblock')}
            </Button>
          </li>
        ))}
      </ul>
    </Box>
  );
}
