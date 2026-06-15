import {
  CartRoverService,
  type CartRoverListOrdersArgs,
} from '../../services/cart-rover';
import {
  json,
  parseOptionalPositiveInteger,
  parseOptionalYesNo,
  withPaginationHeaders,
} from '../common';
import { readAuthenticatedSession, unauthorizedResponse } from '../auth/shared';

const CARTROVER_ORDER_SOURCE = 'fulfillment-checkout-v2';
const CARTROVER_LIST_ORDER_STATUSES = [
  'new',
  'at_wms',
  'new_or_at_wms',
  'partial',
  'shipped',
  'confirmed',
  'shipped_or_confirmed',
  'error',
  'canceled',
  'any',
] as const satisfies ReadonlyArray<NonNullable<CartRoverListOrdersArgs['status']>>;

type CartRoverListOrderStatus = (typeof CARTROVER_LIST_ORDER_STATUSES)[number];

export async function handleListOrders(
  request: Request,
  env: Env,
): Promise<Response> {
  const session = await readAuthenticatedSession(request, env);
  if (session instanceof Response) return session;
  if (!session) return unauthorizedResponse();

  const url = new URL(request.url);
  const statusRaw = url.searchParams.get('status')?.trim();
  const fromDate = url.searchParams.get('from_date')?.trim();
  const toDate = url.searchParams.get('to_date')?.trim();

  const limitParam = parseOptionalPositiveInteger(url.searchParams.get('limit'), 'limit');
  if (limitParam instanceof Response) return limitParam;
  if (typeof limitParam === 'number' && limitParam > 100) {
    return json(
      {
        error: true,
        message: 'Invalid `limit` query param. Maximum value is 100.',
      },
      { status: 400 },
    );
  }

  const pageParam = parseOptionalPositiveInteger(url.searchParams.get('page'), 'page');
  if (pageParam instanceof Response) return pageParam;

  const includeFilteredItems = parseOptionalYesNo(
    url.searchParams.get('include_filtered_items'),
    'include_filtered_items',
  );
  if (includeFilteredItems instanceof Response) return includeFilteredItems;

  const includeOrderExtras = parseOptionalYesNo(
    url.searchParams.get('include_order_extras'),
    'include_order_extras',
  );
  if (includeOrderExtras instanceof Response) return includeOrderExtras;

  const includeLineExtras = parseOptionalYesNo(
    url.searchParams.get('include_line_extras'),
    'include_line_extras',
  );
  if (includeLineExtras instanceof Response) return includeLineExtras;

  const includeAliases = parseOptionalYesNo(
    url.searchParams.get('include_aliases'),
    'include_aliases',
  );
  if (includeAliases instanceof Response) return includeAliases;

  let status: CartRoverListOrderStatus | undefined;
  if (statusRaw) {
    if (
      !CARTROVER_LIST_ORDER_STATUSES.includes(
        statusRaw as CartRoverListOrderStatus,
      )
    ) {
      return json(
        {
          error: true,
          message: `Invalid \`status\` query param. Use one of: ${CARTROVER_LIST_ORDER_STATUSES.join(', ')}.`,
        },
        { status: 400 },
      );
    }
    status = statusRaw as CartRoverListOrderStatus;
  }

  const cartRoverArgs: CartRoverListOrdersArgs = {
    order_source: CARTROVER_ORDER_SOURCE,
  };
  if (status) cartRoverArgs.status = status;
  if (fromDate) cartRoverArgs.from_date = fromDate;
  if (toDate) cartRoverArgs.to_date = toDate;
  if (typeof limitParam === 'number') cartRoverArgs.limit = limitParam;
  if (typeof pageParam === 'number') cartRoverArgs.page = pageParam;
  if (includeFilteredItems) cartRoverArgs.include_filtered_items = includeFilteredItems;
  if (includeOrderExtras) cartRoverArgs.include_order_extras = includeOrderExtras;
  if (includeLineExtras) cartRoverArgs.include_line_extras = includeLineExtras;
  if (includeAliases) cartRoverArgs.include_aliases = includeAliases;

  const cartRover = new CartRoverService(
    env.CARTROVER_API_USER,
    env.CARTROVER_API_KEY,
  );

  try {
    const { data, totalRecords } = await cartRover.listOrders(cartRoverArgs);
    const page = typeof pageParam === 'number' ? pageParam : 1;
    const pageSize = typeof limitParam === 'number' ? limitParam : 20;
    const total = totalRecords ?? data.response.length;
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 0;

    const response = json(data);
    return withPaginationHeaders(
      response,
      url,
      {
        page,
        pageSize,
        total,
        totalPages,
      },
      { pageParam: 'page', pageSizeParam: 'limit' },
    );
  } catch (err) {
    return json(
      {
        error: true,
        message: `Unable to load orders: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 502 },
    );
  }
}
