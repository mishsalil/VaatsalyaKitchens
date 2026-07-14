import { Modal } from '../../shared/components/ui/Modal';
import { Button } from '../../shared/components/ui/Button';

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
};

/** Generic "are you sure?" modal with a destructive confirm button. */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onClose }: Props) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={async () => { await onConfirm(); onClose(); }}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-sm text-brand-700">{message}</p>
    </Modal>
  );
}