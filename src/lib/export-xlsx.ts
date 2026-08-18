"use client";

import * as XLSX from "xlsx";

/**
 * Turns a flat list of plain objects into a downloaded .xlsx file. Column
 * widths are sized to their content so the sheet is readable without the
 * user resizing every column by hand first.
 */
export function exportRowsToXlsx(
  filename: string,
  sheetName: string,
  rows: Record<string, string | number>[],
) {
  if (rows.length === 0) return;

  const ws = XLSX.utils.json_to_sheet(rows);
  const headers = Object.keys(rows[0]);
  ws["!cols"] = headers.map((header) => ({
    wch: Math.min(
      40,
      Math.max(header.length, ...rows.map((row) => String(row[header] ?? "").length)) + 2,
    ),
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}
