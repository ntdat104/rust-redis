import { useState } from "react";

interface Props {
  title: string;
  label: string;
  initial?: string;
  type?: "text" | "number";
  submitLabel?: string;
  onSubmit: (value: string) => void | Promise<void>;
  onClose: () => void;
}

export function PromptModal({
  title,
  label,
  initial = "",
  type = "text",
  submitLabel = "OK",
  onSubmit,
  onClose,
}: Props) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(value);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        style={{ width: 380 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2>{title}</h2>
        <label>{label}</label>
        <input
          value={value}
          type={type}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          style={{ width: "100%" }}
        />
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={submit} disabled={busy}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
