import { Star } from 'lucide-react';

/**
 * A row of five stars. Buttons, not a radio group, because the whole point is
 * that one tap finishes the job — and each button carries its own accessible
 * name so a screen reader user is not left counting unlabelled controls.
 */
export function StarInput({
  value,
  onChange,
  size = 'lg',
  label,
}: {
  value: number;
  onChange: (stars: number) => void;
  size?: 'sm' | 'lg';
  label: string;
}) {
  const box = size === 'lg' ? 'h-10 w-10' : 'h-7 w-7';
  return (
    <div role="group" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          aria-pressed={value === n}
          className={`${box} flex items-center justify-center rounded-lg transition active:scale-95`}
        >
          <Star
            className={`${size === 'lg' ? 'h-8 w-8' : 'h-6 w-6'} ${
              n <= value ? 'fill-amber-400 text-amber-400' : 'text-brand-300'
            }`}
          />
        </button>
      ))}
    </div>
  );
}
