/**
 * Quiet network resolution for service-worker routes whose failure is
 * routine (e.g. the connectivity probe failing by design while offline).
 *
 * Maps any failure — rejection, synchronous throw, or nullish result — to
 * an opaque network error (`Response.error()`), so the worker never leaks
 * an unhandled `no-response` rejection into the console. Never synthesizes
 * a success status and never touches any cache: callers (like the
 * connectivity machine, which treats any fetch failure as offline) keep
 * observing genuine failures.
 */
export async function resolveQuietly(
  attempt: () => Promise<Response | null | undefined>,
): Promise<Response> {
  try {
    return (await attempt()) ?? Response.error();
  } catch {
    return Response.error();
  }
}
