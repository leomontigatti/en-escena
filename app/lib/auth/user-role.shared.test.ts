import { describe, expect, test } from "vitest";

import { userRole } from "@/db/schema";
import {
  canDownloadAuditorExports,
  canEnterIndividualArea,
  canEnterJudgePanel,
  canEnterPortal,
  canReadAdminPanel,
  canWriteInAdminPanel,
  getLandingPath,
  internalUserRoleOptions,
  isInternalUserRole,
  isUserRole,
  userRoleOptions,
  type UserRole,
} from "@/lib/auth/user-role.shared";

describe("user role", () => {
  test.each<
    [
      UserRole,
      {
        adminPanelRead: boolean;
        adminPanelWrite: boolean;
        auditorExports: boolean;
        individualArea: boolean;
        internal: boolean;
        judgePanel: boolean;
        landingPath: string;
        portal: boolean;
      },
    ]
  >([
    [
      "admin",
      {
        adminPanelRead: true,
        adminPanelWrite: true,
        auditorExports: false,
        individualArea: false,
        internal: true,
        judgePanel: false,
        landingPath: "/administracion",
        portal: false,
      },
    ],
    [
      "auditor",
      {
        adminPanelRead: true,
        adminPanelWrite: false,
        auditorExports: true,
        individualArea: false,
        internal: true,
        judgePanel: false,
        landingPath: "/administracion",
        portal: false,
      },
    ],
    [
      "judge",
      {
        adminPanelRead: false,
        adminPanelWrite: false,
        auditorExports: false,
        individualArea: false,
        internal: true,
        judgePanel: true,
        landingPath: "/juzgamiento",
        portal: false,
      },
    ],
    [
      "academy",
      {
        adminPanelRead: false,
        adminPanelWrite: false,
        auditorExports: false,
        individualArea: false,
        internal: false,
        judgePanel: false,
        landingPath: "/portal",
        portal: true,
      },
    ],
    [
      "individual",
      {
        adminPanelRead: false,
        adminPanelWrite: false,
        auditorExports: false,
        individualArea: true,
        internal: false,
        judgePanel: false,
        landingPath: "/particular",
        portal: false,
      },
    ],
  ])("decides what %s may do", (role, expected) => {
    expect({
      adminPanelRead: canReadAdminPanel(role),
      adminPanelWrite: canWriteInAdminPanel(role),
      auditorExports: canDownloadAuditorExports(role),
      individualArea: canEnterIndividualArea(role),
      internal: isInternalUserRole(role),
      judgePanel: canEnterJudgePanel(role),
      landingPath: getLandingPath(role),
      portal: canEnterPortal(role),
    }).toEqual(expected);
  });

  test("offers every stored role once, and only internal ones to internal users", () => {
    expect(userRoleOptions.map((option) => option.value).sort()).toEqual(
      [...userRole.enumValues].sort(),
    );
    expect(userRole.enumValues.every(isUserRole)).toBe(true);
    expect(isUserRole("superadmin")).toBe(false);
    expect(
      internalUserRoleOptions.every((option) =>
        isInternalUserRole(option.value),
      ),
    ).toBe(true);
    expect(internalUserRoleOptions).toHaveLength(
      userRole.enumValues.filter(isInternalUserRole).length,
    );
  });
});
