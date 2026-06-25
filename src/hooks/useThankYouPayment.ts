/**
 * useThankYouPayment
 * -----------------------------------------------------------------------------
 * Drives the thank-you page's "is the payment done yet?" lifecycle for the
 * stateless checkout.
 *
 * Inputs: a canonical `?token=<jwt>` from the URL, and an optional
 * `paymentIdHint` (a `?paymentId=` query param ConvesioPay may append on a 3DS
 * return, or the value stashed in sessionStorage by `useCheckoutPayment`).
 *
 * Flow:
 *   1. With a `token`, POST `/verify-token` to decode it. The decoded body
 *      includes the receipt context (items/shipping/customer) the worker
 *      embedded at `/payments` time.
 *      - `payment_id` present → normal thank-you token: verify + poll.
 *      - `payment_id` empty   → the "marker" token from the 3DS return URL.
 *        Resume via step 2 (the context is retained for the receipt).
 *   2. Resume: take the `payment_id` from the `?paymentId=` param or the
 *      sessionStorage bridge, POST `/issue-token` (passing the marker token as
 *      `context_token` so the receipt survives), rewrite the URL to
 *      `?token=<jwt>`, then verify + poll as normal.
 *   3. Terminal status → done. "Pending" → poll `/poll-payment` every 5s with
 *      `{ payment_id }` until terminal.
 * -----------------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from "react";

import {
  PENDING_PAYMENT_MAX_AGE_MS,
  PENDING_PAYMENT_SESSION_KEY,
  type PendingPaymentSessionEntry,
} from "@/hooks/useCheckoutPayment";

export type ThankYouState = "verifying" | "pending" | "succeeded" | "failed";

export interface CheckoutTokenPayload {
  payment_id: string;
  customer_id: string;
  order_number: string;
  status: string;
}

export interface ShippingAddress {
  houseNumberOrName: string;
  street: string;
  city: string;
  stateOrProvince: string;
  postalCode: string;
  country: string;
}

/** Aggregated line item embedded in the thank-you JWT. Amounts are in minor
 *  units (cents). */
export interface OrderLineItem {
  sku: string;
  description: string;
  quantity: number;
  amountMinor: number;
}

/** Receipt context decoded from the verified token. */
export interface OrderContext {
  order_number: string;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  shipping_address: ShippingAddress | null;
  items: OrderLineItem[];
}

export interface UseThankYouPaymentOptions {
  token: string | null;
  paymentIdHint: string | null;
}

export interface UseThankYouPaymentResult {
  state: ThankYouState;
  payload: CheckoutTokenPayload | null;
  context: OrderContext | null;
  error: Error | null;
}

type VerifyTokenResponseBody = CheckoutTokenPayload &
  Partial<OrderContext> & {
    error?: boolean;
    message?: string;
  };

function orderContextFromVerifyBody(
  body: VerifyTokenResponseBody,
): OrderContext {
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items: OrderLineItem[] = rawItems.map((row) => {
    const r = row as unknown as Record<string, unknown>;
    return {
      sku: String(r.sku ?? ""),
      description: String(r.description ?? ""),
      quantity: Number(r.quantity ?? 1),
      amountMinor: Number(r.amountMinor ?? 0),
    };
  });
  return {
    order_number: body.order_number ?? "",
    customer_email: body.customer_email ?? null,
    customer_name: body.customer_name ?? null,
    customer_phone: body.customer_phone ?? null,
    shipping_address: body.shipping_address ?? null,
    items,
  };
}

// Intentionally duplicated in useCheckoutPayment.ts and
// worker/handlers/payments/shared.ts — the SPA and worker bundle separately.
const SUCCESS_STATUSES = new Set(["Succeeded", "Authorized"]);
const PENDING_STATUSES = new Set(["Pending"]);

const POLL_INTERVAL_MS = 5000;

function classify(status: string | undefined): ThankYouState {
  if (status && SUCCESS_STATUSES.has(status)) return "succeeded";
  if (status && PENDING_STATUSES.has(status)) return "pending";
  return "failed";
}

function readPendingPaymentHint(): PendingPaymentSessionEntry | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(PENDING_PAYMENT_SESSION_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as { payment_id?: unknown }).payment_id !== "string" ||
    !(parsed as { payment_id: string }).payment_id
  ) {
    return null;
  }

  const entry = parsed as PendingPaymentSessionEntry;

  if (
    typeof entry.saved_at === "number" &&
    Date.now() - entry.saved_at > PENDING_PAYMENT_MAX_AGE_MS
  ) {
    try {
      window.sessionStorage.removeItem(PENDING_PAYMENT_SESSION_KEY);
    } catch {
      // ignore
    }
    return null;
  }

  return entry;
}

function clearPendingPaymentHint(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_PAYMENT_SESSION_KEY);
  } catch {
    // ignore
  }
}

