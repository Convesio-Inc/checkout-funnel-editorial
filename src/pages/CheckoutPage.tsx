import { useCallback, useRef, useState } from "react";

import {
  CustomerInfo,
  type CustomerInfoValue,
} from "@/components/checkout/CustomerInfo";
import { OrderSummaryCard } from "@/components/checkout/OrderSummaryCard";
import { PaymentInfo } from "@/components/checkout/PaymentInfo";
import { PaymentStatusDialog } from "@/components/checkout/PaymentStatusDialog";
import {
  ShippingInfo,
  type ShippingInfoValue,
} from "@/components/checkout/ShippingInfo";
import { BundleSelector } from "@/components/checkout/BundleSelector";
import { BUNDLES, type Bundle } from "@/components/checkout/bundles";
import { ProductHeroCard } from "@/components/checkout/ProductHeroCard";
import { GuaranteeCard } from "@/components/checkout/GuaranteeCard";
import { ReviewsSection } from "@/components/checkout/ReviewsSection";
import { IngredientsPanel } from "@/components/checkout/IngredientsPanel";
import { SectionHead } from "@/components/checkout/form-atoms";
import { Icon } from "@/components/icons";
import { useCheckoutPayment } from "@/hooks/useCheckoutPayment";

const PRODUCT_SKU = "1234567890";
const PRODUCT_NAME = "Daily Greens Complex";
const CURRENCY = "USD";

const INITIAL_CUSTOMER: CustomerInfoValue = {
  email: "",
  phoneNumber: "",
};

const INITIAL_SHIPPING: ShippingInfoValue = {
  firstName: "",
  lastName: "",
  street: "",
  aptSuite: "",
  city: "",
  stateOrProvince: "",
  zip: "",
  country: "US",
};

export function CheckoutPage() {
  const [customer, setCustomer] = useState<CustomerInfoValue>(INITIAL_CUSTOMER);
  const [shipping, setShipping] = useState<ShippingInfoValue>(INITIAL_SHIPPING);
  const [isPaymentValid, setIsPaymentValid] = useState(false);
  const [selectedBundle, setSelectedBundle] = useState<Bundle>(
    BUNDLES.find((b) => b.isMostChosen) ?? BUNDLES[0],
  );

  const componentRef = useRef<ConvesioPayComponent | null>(null);
  const handleComponentReady = useCallback((c: ConvesioPayComponent) => {
    componentRef.current = c;
  }, []);

  const { status, error, result, pay, reset } = useCheckoutPayment();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!componentRef.current) return;
    if (status === "processing") return;

    const address = {
      houseNumberOrName: shipping.aptSuite,
      street: shipping.street,
      city: shipping.city,
      stateOrProvince: shipping.stateOrProvince,
      postalCode: shipping.zip,
      country: shipping.country,
    };

    await pay(componentRef.current, {
      email: customer.email,
      name: `${shipping.firstName} ${shipping.lastName}`.trim(),
      amount: selectedBundle.totalAmountMinor,
      currency: CURRENCY,
      phone: {
        number: customer.phoneNumber,
        countryCode: "1",
      },
      billingAddress: address,
      shippingAddress: address,
      lineItems: [
        {
          sku: PRODUCT_SKU,
          description: PRODUCT_NAME,
          quantity: selectedBundle.bottleCount,
          amountIncludingTax: selectedBundle.totalAmountMinor,
        },
      ],
    });
  };

  const isProcessing = status === "processing";

  return (
    <main data-page="checkout" className="max-w-[1200px] mx-auto px-4 sm:px-8">
      <ProductHeroCard />

      <div className="grid lg:grid-cols-[1fr_minmax(420px,1fr)] gap-10 lg:gap-16 items-start border-t border-rule pt-8 sm:pt-12">
        {/* LEFT */}
        <section data-region="form-stack">
          <div className="flex items-baseline justify-between">
            <div>
              <div className="smallcaps text-[10.5px] text-ink3">Step one</div>
              <h2 className="serif text-[28px] sm:text-[34px] leading-none mt-1">Choose your supply.</h2>
            </div>
            <span className="text-[11.5px] text-ink3 font-light">
              Most order the <span className="text-ink2">Trio</span>.
            </span>
          </div>
          <div className="mt-7">
            <BundleSelector value={selectedBundle} onChange={setSelectedBundle} />
          </div>
          <GuaranteeCard />
          <ReviewsSection />
          <IngredientsPanel />
        </section>

        {/* RIGHT */}
        <aside data-region="summary" className="lg:sticky lg:top-[56px] lg:pl-8 lg:border-l lg:border-rule">
          <div className="smallcaps text-[10.5px] text-ink3 mb-2">Step two</div>
          <div className="flex items-baseline justify-between border-b border-rule pb-4">
            <h2 className="serif text-[26px] leading-none">Your details.</h2>
            <span className="smallcaps text-[10.5px] text-ink3 flex items-center gap-1.5">
              <Icon.Lock className="w-3 h-3" aria-hidden="true" /> 256-bit secured
            </span>
          </div>

          <form onSubmit={handleSubmit} className="pt-7 space-y-9">
            <section data-section="customer-info">
              <SectionHead n="I" title="Contact" />
              <CustomerInfo value={customer} onChange={setCustomer} />
            </section>
            <section data-section="shipping-info">
              <SectionHead n="II" title="Shipping address" />
              <ShippingInfo value={shipping} onChange={setShipping} />
            </section>
            <section data-section="payment-info">
              <SectionHead n="III" title="Payment" sub="VISA · MC · AMEX · DISC" />
              <PaymentInfo
                customerEmail={customer.email || undefined}
                onValidityChange={setIsPaymentValid}
                onComponentReady={handleComponentReady}
              />
            </section>

            <OrderSummaryCard
              selectedBundle={selectedBundle}
              payDisabled={!isPaymentValid}
              payLoading={isProcessing}
            />

            <p className="text-center text-[11px] text-ink3 -mt-3 font-light">
              You will not be charged until you press the button above. Demo checkout — no real charges.
            </p>
          </form>
        </aside>
      </div>

      <PaymentStatusDialog status={status} error={error} result={result} onClose={reset} />
    </main>
  );
}
