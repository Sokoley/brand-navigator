'use client';

export default function UploadProgress({
  current,
  total,
  label,
}: {
  current: number;
  total: number;
  label?: string;
}) {
  if (total === 0) return null;
  const percent = Math.round((current / total) * 100);

  return (
    <div className="w-full">
      {label && (
        <div className="text-sm text-gray-600 mb-1">{label}</div>
      )}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#ff0000] rounded-full transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
          {current}/{total} ({percent}%)
        </span>
      </div>
    </div>
  );
}