function promoteTokenToUrl(token: string): void {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("token", token);
    window.history.replaceState(null, "", url.toString());
  } catch {
    // ignore — URL rewriting is purely cosmetic
  }
}

export function useThankYouPayment(
  options: UseThankYouPaymentOptions,
): UseThankYouPaymentResult {
  const { token: initialToken, paymentIdHint } = options;

  const [state, setState] = useState<ThankYouState>(() => {
    if (initialToken) return "verifying";
    if (paymentIdHint) return "verifying";
    if (readPendingPaymentHint()) return "verifying";
    return "failed";
  });
  const [payload, setPayload] = useState<CheckoutTokenPayload | null>(null);
  const [context, setContext] = useState<OrderContext | null>(null);
  const [error, setError] = useState<Error | null>(() => {
    if (initialToken) return null;
    if (paymentIdHint) return null;
    if (readPendingPaymentHint()) return null;
    return new Error("Missing confirmation token.");
  });

  const payloadRef = useRef<CheckoutTokenPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const stopPolling = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const poll = async () => {
      const current = payloadRef.current;
      if (!current) return;

      let response: Response;
      try {
        response = await fetch("/poll-payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ payment_id: current.payment_id }),
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setState("failed");
        stopPolling();
        return;
      }

      let body: { status?: string; error?: boolean; message?: string } | null =
        null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (cancelled) return;

      if (!response.ok || body?.error) {
        setError(
          new Error(
            body?.message ??
              `Payment status check failed (${response.status} ${response.statusText})`,
          ),
        );
        setState("failed");
        stopPolling();
        return;
      }

      if (!body?.status) return; // treat missing status as still pending — keep polling
      const next = classify(body?.status);
      if (next === "pending") return; // keep polling
      setState(next);
      if (next === "failed") {
        setError(new Error(`Payment ${(body?.status ?? "failed").toLowerCase()}.`));
      }
      stopPolling();
    };

    const verifyToken = async (tokenToVerify: string) => {
      let response: Response;
      try {
        response = await fetch("/verify-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ token: tokenToVerify }),
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setState("failed");
        return;
      }

      let body: VerifyTokenResponseBody | null = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (cancelled) return;

      if (!response.ok || body?.error || !body) {
        setError(
          new Error(
            body?.message ??
              `Could not verify confirmation token (${response.status} ${response.statusText})`,
          ),
        );
        setState("failed");
        return;
      }

      const decoded: CheckoutTokenPayload = {
        payment_id: body.payment_id,
        customer_id: body.customer_id,
        order_number: body.order_number,
        status: body.status,
      };

      // Retain the embedded receipt context for the summary, regardless of
      // which branch we take next.
      setContext(orderContextFromVerifyBody(body));

      // Marker token from the 3DS return URL: no `payment_id` yet. Resolve one
      // and swap for a real token, passing this marker as `context_token` so
      // the new token keeps the receipt.
      if (!decoded.payment_id) {
        const hint =
          paymentIdHint ?? readPendingPaymentHint()?.payment_id ?? null;
        if (!hint) {
          setError(
            new Error("Could not resolve a payment id to resume verification."),
          );
          setState("failed");
          return;
        }
        await resumeFromPaymentId(hint, tokenToVerify);
        return;
      }

      payloadRef.current = decoded;
      setPayload(decoded);

      const next = classify(decoded.status);
      setState(next);

      if (next === "pending") {
        void poll();
        intervalId = setInterval(() => {
          void poll();
        }, POLL_INTERVAL_MS);
      }
    };

    const resumeFromPaymentId = async (
      paymentId: string,
      contextToken: string | null,
    ) => {
      let response: Response;
      try {
        response = await fetch("/issue-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            payment_id: paymentId,
            context_token: contextToken ?? undefined,
          }),
        });
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setState("failed");
        return;
      }

      let body: { token?: string; error?: boolean; message?: string } | null =
        null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (cancelled) return;

      if (!response.ok || body?.error || !body?.token) {
        setError(
          new Error(
            body?.message ??
              `Could not resume payment verification (${response.status} ${response.statusText})`,
          ),
        );
        setState("failed");
        return;
      }

      promoteTokenToUrl(body.token);
      clearPendingPaymentHint();

      await verifyToken(body.token);
    };

    (async () => {
      if (initialToken) {
        await verifyToken(initialToken);
        return;
      }

      const hint = paymentIdHint ?? readPendingPaymentHint()?.payment_id ?? null;
      if (hint) {
        await resumeFromPaymentId(hint, null);
        return;
      }

      if (cancelled) return;
      setState("failed");
      setError(new Error("Missing confirmation token."));
    })();

    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [initialToken, paymentIdHint]);

  return { state, payload, context, error };
}
