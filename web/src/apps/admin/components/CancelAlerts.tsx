import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Volume2, VolumeX } from 'lucide-react';
import { adminOrdersApi } from '../api/endpoints';
import { useToast } from '../../shared/context/ToastContext';
import type { AdminOrderListItem } from '../types';

const SOUND_KEY = 'vk-cancel-alarm';

/**
 * A short two-tone chime, synthesised rather than shipped as an audio file so
 * there is no asset to load or cache. Repeats while a cancellation is
 * unconfirmed — this is the part that actually makes noise at the counter,
 * because a push notification cannot override a silenced phone.
 */
function useAlarm(active: boolean, enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!active || !enabled) return;

    const beep = () => {
      try {
        const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
        if (!Ctx) return;
        const ctx = ctxRef.current ?? (ctxRef.current = new Ctx());
        // A tab that was backgrounded suspends its context; resume before use.
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        [0, 0.28].forEach((offset, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = i === 0 ? 880 : 660;
          gain.gain.setValueAtTime(0.0001, ctx.currentTime + offset);
          gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + offset + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + offset + 0.22);
          osc.connect(gain).connect(ctx.destination);
          osc.start(ctx.currentTime + offset);
          osc.stop(ctx.currentTime + offset + 0.24);
        });
      } catch {
        /* audio is a convenience — never break the board over it */
      }
    };

    beep();
    const t = setInterval(beep, 8000);
    return () => clearInterval(t);
  }, [active, enabled]);
}

/**
 * Cancellations still waiting for someone to tell the kitchen (migration_008).
 *
 * The push alert is best-effort — phones are in bags, notifications get
 * swiped away, a rider may not have registered a device at all. The kitchen is
 * actually informed by a person walking over, so a cancelled order stays here,
 * at the top of the board, until a rep confirms they did that. Confirming
 * records who and when, so the question is answerable afterwards.
 */
export function CancelAlerts({
  orders,
  onAcked,
}: {
  orders: AdminOrderListItem[];
  onAcked: () => void;
}) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<number | null>(null);
  // Browsers block audio until the page has been interacted with, so the sound
  // is an explicit opt-in the counter device turns on once and keeps.
  const [soundOn, setSoundOn] = useState(() => {
    try { return localStorage.getItem(SOUND_KEY) === '1'; } catch { return false; }
  });

  const pending = orders.filter((o) => o.status === 'cancelled' && !o.cancel_acked_at);
  useAlarm(pending.length > 0, soundOn);

  const toggleSound = () => {
    setSoundOn((on) => {
      const next = !on;
      try { localStorage.setItem(SOUND_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  if (pending.length === 0) return null;

  const ack = async (id: number) => {
    setBusyId(id);
    try {
      await adminOrdersApi.ackCancel(id);
      toast.info(`Order #${id} — kitchen confirmed.`);
      onAcked();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-red-800">
          <AlertTriangle className="h-4 w-4" />
          {pending.length === 1
            ? '1 cancellation needs the kitchen told'
            : `${pending.length} cancellations need the kitchen told`}
        </h2>
        <button
          type="button"
          onClick={toggleSound}
          title={soundOn ? 'Alarm on — tap to silence' : 'Alarm off — tap to sound until confirmed'}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
            soundOn
              ? 'border-red-300 bg-white text-red-700'
              : 'border-red-200 bg-red-100/60 text-red-600 hover:bg-white'
          }`}
        >
          {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          {soundOn ? 'Alarm on' : 'Alarm off'}
        </button>
      </div>
      <ul className="mt-3 space-y-2">
        {pending.map((o) => (
          <li
            key={o.id}
            className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-3 py-2"
          >
            <span className="font-semibold text-brand-900">#{o.id}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-brand-700">
              {o.name} · {o.needed_on}
            </span>
            <button
              type="button"
              onClick={() => ack(o.id)}
              disabled={busyId === o.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-900 px-3 py-1.5 text-xs font-semibold text-cream-50 hover:bg-brand-800 disabled:opacity-60"
            >
              <Check className="h-3.5 w-3.5" />
              {busyId === o.id ? 'Saving…' : "I've told the kitchen"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
