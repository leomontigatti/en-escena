import { DataTableTruncatedText } from "@/components/shared/data-table-truncated-text";
import type { DataTableColumn } from "@/components/shared/data-table.shared";
import { formatCategoryAndGroupType } from "@/lib/choreographies/classification";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

type ChoreographyClassification = {
  modalityName: string;
  submodalityName: string | null;
  categoryName: string;
  groupType: ChoreographyGroupType;
};

/**
 * The "Modalidad / Submodalidad" and "Categoría / Tipo de grupo" columns every
 * choreography and presentation list shows, muted and cut to their width.
 *
 * `widths` are the two columns' weights in a `fit` table.
 */
export function choreographyClassificationColumns<
  TRow extends ChoreographyClassification,
>({
  widths = { modality: 21, categoryGroup: 20 },
}: {
  widths?: { modality: number; categoryGroup: number };
} = {}): (DataTableColumn<TRow> & { width: number })[] {
  return [
    {
      id: "modality",
      header: "Modalidad / Submodalidad",
      width: widths.modality,
      className: "text-muted-foreground",
      cell: (row) => (
        <DataTableTruncatedText
          value={formatPrimaryAndSecondaryValue(
            row.modalityName,
            row.submodalityName,
          )}
        />
      ),
    },
    {
      id: "categoryGroup",
      header: "Categoría / Tipo de grupo",
      width: widths.categoryGroup,
      className: "text-muted-foreground",
      cell: (row) => (
        <DataTableTruncatedText
          value={formatCategoryAndGroupType(row.categoryName, row.groupType)}
        />
      ),
    },
  ];
}
