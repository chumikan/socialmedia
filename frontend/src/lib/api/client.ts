export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
export const changes = new EventTarget();
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown
): Promise<T> {
  const multipart = body instanceof FormData;
  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'same-origin',
    headers: {
      'X-SNS-Request': '1',
      ...(!multipart && body !== undefined
        ? { 'Content-Type': 'application/json' }
        : {})
    },
    body:
      body === undefined ? undefined : multipart ? body : JSON.stringify(body)
  });
  const data: unknown = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      (data as { error?: string }).error ?? 'Request failed'
    );
  if (method !== 'GET' && path !== '/query')
    changes.dispatchEvent(new Event('change'));
  return data as T;
}
