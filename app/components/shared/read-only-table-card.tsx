import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ReadOnlyTableColumn<Row> = {
  cellClassName?: string;
  header: ReactNode;
  headerClassName?: string;
  id: string;
  render: (row: Row) => ReactNode;
};

type ReadOnlyTableCardProps<Row> = {
  columns: ReadOnlyTableColumn<Row>[];
  getRowKey: (row: Row) => string;
  rows: Row[];
  title: string;
};

export function ReadOnlyTableCard<Row>({
  columns,
  getRowKey,
  rows,
  title,
}: ReadOnlyTableCardProps<Row>) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column.id} className={column.headerClassName}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={getRowKey(row)}>
                {columns.map((column) => (
                  <TableCell key={column.id} className={column.cellClassName}>
                    {column.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
