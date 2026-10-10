import { describe, expect, test } from "vitest";

import { readInAppBrowser } from "./in-app-browser";

const voteUrl = "https://sistema.enescena.com.ar/votar";

const userAgents = {
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]",
  facebookIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0.0.0;]",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 Instagram 350.0.0.0 Android (34/14; 420dpi; 1080x2400; Google; Pixel 8)",
  instagramIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0 (iPhone15,2; iOS 17_6; es_AR; es; scale=3.00; 1179x2556)",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  tiktokAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 trill_350000 BytedanceWebview/d8a21c6",
};

describe("readInAppBrowser", () => {
  test.each([
    { userAgent: userAgents.chromeAndroid },
    { userAgent: userAgents.safariIphone },
    { userAgent: null },
  ])("finds no app in a phone's own browser", ({ userAgent }) => {
    expect(readInAppBrowser(userAgent, voteUrl)).toBeNull();
  });

  test.each([
    { app: "Instagram", userAgent: userAgents.instagramIphone },
    { app: "Facebook", userAgent: userAgents.facebookIphone },
  ] as const)(
    "names $app on an iPhone, with no way to open the browser for the visitor",
    ({ app, userAgent }) => {
      expect(readInAppBrowser(userAgent, voteUrl)).toEqual({
        androidIntentUrl: null,
        app,
      });
    },
  );

  test.each([
    { app: "Instagram", userAgent: userAgents.instagramAndroid },
    { app: "Facebook", userAgent: userAgents.facebookAndroid },
    { app: "TikTok", userAgent: userAgents.tiktokAndroid },
  ] as const)(
    "names $app on Android, with an intent that opens the page in the phone's browser",
    ({ app, userAgent }) => {
      expect(readInAppBrowser(userAgent, voteUrl)).toEqual({
        androidIntentUrl:
          "intent://sistema.enescena.com.ar/votar#Intent;scheme=https;end",
        app,
      });
    },
  );
});
