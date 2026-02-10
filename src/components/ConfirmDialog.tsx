'use client';

export default function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Удалить',
  cancelText = 'Отмена',
}: {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center"
      onClick={onCancel}
    >
      <div
        className="bg-white p-8 rounded-[10px] shadow-[0_10px_30px_rgba(0,0,0,0.3)] max-w-[500px] w-[90%] text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex gap-2.5 justify-center">
          <button
            className="px-5 py-2.5 bg-[#6c757d] text-white border-none rounded-[5px] cursor-pointer text-sm font-semibold"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            className="px-5 py-2.5 bg-danger text-white border-none rounded-[5px] cursor-pointer text-sm font-semibold"
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
