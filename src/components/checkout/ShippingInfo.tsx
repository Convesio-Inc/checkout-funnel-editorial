/**
 * ShippingInfo
 * -----------------------------------------------------------------------------
 * Shipping address form. Layout matches the reference design:
 *   [First Name] [Last Name]
 *   [Street Address        ]
 *   [Apt / Suite] [City    ]
 *   [State      ] [Zip     ]
 *
 * Fully controlled; parent owns state. Every field (except Apt / Suite) is
 * `required`. Edit labels and placeholders directly in this file.
 *
 * Markers:
 *   - root           data-section="shipping-info"
 *   - field markers  data-field="first-name" | "last-name" | "street" |
 *                    "apt-suite" | "city" | "state" | "zip"
 * -----------------------------------------------------------------------------
 */

export interface ShippingInfoValue {
  firstName: string;
  lastName: string;
  street: string;
  aptSuite: string;
  city: string;
  stateOrProvince: string;
  zip: string;
  country: string;
}

export interface ShippingInfoProps {
  value: ShippingInfoValue;
  onChange: (next: ShippingInfoValue) => void;
}

const inputCls =
  "w-full h-9 rounded-[6px] border border-[#e0d9cc] bg-white px-2.5 text-[13px] text-[#333] placeholder:text-[#ccc] focus:outline-none focus:border-[#1a3028] transition-colors";

const labelCls =
  "block text-[10px] font-semibold text-[#999] uppercase tracking-[0.08em] mb-[5px]";

function Field({
  id,
  label,
  optional,
  "data-field": dataField,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  optional?: boolean;
  "data-field": string;
}) {
  return (
    <div data-field={dataField}>
      <div className="flex items-baseline gap-1 mb-[5px]">
        <label htmlFor={id} className={labelCls} style={{ marginBottom: 0 }}>
          {label}
        </label>
        {optional && (
          <span className="text-[10px] text-[#bbb] italic">optional</span>
        )}
      </div>
      <input id={id} className={inputCls} {...props} />
    </div>
  );
}

export function ShippingInfo({ value, onChange }: ShippingInfoProps) {
  const set =
    (key: keyof ShippingInfoValue) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...value, [key]: e.target.value });

  return (
    <div className="flex flex-col gap-2.5">
      {/* Row 1: First Name / Last Name */}
      <div className="grid grid-cols-2 gap-2.5">
        <Field
          data-field="first-name"
          id="ship-first-name"
          label="First Name"
          autoComplete="given-name"
          placeholder="Alex"
          required
          value={value.firstName}
          onChange={set("firstName")}
        />
        <Field
          data-field="last-name"
          id="ship-last-name"
          label="Last Name"
          autoComplete="family-name"
          placeholder="Mendez"
          required
          value={value.lastName}
          onChange={set("lastName")}
        />
      </div>

      {/* Row 2: Street Address */}
      <Field
        data-field="street"
        id="ship-street"
        label="Street Address"
        autoComplete="address-line1"
        placeholder="2114 Larkspur Lane"
        required
        value={value.street}
        onChange={set("street")}
      />

      {/* Row 3: Apt / Suite + City */}
      <div className="grid grid-cols-2 gap-2.5">
        <Field
          data-field="apt-suite"
          id="ship-apt-suite"
          label="Apt / Suite"
          optional
          autoComplete="address-line2"
          placeholder="—"
          value={value.aptSuite}
          onChange={set("aptSuite")}
        />
        <Field
          data-field="city"
          id="ship-city"
          label="City"
          autoComplete="address-level2"
          placeholder="Portland"
          required
          value={value.city}
          onChange={set("city")}
        />
      </div>

      {/* Row 4: State + Zip */}
      <div className="grid grid-cols-2 gap-2.5">
        <Field
          data-field="state"
          id="ship-state"
          label="State"
          autoComplete="address-level1"
          placeholder="OR"
          required
          value={value.stateOrProvince}
          onChange={set("stateOrProvince")}
        />
        <Field
          data-field="zip"
          id="ship-zip"
          label="Zip"
          autoComplete="postal-code"
          inputMode="numeric"
          placeholder="97214"
          required
          value={value.zip}
          onChange={set("zip")}
        />
      </div>
    </div>
  );
}
