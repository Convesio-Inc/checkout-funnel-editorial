import { handleConfig } from './handlers/config/config';
import { handleIssueToken } from './handlers/payments/issue-token';
import { handlePayments } from './handlers/payments/payments';
import { handlePollPayment } from './handlers/payments/poll-payment';
import { handleVerifyToken } from './handlers/payments/verify-token';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/config' && request.method === 'GET') {
      return handleConfig(env);
    }

    if (url.pathname === '/payments' && request.method === 'POST') {
      return handlePayments(request, env);
    }

    if (url.pathname === '/verify-token' && request.method === 'POST') {
      return handleVerifyToken(request, env);
    }

    if (url.pathname === '/issue-token' && request.method === 'POST') {
      return handleIssueToken(request, env);
    }

    if (url.pathname === '/poll-payment' && request.method === 'POST') {
      return handlePollPayment(request, env);
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
