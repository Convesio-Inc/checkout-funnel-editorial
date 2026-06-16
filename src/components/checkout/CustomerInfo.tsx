/**
 * CustomerInfo
 * -----------------------------------------------------------------------------
 * Collects the customer's email and phone. Fully controlled; the parent owns
 * state. Email is required so the browser blocks submission until it's filled.
 *
 * Edit copy (labels, placeholders, hints) directly in this file.
 *
 * Markers:
 *   - email field   data-field="email"
 *   - phone field   data-field="phone-number"
 * -----------------------------------------------------------------------------
 */

import { Field, inputCls } from "@/components/checkout/form-atoms";

export interface CustomerInfoValue {
  email: string;
  phoneNumber: string;
}

export interface CustomerInfoCardProps {
  value: CustomerInfoValue;
  onChange: (next: CustomerInfoValue) => void;
}

export function CustomerInfo({ value, onChange }: CustomerInfoCardProps) {
  const set =
    (key: keyof CustomerInfoValue) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...value, [key]: event.target.value });

  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5">
      <Field label="Electronic mail" dataField="email">
        <input
          className={inputCls}
          type="email"
          autoComplete="email"
          placeholder="you@domain.com"
          required
          value={value.email}
          onChange={set("email")}
        />
      </Field>
      <Field label="Telephone" hint="for SMS tracking" dataField="phone-number">
        <input
          className={inputCls}
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="(555) 010-4423"
          required
          value={value.phoneNumber}
          onChange={set("phoneNumber")}
        />
      </Field>
    </div>
  );
}
