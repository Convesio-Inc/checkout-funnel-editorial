/**
 * useCheckoutPayment
 * -----------------------------------------------------------------------------
 * Tiny state machine that drives the Pay Now -> processing -> success/failed
 * flow. Exposes:
 *
 *   {
 *     status,   // "idle" | "processing" | "success" | "pending" | "failed"
 *     error,    // Error, only set while status === "failed"
 *     result,   // PaymentResponse, set while status === "success" | "pending"
 *     pay,      // (component, payload) => Promise<void>
 *     reset,    // () => void — returns to "idle"
 *   }
 *
 * `pay()` runs the full pipeline:
 *
 *   1. `component.createToken()` to get a `paymentToken` from the SDK.
 *   2. `POST /payments` on our worker with the token + customer/shipping
 *      fields, which forwards server-side to the ConvesioPay API.
 *   3. Maps the response into `success` / `pending` / `failed`.
 *
 * "Pending" is the ConvesioPay status we get when the merchant has checkout
 * configured so the transaction is validated after initial checks but still
 * needs to be accepted/denied through an async webhook. The worker has no way
 * to block on that webhook, so we surface it to the user as a dedicated state
 * instead of claiming the payment succeeded.
 *
 * All errors (SDK tokenization, network, non-2xx, upstream `error: true`) land
 * on `status === "failed"` with a human-readable `error.message`.
 * -----------------------------------------------------------------------------
 */

import { useCallback, useState } from "react";

export type CheckoutPaymentStatus =
  | "idle"
  | "processing"
  | "success"
  | "pending"
  | "failed";

export interface Address {
  houseNumberOrName: string;
  street: string;
  city: string;
  stateOrProvince: string;
  postalCode: string;
  country: string;
}

export interface LineItem {
  sku: string;
  description: string;
  quantity: number;
  amountIncludingTax: number;
}
export interface PaymentPayload {
  email: string;
  name: string;
  amount: number;
  currency: string;
  phone?: { number: string; countryCode: string };
  billingAddress?: Address;
  shippingAddress?: Address;
  lineItems?: LineItem[];
}

export interface PaymentActionRequired {
  type?: string;
  redirectUrl?: string;
}

/**
 * Raw response body from the worker's `POST /payments` endpoint.
 *
 * Three mutually exclusive shapes arrive in practice:
 *
 *  1. **3DS challenge** — `actionRequired.redirectUrl` is set; `id` is present
 *     so the hook can stash it in sessionStorage before navigating to the
 *     bank's hosted page.
 *
 *  2. **Success / pending** — `redirectUrl` is set (the worker's pre-signed
 *     thank-you URL). `actionRequired` is absent. The hook navigates directly
 *     to this URL.
 *
 *  3. **Non-terminal status** (declined, expired, …) — neither `redirectUrl`
 *     nor `actionRequired` is set. `status` carries the raw ConvesioPay
 *     string; the hook maps it to `"failed"`.
 */
export interface PaymentResponse {
  id?: string;
  orderNumber?: string;
  status?: string;
  amount?: number;
  currency?: string;
  /** Present when the worker produces a thank-you redirect (i.e. the payment
   *  landed on a success or pending status). The hook navigates to this URL
   *  instead of surfacing the success/pending modal. */
  redirectUrl?: string;
  /** Present when ConvesioPay flags the payment for a 3DS (or similar)
   *  challenge. The hook stashes the order id in sessionStorage and
   *  navigates the user to `actionRequired.redirectUrl`; on return, the
   *  thank-you page hydrates a proper `?token=<jwt>` URL via `/issue-token`. */
  actionRequired?: PaymentActionRequired;
  [key: string]: unknown;
}

/** sessionStorage key used to bridge the 3DS challenge: we write the order
 *  id before navigating to the bank's challenge page, and the thank-you page
 *  reads it back on return to mint a fresh thank-you JWT. Exported so the
 *  thank-you hook can import the same constant. */
export const PENDING_PAYMENT_SESSION_KEY = "cpay_pending_payment";

