const ALLOWED_PUSH_HOSTS = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "updates.push.services.mozilla.com",
  "autopush.mozilla.org",
  "web.push.apple.com",
  "notify.windows.com",
] as const;

function isAllowedPushHost(hostname: string) {
  return ALLOWED_PUSH_HOSTS.some((allowedHost) =>
    hostname === allowedHost || hostname.endsWith(`.${allowedHost}`),
  );
}

export function isAllowedPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && (!url.port || url.port === "443")
      && isAllowedPushHost(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
