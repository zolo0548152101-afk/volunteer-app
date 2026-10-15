import ExcelJS from "exceljs";
import type { ReportTable } from "@/lib/services/analytics";

/**
 * קובץ Excel מדוח. גיליון מימין לשמאל, כותרות מודגשות ומוקפאות, מספרים כמספרים.
 * ערכי טקסט נכתבים כמחרוזות (לעולם לא כנוסחה), כך ששם שמתחיל ב-= לא יופעל ב-Excel.
 */
export async function reportToXlsx(table: ReportTable, opts: { title: string; header: (key: string) => string; cell: (key: string, v: string | number | null) => string | number | null }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "volunteer-app";
  const ws = wb.addWorksheet(opts.title.slice(0, 31), { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  ws.columns = table.columns.map((c) => ({
    header: opts.header(c.key), key: c.key, width: Math.max(12, Math.min(40, opts.header(c.key).length + 6)),
    style: c.type === "percent" ? { numFmt: "0.0" } : c.type === "hours" ? { numFmt: "0.00" } : {},
  }));
  ws.getRow(1).font = { bold: true };
  for (const r of table.rows) {
    ws.addRow(Object.fromEntries(table.columns.map((c) => {
      const v = r[c.key] ?? null;
      return [c.key, c.type === "text" || c.type === "date" ? (v === null ? null : String(opts.cell(c.key, v))) : v];
    })));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
