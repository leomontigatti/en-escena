import { describe, expect, test } from "vitest";

import { renderVoteCodeQrSvg, renderVoteCodeSheet } from "./sheet";

const sheet = {
  issuedAt: new Date("2026-10-21T22:00:00Z"),
  number: 3,
  tokens: ["tokenA", "tokenB", "tokenC"],
  voidedAt: null,
};

/** Stands in for the QR encoder: an SVG that says which URL it encodes. */
async function fakeQr(url: string) {
  return `<svg data-url="${url}"></svg>`;
}

describe("the printable sheet of a batch of QR codes", () => {
  test("draws one QR per code, each encoding the vote URL with its token", async () => {
    const html = await renderVoteCodeSheet({
      origin: "https://sistema.enescena.com.ar",
      renderQr: fakeQr,
      sheet,
    });

    expect(
      [...html.matchAll(/data-url="([^"]+)"/g)].map((match) => match[1]),
    ).toEqual([
      "https://sistema.enescena.com.ar/votar?codigo=tokenA",
      "https://sistema.enescena.com.ar/votar?codigo=tokenB",
      "https://sistema.enescena.com.ar/votar?codigo=tokenC",
    ]);
  });

  test("names the batch on every code, so a lost print run can be told apart", async () => {
    const html = await renderVoteCodeSheet({
      origin: "https://sistema.enescena.com.ar",
      renderQr: fakeQr,
      sheet,
    });

    expect(html.match(/Lote 3 · \d+\/3/g)).toEqual([
      "Lote 3 · 1/3",
      "Lote 3 · 2/3",
      "Lote 3 · 3/3",
    ]);
  });

  test("puts twenty codes on each A4 sheet", async () => {
    const html = await renderVoteCodeSheet({
      origin: "https://sistema.enescena.com.ar",
      renderQr: fakeQr,
      sheet: {
        ...sheet,
        tokens: Array.from({ length: 41 }, (_, i) => `t${i}`),
      },
    });

    expect(html.match(/<section class="sheet"/g)).toHaveLength(3);
  });

  test("encodes a real QR code per token", async () => {
    const html = await renderVoteCodeSheet({
      origin: "https://sistema.enescena.com.ar",
      renderQr: renderVoteCodeQrSvg,
      sheet,
    });

    expect(html.match(/<svg/g)).toHaveLength(3);
  });
});
