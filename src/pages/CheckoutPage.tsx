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
import { useCheckoutPayment } from "@/hooks/useCheckoutPayment";
import { LockIcon } from "lucide-react";

const PRODUCT_SKU = "1234567890";
const PRODUCT_NAME = "Vitamin Essentials Pack";
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
    <main data-page="checkout" className="bg-[#f5f0e8] pb-12">
      <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-6 py-6">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.65fr_1fr] lg:items-start">

          {/* LEFT: social proof column */}
          <div data-region="form-stack">
            <ProductHeroCard />
            <BundleSelector value={selectedBundle} onChange={setSelectedBundle} />
            <GuaranteeCard />
            <ReviewsSection />
            <IngredientsPanel />
          </div>

          {/* RIGHT: sticky form card */}
          <div data-region="summary" className="lg:sticky lg:top-6">
            <div className="bg-white rounded-[10px] overflow-hidden shadow-sm">
              {/* Form card header */}
              <div className="bg-[#1a3028] text-white px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold tracking-[0.1em] flex items-center gap-1.5">
                    <LockIcon className="w-3 h-3" />
                    SAFE &amp; SECURE ORDER FORM
                  </div>
                  <div className="text-[9px] text-[#7ab89a] tracking-[0.06em] mt-0.5">
                    256-BIT SECURE ENCRYPTION
                  </div>
                </div>
                <span className="bg-white/15 text-[10px] px-2 py-1 rounded-[4px] tracking-[0.06em]">
                  🔒 https
                </span>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="px-4 pb-4">
                {/* Section 1: Contact */}
                <section data-section="customer-info" className="pt-4">
                  <h2 className="text-[13px] font-semibold text-[#1a3028] mb-3 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#1a3028] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                      1
                    </span>
                    Contact
                    <span className="text-[10px] text-[#aaa] font-normal ml-auto italic">
                      So we can send your tracking link.
                    </span>
                  </h2>
                  <CustomerInfo value={customer} onChange={setCustomer} />
                </section>

                <div className="h-px bg-[#f0ece4] my-3" />

                {/* Section 2: Shipping */}
                <section data-section="shipping-info">
                  <h2 className="text-[13px] font-semibold text-[#1a3028] mb-3 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#1a3028] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                      2
                    </span>
                    Shipping address
                    <span className="text-[10px] text-[#aaa] font-normal ml-auto">
                      U.S. only · free 2–4 day.
                    </span>
                  </h2>
                  <ShippingInfo value={shipping} onChange={setShipping} />
                </section>

                <div className="h-px bg-[#f0ece4] my-3" />

                {/* Section 3: Payment */}
                <section data-section="payment-info">
                  <h2 className="text-[13px] font-semibold text-[#1a3028] mb-3 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-[#1a3028] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                      3
                    </span>
                    Payment
                    <span className="text-[10px] text-[#aaa] font-normal ml-auto">
                      We never store your card.
                    </span>
                  </h2>
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
              </form>
            </div>
          </div>

        </div>
      </div>

      <PaymentStatusDialog
        status={status}
        error={error}
        result={result}
        onClose={reset}
      />
    </main>
  );
}
