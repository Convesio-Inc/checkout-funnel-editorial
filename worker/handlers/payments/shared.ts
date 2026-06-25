import type { ReceiptLineItem } from '../../jwt';
import { json } from '../common';

const CPAY_API_HOSTS = {
  live: 'https://api.convesiopay.com',
  test: 'https://api-qa.convesiopay.com',
} as const;

export function paymentsEndpoint(environment: 'test' | 'live'): string {
  return `${CPAY_API_HOSTS[environment]}/v1/payments`;
}

export function singlePaymentEndpoint(
  environment: 'test' | 'live',
  paymentId: string,
): string {
  return `${CPAY_API_HOSTS[environment]}/v1/payments/${encodeURIComponent(paymentId)}`;
}

export function resolveEnvironment(env: Env): 'test' | 'live' {
  return env.CPAY_ENVIRONMENT === 'live' ? 'live' : 'test';
}

// Intentionally duplicated in src/hooks/useCheckoutPayment.ts and
// src/hooks/useThankYouPayment.ts — the SPA bundles separately and cannot
// import from the worker. Keep all three in sync when adding statuses.
export const SUCCESS_STATUSES = new Set(['Succeeded', 'Authorized']);
export const PENDING_STATUSES = new Set(['Pending']);

export interface PaymentRequestBody {
  paymentToken: string;
  email: string;
  name: string;
  amount: number;
  currency: string;
  orderNumber?: string;
  returnUrl?: string;
  phone?: { number: string; countryCode: string };
  billingAddress?: Record<string, unknown>;
  shippingAddress?: Record<string, unknown>;
  lineItems?: Array<Record<string, unknown>>;
  captureMethod?: 'automatic' | 'manual';
}

export const REQUIRED_FIELDS: Array<keyof PaymentRequestBody> = [
  'paymentToken',
  'email',
  'name',
  'amount',
  'currency',
];

export interface UpstreamActionRequired {
  type?: string;
  redirectUrl?: string;
  [key: string]: unknown;
}

export interface UpstreamPaymentResponse {
  id?: string;
  orderNumber?: string;
  status?: string;
  customerId?: string;
  customer?: { id?: string };
  actionRequired?: UpstreamActionRequired;
  error?: boolean;
  message?: string;
  [key: string]: unknown;
}

export function requireSecret(env: Env): Response | string {
  const secret = env.CPAY_SECRET?.trim();
  if (!secret) {
    return json(
      {
        error: true,
        message:
          'Worker is missing CPAY_SECRET. Set it via `wrangler secret put` or your `.env` / `.dev.vars`.',
      },
      { status: 500 },
    );
  }
  return secret;
}

export interface ReceiptContext {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: Record<string, unknown> | null;
  items: ReceiptLineItem[];
}

export function buildCustomerPhone(
  phone: PaymentRequestBody['phone'],
): string {
  if (!phone) return '';
  const prefix = phone.countryCode?.trim() ?? '';
  const number = phone.number?.trim() ?? '';
  if (!prefix && !number) return '';
  return `${prefix} ${number}`.trim();
}

export function buildReceiptItems(
  lineItems: PaymentRequestBody['lineItems'],
): ReceiptLineItem[] {
  if (!Array.isArray(lineItems)) return [];
  return lineItems.map((raw) => {
    const item = raw as Record<string, unknown>;
    return {
      sku: String(item.sku ?? ''),
      description: String(item.description ?? ''),
      quantity: Number(item.quantity ?? 1),
      amountMinor: Number(item.amountIncludingTax ?? 0),
    };
  });
}

export function buildReceiptContext(body: PaymentRequestBody): ReceiptContext {
  return {
    customer_name: body.name,
    customer_email: body.email,
    customer_phone: buildCustomerPhone(body.phone),
    shipping_address: body.shippingAddress ?? null,
    items: buildReceiptItems(body.lineItems),
  };
}
