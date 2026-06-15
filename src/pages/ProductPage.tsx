import { PriceRow } from "@/components/checkout/primitives/PriceRow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";

const PRODUCT_SALE_PRICE = "$49.00";

const SHIPPING_LINE = { id: "shipping", label: "Shipping", value: "$7.95" };
const TAX_LINE = { id: "tax", label: "Tax", value: "$0.00" };
const TOTAL_LINE = { id: "total", label: "Total", value: "$56.95" };

export function ProductPage() {
  const includedLabel = `Vitamin Essentials Pack`;
  const ctaClassName =
    "h-12 px-8 w-full rounded-full border-0 bg-[#c8620a] hover:bg-[#b55508] text-base justify-center cursor-pointer gap-4 items-center disabled:opacity-90 transition-colors";

  return (
    <main data-page="product" className="bg-[#f5f0e8]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 sm:px-6">
        <section
          data-section="promo-banner"
          aria-label="Product hero message"
          className="py-4"
        >
          <div className="grid gap-4 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:items-center">
            <img
              data-slot="promo-image"
              src="/product-image.jpeg"
              alt="Vitamin Essentials Pack product photo"
              className="w-full object-cover rounded-lg"
            />
            <div data-slot="promo-copy" className="space-y-1">
              <p className="text-base font-medium">Vitamin Essentials Pack</p>
              <p className="text-sm">
                Designed for consistent daily support, with premium quality and
                dependable fulfillment.
              </p>
            </div>
          </div>
        </section>

        <div
          data-section="product-layout"
          className="grid gap-4 lg:grid-cols-[1.6fr_1fr] lg:items-start"
        >
          <section data-region="product-main" className="flex flex-col gap-4">
            <Card
              data-section="product-details"
            >
              <CardHeader className="border-b border-border pb-4">
                <CardTitle className="text-base font-medium text-[#163427]">
                  Product Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Everything included in your premium checkout bundle.
                </p>

                <section className="mt-2 border-t border-border pt-4">
                  <h2 className="text-base font-semibold tracking-tight text-foreground">
                    Why Customers Choose This Offer
                  </h2>
                  <div className="mt-3 grid gap-3">
                    <div>
                      <p
                        data-slot="offer-label-1"
                        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Clinically focused formula
                      </p>
                      <p data-slot="offer-value-1" className="mt-1 text-sm text-foreground">
                        High-quality ingredients selected to support daily health and energy.
                      </p>
                    </div>
                    <div>
                      <p
                        data-slot="offer-label-2"
                        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Bonus value
                      </p>
                      <p data-slot="offer-value-2" className="mt-1 text-sm text-foreground">
                        Secure ordering, priority processing, and dependable support come
                        included with your order.
                      </p>
                    </div>
                  </div>
                </section>

                <section className="mt-2 border-t border-border pt-4">
                  <h2 className="text-base font-semibold tracking-tight text-foreground">
                    Shipping &amp; Guarantee
                  </h2>
                  <div className="mt-3 grid gap-3">
                    <div>
                      <p
                        data-slot="shipping-label"
                        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Delivery
                      </p>
                      <p data-slot="shipping-value" className="mt-1 text-sm text-foreground">
                        Ships in 1 business day with tracked delivery.
                      </p>
                    </div>
                    <div>
                      <p
                        data-slot="guarantee-label"
                        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Risk-Free Promise
                      </p>
                      <p data-slot="guarantee-value" className="mt-1 text-sm text-foreground">
                        100% Money Back Guarantee. If you are not satisfied within{" "}
                        60 days, we will make it right.
                      </p>
                    </div>
                  </div>
                </section>
              </CardContent>
            </Card>
          </section>

          <aside data-region="product-summary" className="lg:sticky lg:top-6 lg:h-max">
            <Card data-section="product-snapshot">
              <CardHeader className="border-b border-border pb-4">
                <CardTitle className="text-base font-medium text-[#163427]">
                  Bundle Snapshot
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  data-slot="included-products-list"
                >
                  <div
                    data-slot="included-product-item"
                    className="my-[7px] flex items-center gap-4 text-sm"
                  >
                    <img
                      data-slot="included-product-thumb"
                      src="/product-summary-image.jpeg"
                      alt="Vitamin Essentials Pack product photo"
                      className="h-20 w-18 shrink-0 rounded-lg object-cover"
                    />
                    <span className="flex-1 text-foreground font-medium">{includedLabel}</span>
                    <strong data-slot="included-product-price" className="text-foreground font-mono font-normal">
                      {PRODUCT_SALE_PRICE}
                    </strong>
                  </div>
                </div>
              </CardContent>

              <CardFooter>
                <div className="w-full flex flex-col gap-2">
                  <PriceRow
                    data-slot="shipping-line"
                    line={SHIPPING_LINE}
                    className=""
                  />
                  <PriceRow
                    data-slot="tax-line"
                    line={TAX_LINE}
                    className=""
                  />
                  <PriceRow
                    data-slot="total-line"
                    line={TOTAL_LINE}
                    className="mt-3 border-t border-border pt-3"
                    labelClassName="font-medium"
                    valueClassName="text-[22px] font-mono"
                  />

                  <Button
                    asChild
                    type="button"
                    size="lg"
                    data-slot="cta-primary"
                    className={ctaClassName}
                  >
                    <a href="/">Proceed to Checkout</a>
                  </Button>

                  <div
                    data-slot="guarantee-note"
                    className="text-center"
                  >
                    100% Money Back Guarantee. Secure encrypted checkout.
                  </div>
                </div>

              </CardFooter>
            </Card>
          </aside>
        </div>
      </div>
    </main>
  );
}
