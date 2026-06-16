/**
 * form-atoms
 * -----------------------------------------------------------------------------
 * Shared building blocks for the checkout form: the smallcaps `Field` wrapper,
 * the serif roman-numeral `SectionHead`, and the `inputCls` string used by
 * text inputs (the global underline input style from index.css does the visual
 * heavy lifting; inputCls carries only typography helpers).
 * -----------------------------------------------------------------------------
 */

import * as React from "react";

export const inputCls =
  "w-full text-[15px] text-ink placeholder:text-ink4";

export interface FieldProps {
  label: string;
  children: React.ReactNode;
  /** Tailwind grid-span class. Defaults to full width within a 2-col grid. */
  span?: string;
  optional?: boolean;
  hint?: string;
  /** Stable field marker (data-field) preserved from the original components. */
  dataField?: string;
}

export function Field({
  label,
  children,
  span = "col-span-2",
  optional = false,
  hint,
  dataField,
}: FieldProps) {
  return (
    <label className={"block " + span} data-field={dataField}>
      <span className="smallcaps text-[9.5px] text-ink3 flex items-baseline justify-between">
        <span>{label}</span>
        {optional && <span className="text-ink4 normal-case tracking-normal text-[10px]">optional</span>}
        {hint && <span className="text-ink4 normal-case tracking-normal text-[10px]">{hint}</span>}
      </span>
      <span className="block mt-1">{children}</span>
    </label>
  );
}

export interface SectionHeadProps {
  n: string;
  title: string;
  sub?: string;
}

export function SectionHead({ n, title, sub }: SectionHeadProps) {
  return (
    <div className="flex items-baseline justify-between mb-5">
      <div className="flex items-baseline gap-3">
        <span className="serif italic text-[18px] text-ink3">{n}.</span>
        <h3 className="serif text-[22px] leading-none text-ink">{title}.</h3>
      </div>
      {sub && <span className="num text-[10.5px] text-ink3 tracking-[0.08em]">{sub}</span>}
    </div>
  );
}
