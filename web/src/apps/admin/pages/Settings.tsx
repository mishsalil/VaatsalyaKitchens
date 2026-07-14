import { useEffect, useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useFetch } from '../../shared/hooks/useFetch';
import { useToast } from '../../shared/context/ToastContext';
import { Skeleton } from '../../shared/components/Skeleton';
import { Button } from '../../shared/components/ui/Button';
import { Input, Textarea } from '../../shared/components/ui/Input';
import { Field } from '../../shared/components/ui/Field';
import { adminSettingsApi } from '../api/endpoints';
import { rupees } from '../../shared/lib/format';
import { computeGst } from '../../shared/lib/gst';
import type { AdminSettingsFull } from '../types';

export function AdminSettings() {
  const toast = useToast();
  const { data, loading, error } = useFetch(() => adminSettingsApi.get(), []);
  const vapidConfigured = data?.vapid_configured ?? false;

  const [form, setForm] = useState<AdminSettingsFull | null>(null);
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data) {
      setForm(data.settings);
      setLogoPath(data.settings.logo_path);
    }
  }, [data]);

  const set = (k: keyof AdminSettingsFull, v: string) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await adminSettingsApi.update({
        kitchen_name: form.kitchen_name,
        kitchen_address: form.kitchen_address,
        kitchen_whatsapp: form.kitchen_whatsapp,
        kitchen_phone_display: form.kitchen_phone_display,
        kitchen_email: form.kitchen_email,
        gstin: form.gstin,
        print_footer: form.print_footer,
        gst_rate: form.gst_rate,
      });
      setForm(res.settings);
      toast.success('Settings saved — storefront updated');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await adminSettingsApi.uploadLogo(file);
      // cache-bust so the freshly overwritten file reloads
      setLogoPath(`${res.logo_path}?v=${Date.now()}`);
      toast.success('Logo uploaded');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (loading && !data) return <Skeleton className="h-96 w-full" />;
  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>;
  if (!form) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-900">Settings</h1>
        <p className="text-sm text-brand-500">Branding, contact, logo, and the print/invoice header.</p>
      </div>

      {/* Branding + contact */}
      <section className="card-soft p-5">
        <h2 className="text-base font-bold text-brand-900">Branding & contact</h2>
        <p className="mb-4 text-xs text-brand-400">Shown in the storefront header, footer, and receipts.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Kitchen name" htmlFor="k-name">
            <Input id="k-name" value={form.kitchen_name} onChange={(e) => set('kitchen_name', e.target.value)} />
          </Field>
          <Field label="Display phone" htmlFor="k-phone">
            <Input id="k-phone" value={form.kitchen_phone_display} onChange={(e) => set('kitchen_phone_display', e.target.value)} placeholder="+91 96238 36382" />
          </Field>
          <Field label="WhatsApp (digits)" htmlFor="k-wa" hint="91XXXXXXXXXX">
            <Input id="k-wa" value={form.kitchen_whatsapp} onChange={(e) => set('kitchen_whatsapp', e.target.value)} inputMode="tel" placeholder="919623836382" />
          </Field>
          <Field label="Email" htmlFor="k-email">
            <Input id="k-email" type="email" value={form.kitchen_email} onChange={(e) => set('kitchen_email', e.target.value)} />
          </Field>
          <Field label="Address" htmlFor="k-addr" className="sm:col-span-2">
            <Textarea id="k-addr" rows={2} value={form.kitchen_address} onChange={(e) => set('kitchen_address', e.target.value)} placeholder="Street, area, city — used on receipts" />
          </Field>
        </div>

        {/* logo */}
        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-cream-300 bg-cream-50">
            {logoPath ? (
              <img src={logoPath} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              <img src="/favicon.svg" alt="Default logo" className="h-10 w-10 opacity-60" />
            )}
          </div>
          <div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={onPickLogo} className="hidden" />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? 'Uploading…' : 'Upload logo'}
            </Button>
            <p className="mt-1 text-xs text-brand-400">JPG / PNG / WebP / SVG, up to 2 MB. Replaces the current logo.</p>
          </div>
        </div>
      </section>

      {/* Print header */}
      <section className="card-soft p-5">
        <h2 className="text-base font-bold text-brand-900">Print / invoice header</h2>
        <p className="mb-4 text-xs text-brand-400">Appears on the printable receipt for every order.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GST rate (%)" htmlFor="k-gst" hint="tax-exclusive · 0 disables">
            <Input id="k-gst" value={form.gst_rate} onChange={(e) => set('gst_rate', e.target.value)} inputMode="decimal" placeholder="5" />
          </Field>
          <Field label="GSTIN" htmlFor="k-gstin" hint="optional">
            <Input id="k-gstin" value={form.gstin} onChange={(e) => set('gstin', e.target.value.toUpperCase())} placeholder="29ABCDE1234F1Z5" maxLength={15} />
          </Field>
          <Field label="Receipt footer note" htmlFor="k-footer" hint="optional" className="sm:col-span-2">
            <Input id="k-footer" value={form.print_footer} onChange={(e) => set('print_footer', e.target.value)} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-brand-400">
          Menu prices are exclusive of GST. The rate above is split equally into CGST &amp; SGST and added on top of the subtotal on every order.
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-brand-400">Preview below uses the name, address, phone and GSTIN above.</p>
          <Button variant="outline" size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save settings
          </Button>
        </div>

        <PrintPreview s={form} logoPath={logoPath} />
      </section>

      {/* Push status */}
      <section className="card-soft p-5">
        <h2 className="text-base font-bold text-brand-900">Web Push</h2>
        <p className="mt-1 text-sm text-brand-700">
          Status: {vapidConfigured
            ? <span className="font-semibold text-emerald-600">configured</span>
            : <span className="font-semibold text-red-600">not configured</span>}
        </p>
        <p className="mt-1 text-xs text-brand-400">
          VAPID keys live in <code>includes/config.php</code> and are never editable here.
          {!vapidConfigured && ' Broadcast is unavailable until keys are added.'}
        </p>
        <div className="mt-3">
          <Link to="/admin/broadcast" className="text-sm font-semibold text-brand-700 hover:underline">Go to Broadcast →</Link>
        </div>
      </section>
    </div>
  );
}

