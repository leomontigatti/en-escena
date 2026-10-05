import type { SheetColumn } from "@/features/admin/day-export/sheet";

/**
 * The academies as a spreadsheet: one row per academy, with what the auditor
 * needs to contact it.
 */

export type AcademiesExportRow = {
  contactName: string;
  email: string;
  name: string;
  phone: string;
};

export const academiesExportColumns: SheetColumn<AcademiesExportRow>[] = [
  { header: "Academia", width: 30, cell: (row) => row.name },
  { header: "Responsable", width: 28, cell: (row) => row.contactName },
  // Text, so the number keeps its leading zero.
  { header: "Teléfono", width: 16, cell: (row) => row.phone },
  { header: "Email de acceso", width: 32, cell: (row) => row.email },
];
