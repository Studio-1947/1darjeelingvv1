import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleNotch as Loader2, Prohibit } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { BlockedPerson, listBlocked, unblockUser } from '@/lib/reviews';

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
    <div className="mt-10" data-testid="blocked-people">
      <h2 className="font-display font-extrabold text-xl md:text-2xl text-ink mb-2 flex items-center gap-2">
        <Prohibit size={18} className="text-flag" /> {t('blocked.title')}
      </h2>
      <p className="text-sm text-ink-soft mb-4">{t('blocked.explain')}</p>
      <ul className="space-y-2">
        {people.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-white px-4 py-3">
            <span className="font-bold text-ink text-sm truncate">{p.name}</span>
            <button
              type="button"
              onClick={() => unblock(p)}
              disabled={busyId !== null}
              data-testid={`unblock-${p.id}`}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[var(--line)] text-ink font-bold text-sm hover:border-pine disabled:opacity-50"
            >
              {busyId === p.id && <Loader2 size={13} className="animate-spin" />}
              {t('blocked.unblock')}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
