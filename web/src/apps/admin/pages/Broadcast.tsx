import { useState } from 'react';
import { Bell, Send, Loader2 } from 'lucide-react';
import { useFetch } from '../../shared/hooks/useFetch';
import { useToast } from '../../shared/context/ToastContext';
import { Button } from '../../shared/components/ui/Button';
import { Input, Textarea } from '../../shared/components/ui/Input';
import { Field } from '../../shared/components/ui/Field';
import { FormError } from '../../shared/components/ui/FormError';
import { adminBroadcastApi } from '../api/endpoints';

export function AdminBroadcast() {
  const toast = useToast();
  const { data, error, refetch } = useFetch(() => adminBroadcastApi.get(), []);
  const configured = data?.push_configured ?? false;
  const subscribers = data?.subscribers ?? 0;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [url, setUrl] = useState('');
  const [titleErr, setTitleErr] = useState('');
  const [bodyErr, setBodyErr] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    let ok = true;
    if (!title.trim()) { setTitleErr('Please enter a title.'); ok = false; } else setTitleErr('');
    if (!body.trim()) { setBodyErr('Please enter a message.'); ok = false; } else setBodyErr('');
    if (!ok) return;
    setSending(true);
    try {
      const res = await adminBroadcastApi.send({ title: title.trim(), body: body.trim(), url: url.trim() || undefined });
      toast.success(`Sent to ${res.sent} device${res.sent === 1 ? '' : 's'}` + (res.failed ? ` · ${res.failed} failed` : ''));
      setTitle(''); setBody(''); setUrl('');
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Broadcast</h1>
        <p className="text-sm text-brand-500">Send a push notification to every subscribed device.</p>
      </div>

      <div className="card-soft flex items-center gap-3 p-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-100 text-gold-700">
          <Bell className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-brand-900">{subscribers} subscriber{subscribers === 1 ? '' : 's'}</p>
          <p className="text-xs text-brand-400">
            {configured ? 'Web Push is configured.' : 'Web Push is NOT configured — add VAPID keys to includes/config.php.'}
          </p>
        </div>
      </div>

      {error && <FormError message={error} />}

      <section className="card-soft p-5">
        <h2 className="text-base font-bold text-brand-900">New notification</h2>
        <div className="mt-4 space-y-4">
          <Field label="Title" htmlFor="b-title" error={titleErr}>
            <Input id="b-title" value={title} invalid={!!titleErr} onChange={(e) => { setTitle(e.target.value); setTitleErr(''); }} maxLength={120} placeholder="Festive menu live!" disabled={!configured} />
          </Field>
          <Field label="Message" htmlFor="b-body" error={bodyErr}>
            <Textarea id="b-body" rows={3} value={body} invalid={!!bodyErr} onChange={(e) => { setBody(e.target.value); setBodyErr(''); }} maxLength={500} placeholder="Order our Diwali special by 6 PM today." disabled={!configured} />
          </Field>
          <Field label="Tap destination URL" htmlFor="b-url" hint="optional">
            <Input id="b-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/order" disabled={!configured} />
          </Field>
          <div className="flex justify-end">
            <Button onClick={send} disabled={!configured || sending || !title || !body}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'Sending…' : 'Send broadcast'}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}