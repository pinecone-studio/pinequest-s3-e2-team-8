export function isAuthorizedCronRequest(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const authorization = request.headers.get("authorization")?.trim();
  const headerSecret = request.headers.get("x-cron-secret")?.trim();
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("cronSecret")?.trim();

  return (
    authorization === `Bearer ${cronSecret}` ||
    headerSecret === cronSecret ||
    querySecret === cronSecret
  );
}
