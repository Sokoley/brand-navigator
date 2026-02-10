'use client';

export default function FilterCloud({
  title,
  values,
  selectedValues,
  onChange,
  singleSelect = false,
}: {
  title: string;
  values: string[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  singleSelect?: boolean;
}) {
  const toggleValue = (value: string) => {
    if (singleSelect) {
      // Single select mode: toggle on/off or switch to new value
      if (selectedValues.includes(value)) {
        onChange([]); // Deselect
      } else {
        onChange([value]); // Select only this value
      }
    } else {
      // Multi-select mode (original behavior)
      if (selectedValues.includes(value)) {
        onChange(selectedValues.filter((v) => v !== value));
      } else {
        onChange([...selectedValues, value]);
      }
    }
  };

  if (!values.length) return null;

  return (
    <div className="mb-4 md:mb-6 py-3 md:py-4">
      <div className="font-semibold mb-2 md:mb-3 text-dark text-sm md:text-base">{title}</div>
      <div className="flex flex-wrap gap-1.5 md:gap-2">
        {values.map((value) => {
          const isActive = selectedValues.includes(value);
          return (
            <button
              key={value}
              onClick={() => toggleValue(value)}
              className={`px-3 md:px-4 py-1.5 md:py-2 rounded-2xl cursor-pointer text-xs md:text-sm border-2 transition-all
                ${
                  isActive
                    ? 'bg-[#ff0000] text-white border-white/30 -translate-y-px shadow-[0_2px_8px_rgba(0,0,0,0.2)]'
                    : 'bg-[#edebeb] text-dark border-transparent hover:-translate-y-px hover:shadow-sm'
                }`}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}
