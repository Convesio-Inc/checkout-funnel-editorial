/**
 * CustomerInfo
 * -----------------------------------------------------------------------------
 * Collects the customer's email and phone number. Fully controlled; parent
 * owns state. Every input is `required` so the browser blocks submission.
 *
 * Edit copy (labels, placeholders, hints) directly in this file.
 *
 * Markers:
 *   - root             data-section="customer-info"
 *   - email field      data-field="email"
 *   - phone field      data-field="phone-number"
 * -----------------------------------------------------------------------------
 */

export interface CustomerInfoValue {
  email: string;
  phoneNumber: string;
}

export interface CustomerInfoCardProps {
  value: CustomerInfoValue;
  onChange: (next: CustomerInfoValue) => void;
}

const inputCls =
  "w-full h-9 rounded-[6px] border border-[#e0d9cc] bg-white px-2.5 text-[13px] text-[#333] placeholder:text-[#ccc] focus:outline-none focus:border-[#1a3028] transition-colors";

const labelCls =
  "block text-[10px] font-semibold text-[#999] uppercase tracking-[0.08em] mb-[5px]";

export function CustomerInfo({ value, onChange }: CustomerInfoCardProps) {
  const set =
    (key: keyof CustomerInfoValue) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...value, [key]: event.target.value });

  return (
    <div className="flex flex-col gap-2.5">
      <div data-field="email">
        <div className="flex items-baseline justify-between mb-[5px]">
          <label htmlFor="customer-email" className={labelCls} style={{ marginBottom: 0 }}>
            Email Address
          </label>
          <span className="text-[10px] text-[#aaa] italic">So we can send your tracking link.</span>
        </div>
        <input
          id="customer-email"
          type="email"
          autoComplete="email"
          placeholder="you@domain.com"
          required
          value={value.email}
          onChange={set("email")}
          className={inputCls}
        />
      </div>

      <div data-field="phone-number">
        <div className="flex items-baseline justify-between mb-[5px]">
          <label htmlFor="customer-phone" className={labelCls} style={{ marginBottom: 0 }}>
            Phone
          </label>
          <span className="text-[10px] text-[#aaa] italic">for SMS tracking</span>
        </div>
        <input
          id="customer-phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="(555) 010-4423"
          required
          value={value.phoneNumber}
          onChange={set("phoneNumber")}
          className={inputCls}
        />
      </div>
    </div>
  );
}
