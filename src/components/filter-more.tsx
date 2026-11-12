"use client";
import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

/**
 * On a phone, a list's filters beyond its search box wait behind this button (staff.css), so the
 * list starts near the top of the screen. A filter already in use opens them, so it stays in sight.
 * Wider screens show every filter and never this button.
 */
export function FilterMore() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const used = Array.from(form.elements).some((field) =>
      field instanceof HTMLSelectElement
        ? field.selectedIndex > 0
        : field instanceof HTMLInputElement && field.name !== "q" && field.type !== "hidden"
          ? field.type === "checkbox" || field.type === "radio"
            ? field.checked
            : field.value !== ""
          : false,
    );
    if (used) setOpen(true);
  }, []);
  useEffect(() => {
    ref.current?.form?.toggleAttribute("data-open", open);
  }, [open]);
  return (
    <button ref={ref} type="button" className="secondary-button filter-more" aria-expanded={open} onClick={() => setOpen(!open)}>
      <SlidersHorizontal size={16} aria-hidden="true" />
      {open ? "Fewer filters" : "Filters"}
    </button>
  );
}
