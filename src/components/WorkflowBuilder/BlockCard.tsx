import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";

// Sortable wrapper used for both condition and action blocks.
// Provides drag handle + delete button; form fields are rendered as children.

interface BlockCardProps {
  uid: string;
  label: string;
  accent?: string;
  onDelete: () => void;
  children: React.ReactNode;
}

export const BlockCard = ({
  uid,
  label,
  accent = "var(--accent)",
  onDelete,
  children,
}: BlockCardProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: uid });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        background: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        borderRadius: "8px",
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      {/* Card header row */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div
          {...attributes}
          {...listeners}
          style={{ cursor: "grab", display: "flex", flexShrink: 0 }}
        >
          <GripVertical size={14} color="var(--text-secondary)" style={{ opacity: 0.5 }} />
        </div>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            color: accent,
            flex: 1,
          }}
        >
          {label}
        </span>
        <div
          onClick={onDelete}
          style={{ cursor: "pointer", display: "flex", padding: "2px", borderRadius: "4px" }}
        >
          <X size={14} color="var(--text-secondary)" />
        </div>
      </div>

      {/* Form fields */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {children}
      </div>
    </div>
  );
};