/** A small, screen approximation of the A4 receipt using current settings. */
function PrintPreview({ s, logoPath }: { s: AdminSettingsFull; logoPath: string | null }) {
  const subtotal = 760; // Paneer Tikka x2 (₹500) + Dal Makhani x1 (₹260)
  const gst = computeGst(subtotal, s.gst_rate);
  const hasGst = gst.rate > 0;
  return (
    <div className="mt-4 rounded-xl border border-cream-300 bg-white p-5">
      <div className="flex items-center gap-3 border-b border-cream-200 pb-3">
        {logoPath ? (
          <img src={logoPath} alt="" className="h-12 w-12 object-contain" />
        ) : (
          <img src="/favicon.svg" alt="" className="h-10 w-10 opacity-70" />
        )}
        <div>
          <p className="text-base font-bold text-brand-900">{s.kitchen_name || 'Vaatsalya Kitchens'}</p>
          {s.kitchen_address && <p className="text-xs text-brand-600">{s.kitchen_address}</p>}
          <p className="text-xs text-brand-600">
            {s.kitchen_phone_display}
            {s.kitchen_email && ` · ${s.kitchen_email}`}
          </p>
          {s.gstin && <p className="text-xs text-brand-600">GSTIN: {s.gstin}</p>}
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-brand-400">Receipt preview</p>
      <table className="mt-1 w-full text-sm">
        <thead>
          <tr className="border-b border-cream-200 text-left text-xs text-brand-400">
            <th className="py-1">Item</th><th className="py-1 text-right">Qty</th><th className="py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="py-1">Paneer Tikka</td><td className="py-1 text-right">2</td><td className="py-1 text-right">{rupees(500)}</td></tr>
          <tr><td className="py-1">Dal Makhani</td><td className="py-1 text-right">1</td><td className="py-1 text-right">{rupees(260)}</td></tr>
        </tbody>
      </table>
      <div className="mt-2 space-y-1 border-t border-cream-200 pt-2 text-sm text-brand-600">
        {hasGst && (
          <>
            <div className="flex justify-between"><span>Subtotal</span><span className="text-brand-900">{rupees(gst.subtotal)}</span></div>
            <div className="flex justify-between"><span>CGST ({gst.rate / 2}%)</span><span className="text-brand-900">{rupees(gst.cgst)}</span></div>
            <div className="flex justify-between"><span>SGST ({gst.rate / 2}%)</span><span className="text-brand-900">{rupees(gst.sgst)}</span></div>
            {gst.roundOff > 0 && (
              <div className="flex justify-between"><span>Round off</span><span className="text-brand-900">+{rupees(gst.roundOff)}</span></div>
            )}
          </>
        )}
        <div className="flex justify-between text-base font-bold text-brand-900">
          <span>Total</span><span>{rupees(hasGst ? gst.total : subtotal)}</span>
        </div>
      </div>
      {s.print_footer && <p className="mt-3 text-center text-xs text-brand-500">{s.print_footer}</p>}
    </div>
  );
}