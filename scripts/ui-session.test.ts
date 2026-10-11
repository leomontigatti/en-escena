import { describe, expect, it } from "vitest";

import { loginCommands, parseArgs, worktreeEnv } from "./ui-session";

describe("parseArgs", () => {
  it("takes a seeded role and an app path", () => {
    expect(parseArgs(["academy", "/portal/coreografias"])).toEqual({
      role: "academy",
      email: "academia@enescena.local",
      path: "/portal/coreografias",
    });
  });

  it("keeps a query string and ignores pnpm's `--`", () => {
    expect(parseArgs(["--", "admin", "/admin/eventos?estado=activo"])).toEqual({
      role: "admin",
      email: "admin@enescena.local",
      path: "/admin/eventos?estado=activo",
    });
  });

  it("refuses a role the seed has no account for, naming the ones it has", () => {
    expect(() => parseArgs(["superuser", "/admin"])).toThrow(
      /admin, academy, auditor, judge/,
    );
  });

  it("refuses a path that is not an app path", () => {
    expect(() => parseArgs(["admin", "http://localhost:5173/admin"])).toThrow(
      /starting with \//,
    );
    expect(() => parseArgs(["admin"])).toThrow(/usage/);
  });
});

describe("loginCommands", () => {
  it("opens a fresh session named for the role, signs in through the form and lands on the path", () => {
    expect(
      loginCommands({
        role: "judge",
        email: "jurado@enescena.local",
        password: "pw",
        origin: "http://localhost:5301",
        path: "/jurado",
      }),
    ).toEqual({
      open: [
        ["-s=judge", "open", "http://localhost:5301/ingresar"],
        ["-s=judge", "resize", "1440", "900"],
      ],
      signIn: [
        ["-s=judge", "fill", "input[name=identifier]", "jurado@enescena.local"],
        ["-s=judge", "fill", "input[name=password]", "pw", "--submit"],
      ],
      land: [
        ["-s=judge", "goto", "http://localhost:5301/jurado"],
        ["-s=judge", "state-save", ".playwright-cli/judge-state.json"],
      ],
    });
  });
});

describe("worktreeEnv", () => {
  it("puts the worktree's .env.local over what this process loaded from .env", () => {
    const env = worktreeEnv(
      {
        DATABASE_URL: "postgres://postgres:pw@localhost:5432/en-escena",
        PORT: "5173",
        HOME: "/home/x",
      },
      [
        "# Written by `pnpm db:worktree`",
        'DATABASE_URL="postgres://postgres:pw@localhost:5432/en-escena-wt-x"',
        'PORT="5301"',
      ].join("\n"),
    );

    expect(env).toMatchObject({
      DATABASE_URL: "postgres://postgres:pw@localhost:5432/en-escena-wt-x",
      PORT: "5301",
      HOME: "/home/x",
    });
  });

  it("keeps the process's own environment when there is no .env.local", () => {
    expect(worktreeEnv({ PORT: "5173" }, null)).toEqual({ PORT: "5173" });
  });
});
