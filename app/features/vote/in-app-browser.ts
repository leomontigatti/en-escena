/**
 * The apps whose built-in browser Google refuses to sign in from
 * (`disallowed_useragent`), and what each puts in its user agent. Instagram
 * goes first: its Android agent can carry Facebook's marks too.
 */
const inAppBrowserApps = [
  { app: "Instagram", pattern: /\bInstagram\b/ },
  { app: "Facebook", pattern: /\b(FBAN|FBAV|FB_IAB)\// },
  { app: "TikTok", pattern: /\b(BytedanceWebview|musical_ly|TikTok)\b/ },
] as const;

export type InAppBrowser = {
  /**
   * On Android, an address that hands the page to the phone's own browser;
   * on an iPhone there is none, and the visitor opens it from the app's menu.
   */
  androidIntentUrl: string | null;
  app: (typeof inAppBrowserApps)[number]["app"];
};

/**
 * The app whose built-in browser is showing `url`, read from its user agent,
 * or null in a phone's own browser, where the sign-in with Google works.
 */
export function readInAppBrowser(
  userAgent: string | null,
  url: string,
): InAppBrowser | null {
  const match = inAppBrowserApps.find(({ pattern }) =>
    pattern.test(userAgent ?? ""),
  );

  if (!match) {
    return null;
  }

  return {
    androidIntentUrl: /\bAndroid\b/.test(userAgent ?? "")
      ? buildAndroidIntentUrl(url)
      : null,
    app: match.app,
  };
}

/** The same address as an Android intent with no app named: the default browser. */
function buildAndroidIntentUrl(url: string) {
  const { host, pathname, protocol, search } = new URL(url);

  return `intent://${host}${pathname}${search}#Intent;scheme=${protocol.slice(0, -1)};end`;
}
