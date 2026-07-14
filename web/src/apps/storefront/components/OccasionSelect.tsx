import { Select } from '../../shared/components/ui/Input';

const OCCASIONS = ['Small Party', 'Kitty Party', 'Bulk Order / Event', 'Daily Meal', 'Other'];

export function OccasionSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose one…</option>
      {OCCASIONS.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </Select>
  );
}