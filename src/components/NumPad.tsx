interface NumPadProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  disableDecimal?: boolean;
  disabled?: boolean;
}

const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'] as const;

export function NumPad({
  onKeyPress,
  onBackspace,
  disableDecimal = false,
  disabled = false,
}: NumPadProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {NUMPAD_KEYS.map((key) => {
        const isDecimalKey = key === '.';
        const isDisabled = disabled || (isDecimalKey && disableDecimal);

        return (
          <button
            key={key}
            type="button"
            onClick={() => onKeyPress(key)}
            disabled={isDisabled}
            className="flex min-h-[48px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-2xl font-semibold text-[var(--color-text)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--color-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {key}
          </button>
        );
      })}

      <button
        type="button"
        onClick={onBackspace}
        disabled={disabled}
        aria-label="Apagar último valor"
        className="flex min-h-[48px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-2xl font-semibold text-[var(--color-text)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--color-bg-secondary)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        ⌫
      </button>
    </div>
  );
}