/** Payments older than this are ignored when reading the sessionStorage
 *  hint. A 3DS challenge should never take this long, and a stale entry
 *  usually means the user abandoned the flow and came back much later. */
export const PENDING_PAYMENT_MAX_AGE_MS = 30 * 60 * 1000;

export interface PendingPaymentSessionEntry {
  /** cpay payment id of the in-flight payment — the key for resuming the
   *  flow on the thank-you page after a 3DS challenge. */
  payment_id: string;
  saved_at: number;
}

export interface PaymentErrorResponse {
  error?: boolean;
  message?: string;
}

export interface UseCheckoutPaymentResult {
  status: CheckoutPaymentStatus;
  error: Error | null;
  result: PaymentResponse | null;
  pay: (
    component: ConvesioPayComponent,
    payload: PaymentPayload,
  ) => Promise<void>;
  reset: () => void;
}

// Intentionally duplicated in useThankYouPayment.ts and
// worker/handlers/payments/shared.ts — the SPA and worker bundle separately
// so they cannot share a module. Keep all three in sync when adding statuses.
const SUCCESS_STATUSES = new Set(["Succeeded", "Authorized", "Authorised"]);
const PENDING_STATUSES = new Set(["Pending"]);

export function useCheckoutPayment(): UseCheckoutPaymentResult {
  const [status, setStatus] = useState<CheckoutPaymentStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<PaymentResponse | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setResult(null);
  }, []);

  const pay = useCallback(
    async (component: ConvesioPayComponent, payload: PaymentPayload) => {
      setStatus("processing");
      setError(null);
      setResult(null);

      let paymentToken: string;
      try {
        paymentToken = await component.createToken();
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus("failed");
        return;
      }

      let response: Response;
      try {
        response = await fetch("/payments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ paymentToken, ...payload }),
        });
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        setStatus("failed");
        return;
      }

      let body: (PaymentResponse & PaymentErrorResponse) | null = null;
      try {
        body = (await response.json()) as PaymentResponse & PaymentErrorResponse;
      } catch {
        body = null;
      }

      if (!response.ok || body?.error) {
        const message =
          body?.message ??
          `Payment request failed (${response.status} ${response.statusText})`;
        setError(new Error(message));
        setStatus("failed");
        return;
      }

      // 3DS handoff: ConvesioPay flagged the payment and wants the user to
      // complete a challenge on their hosted verify-customer page. Stash the
      // payment id in sessionStorage so `/thank-you` can mint a JWT via
      // `/issue-token` on return, then navigate out. The processing dialog is
      // intentionally kept up — it visually covers the handoff.
      if (body?.actionRequired?.redirectUrl && body.id) {
        setResult(body);
        try {
          const entry: PendingPaymentSessionEntry = {
            payment_id: body.id,
            saved_at: Date.now(),
          };
          window.sessionStorage.setItem(
            PENDING_PAYMENT_SESSION_KEY,
            JSON.stringify(entry),
          );
        } catch {
          // sessionStorage disabled / quota exceeded — the SPA falls back to
          // reading `?paymentId=` from the return URL if available.
        }
        window.location.assign(body.actionRequired.redirectUrl);
        return;
      }

      if (
        body &&
        body.status &&
        !SUCCESS_STATUSES.has(body.status) &&
        !PENDING_STATUSES.has(body.status)
      ) {
        setError(
          new Error(`Payment ${body.status.toLowerCase()}. Please try again.`),
        );
        setResult(body);
        setStatus("failed");
        return;
      }

      setResult(body);

      // Success or pending → hand off to the thank-you page. We keep status
      // at "processing" so the non-dismissable processing modal stays up
      // until the browser navigates, avoiding a flash of the old
      // success/pending modal mid-redirect.
      if (body?.redirectUrl) {
        window.location.assign(body.redirectUrl);
        return;
      }

      setStatus(
        body?.status && PENDING_STATUSES.has(body.status)
          ? "pending"
          : "success",
      );
    },
    [],
  );

  return { status, error, result, pay, reset };
}
