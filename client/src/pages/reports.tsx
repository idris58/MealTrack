import { useEffect, useMemo, useRef, useState } from 'react';
import { format, startOfDay, endOfDay } from 'date-fns';
import {
  CalendarIcon,
  ClipboardCopy,
  Download,
  FileBarChart,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Play,
  Share2,
  ShoppingBag,
  Utensils,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useCycleDetails, useMealCycles, useMealStatus } from '@/lib/meal-context';
import { computeCycleMath } from '@shared/cycle-math';
import { PageHeader } from '@/components/page-header';
import { useAuth } from '@/lib/auth-context';
import { Link, useLocation } from 'wouter';

type ReportMember = { id: string; name: string; meals: number; deposit: number; bill: number; balance: number };

// A deep emerald "ink" paired with a brushed-brass accent, evoking a printed
// ledger statement rather than a generic SaaS dashboard card.
const INK = '#0E2420';
const INK_SOFT = '#173832';
const GOLD = '#B8924D';
const GOLD_SOFT = '#D8BD8A';
const PAPER = '#FBFAF7';
const MIST = '#F1EEE4';
const HAIRLINE = '#E4DDCB';
const DUE_RED = '#B03A2E';
const REFUND_GREEN = '#0F765A';

const currency = (amount: number) => `৳${amount.toFixed(2)}`;
const currencyInt = (amount: number) => `৳${Math.round(amount)}`;
const mealCount = (amount: number) => `${Math.round((amount + Number.EPSILON) * 1000) / 1000}`;
const pdfCurrency = (amount: number) => `Tk ${amount.toFixed(2)}`;
const pdfCurrencyInt = (amount: number) => `Tk ${Math.round(amount)}`;
const fileDate = (date: Date) => format(date, 'yyyy-MM-dd');

let bengaliFontBase64Promise: Promise<string> | null = null;

function getBengaliFontBase64() {
  if (!bengaliFontBase64Promise) {
    bengaliFontBase64Promise = (async () => {
      const response = await fetch('/fonts/HindSiliguri-Regular.ttf');
      if (!response.ok) throw new Error('Could not load the Bengali font for the PDF export.');

      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...Array.from(bytes.subarray(offset, offset + 0x8000)));
      }
      return btoa(binary);
    })().catch((error: unknown) => {
      bengaliFontBase64Promise = null;
      throw error;
    });
  }

  return bengaliFontBase64Promise;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function DatePicker({ label, value, onChange, disabled }: { label: string; value: Date; onChange: (value: Date) => void; disabled?: (date: Date) => boolean }) {
  return <div className="min-w-0 flex-1 space-y-1.5">
    <p className="text-xs font-medium text-muted-foreground">{label}</p>
    <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start border-border/80 bg-background/60 py-2 text-left text-sm font-medium shadow-sm hover:bg-background"><CalendarIcon className="mr-2 h-4 w-4 text-primary/70" />{format(value, 'PPP')}</Button></PopoverTrigger><PopoverContent className="w-[18rem] rounded-xl border bg-card p-0 shadow-2xl" align="center"><Calendar mode="single" selected={value} onSelect={(next) => next && onChange(next)} disabled={disabled} initialFocus /></PopoverContent></Popover>
  </div>;
}

function parseItemDateKey(dateStr: string): string {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    if (dateStr.includes('T')) {
      try {
        return format(new Date(dateStr), 'yyyy-MM-dd');
      } catch {
        return dateStr.substring(0, 10);
      }
    }
    return dateStr.substring(0, 10);
  }
  try {
    return format(new Date(dateStr), 'yyyy-MM-dd');
  } catch {
    return dateStr;
  }
}

function isDateInFilterRange(dateStr: string, fromDate: Date, toDate: Date, fromKey: string, toKey: string): boolean {
  if (!dateStr) return false;
  const itemKey = parseItemDateKey(dateStr);
  if (itemKey && itemKey >= fromKey && itemKey <= toKey) {
    return true;
  }
  try {
    const itemMs = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`).getTime();
    if (!isNaN(itemMs)) {
      const startMs = startOfDay(fromDate).getTime();
      const endMs = endOfDay(toDate).getTime();
      return itemMs >= startMs && itemMs <= endMs;
    }
  } catch {
    // fallback
  }
  return false;
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col justify-center px-4 py-4 sm:px-6">
      <p className="text-[9.5px] font-medium uppercase tracking-[0.1em]" style={{ color: `${INK}70` }}>{label}</p>
      <p className="mt-0.5 truncate text-[13.5px] font-semibold" style={{ color: INK }}>{value}</p>
    </div>
  );
}

export default function ReportsPage() {
  const { activeCycle } = useMealCycles();
  const { getCycleDetails } = useCycleDetails();
  const { loading } = useMealStatus();
  const { profile } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (profile?.role === 'member') {
      setLocation('/app');
    }
  }, [profile?.role, setLocation]);

  const previewRef = useRef<HTMLDivElement>(null);
  const today = startOfDay(new Date());
  const [from, setFrom] = useState(() => activeCycle?.startedAt ? startOfDay(new Date(activeCycle.startedAt)) : today);
  const [to, setTo] = useState(() => today);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (activeCycle?.startedAt) {
      setFrom(startOfDay(new Date(activeCycle.startedAt)));
    }
  }, [activeCycle?.startedAt]);

  const details = activeCycle ? getCycleDetails(activeCycle.id) : null;
  const isLoading = loading || (Boolean(activeCycle) && !details);
  const fromKey = fileDate(from); const toKey = fileDate(to);
  const generatedAt = useMemo(() => new Date(), [fromKey, toKey, details]);


  const report = useMemo(() => {
    const members = details?.members ?? [];
    const expenses = (details?.expenses ?? []).filter((item) => isDateInFilterRange(item.date, from, to, fromKey, toKey));
    const logs = (details?.mealLogs ?? []).filter((item) => isDateInFilterRange(item.date, from, to, fromKey, toKey));
    const deposits = (details?.deposits ?? []).filter((item) => isDateInFilterRange(item.createdAt, from, to, fromKey, toKey));
    const math = computeCycleMath({
      members,
      deposits,
      expenses,
      mealLogs: logs,
      cycleStartedAt: from.toISOString(),
      cycleEndedAt: endOfDay(to).toISOString(),
    });
    const { totalMealExpenses, totalFixedExpenses, totalMealsConsumed: totalMeals, currentMealRate: rate, totalDeposits } = math.stats;
    const totalExpenses = totalMealExpenses + totalFixedExpenses;
    const rows: ReportMember[] = math.members.map((member) => ({
      id: member.id,
      name: member.name,
      meals: member.mealsEaten,
      deposit: member.deposit,
      bill: member.totalCost,
      balance: member.balance,
    }));
    const totalBill = rows.reduce((sum, row) => sum + row.bill, 0);
    const mealPct = totalExpenses > 0 ? Math.round((totalMealExpenses / totalExpenses) * 100) : 0;
    return {
      rows, totalExpenses, totalMealExpenses, totalFixedExpenses, totalMeals, rate,
      totalDeposits, totalBill, mealPct,
      remainingCash: math.stats.remainingCash,
    };
  }, [details, from, to, fromKey, toKey]);

  const rangeLabel = format(from, 'dd MMM yyyy') + ' – ' + format(to, 'dd MMM yyyy');
  const dayCount = Math.max(1, Math.round((endOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000));
  const statementNo = `MT-${format(generatedAt, 'yyyyMMdd')}-${(activeCycle?.id ?? 'DRAFT').replace(/-/g, '').slice(0, 6).toUpperCase()}`;
  const cycleLabel = activeCycle?.name ?? '—';
  const baseName = `Mealtrack Statement-${fromKey}-to-${toKey}`;

  const makePng = async () => {
    if (!previewRef.current) throw new Error('The report preview is not available.');
    const { toBlob } = await import('html-to-image');
    const exportNode = previewRef.current.cloneNode(true) as HTMLDivElement;
    exportNode.style.width = '820px';
    exportNode.style.maxWidth = 'none';
    exportNode.style.position = 'fixed';
    exportNode.style.left = '-10000px';
    exportNode.style.top = '0';
    document.body.appendChild(exportNode);
    try {
      const blob = await toBlob(exportNode, { cacheBust: true, pixelRatio: 2, backgroundColor: PAPER, width: 820 });
      if (!blob) throw new Error('The report image could not be rendered.');
      return { blob };
    } finally {
      exportNode.remove();
    }
  };

  const makePdf = async () => {
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const inkRgb: [number, number, number] = [14, 36, 32];
    const inkSoftRgb: [number, number, number] = [23, 56, 50];
    const goldRgb: [number, number, number] = [184, 146, 77];
    const paperRgb: [number, number, number] = [251, 250, 247];
    const mistRgb: [number, number, number] = [241, 238, 228];
    const slateRgb: [number, number, number] = [71, 85, 105];
    const emeraldRgb: [number, number, number] = [16, 138, 106];
    const sandRgb: [number, number, number] = [188, 158, 96];

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    doc.addFileToVFS('HindSiliguri-Regular.ttf', await getBengaliFontBase64());
    doc.addFont('HindSiliguri-Regular.ttf', 'HindSiliguri', 'normal');
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;

    doc.setFillColor(...inkRgb);
    doc.rect(0, 0, pageWidth, 100, 'F');
    doc.setFillColor(...goldRgb);
    doc.circle(56, 46, 17, 'F');
    doc.setTextColor(...inkRgb);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('M', 51, 51.5);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(17);
    doc.text('MealTrack', 86, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(214, 224, 220);
    doc.text('Statement of Meal Accounts', 86, 57);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(rangeLabel, pageWidth - margin, 39, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(196, 208, 203);
    doc.text(`Generated ${format(generatedAt, 'PPP p')}`, pageWidth - margin, 52, { align: 'right' });
    doc.text(`Statement No. ${statementNo}`, pageWidth - margin, 64, { align: 'right' });

    // Gold hairline beneath the header
    doc.setDrawColor(...goldRgb);
    doc.setLineWidth(1);
    doc.line(0, 100, pageWidth, 100);

    const metaY = 100;
    const metaHeight = 32;
    doc.setFillColor(...mistRgb);
    doc.rect(0, metaY, pageWidth, metaHeight, 'F');
    const metaItems: [string, string][] = [
      ['CYCLE', cycleLabel],
      ['MEAL RATE', pdfCurrency(report.rate)],
      ['DAYS COVERED', String(dayCount)],
    ];
    const metaColWidth = (pageWidth - margin * 2) / metaItems.length;
    metaItems.forEach(([label, value], index) => {
      const x = margin + index * metaColWidth;
      doc.setTextColor(...inkSoftRgb);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.6);
      doc.text(label, x, metaY + 13);
      doc.setTextColor(...inkRgb);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.text(value.length > 26 ? `${value.slice(0, 24)}…` : value, x, metaY + 25);
    });

    const barY = metaY + metaHeight;
    const barHeight = 60;
    const colWidth = (pageWidth - margin * 2) / 4;
    doc.setFillColor(...paperRgb);
    doc.rect(margin, barY + 14, pageWidth - margin * 2, barHeight, 'F');
    doc.setDrawColor(225, 220, 208);
    doc.setLineWidth(0.75);
    doc.rect(margin, barY + 14, pageWidth - margin * 2, barHeight);
    const stats: [string, string, [number, number, number]][] = [
      ['TOTAL EXPENSES', pdfCurrency(report.totalExpenses), inkRgb],
      ['TOTAL MEALS', mealCount(report.totalMeals), inkRgb],
      ['MEAL RATE', pdfCurrency(report.rate), inkRgb],
      ['CASH REMAINING', pdfCurrency(report.remainingCash), report.remainingCash >= 0 ? emeraldRgb : [176, 58, 46]],
    ];
    stats.forEach(([label, value, color], index) => {
      const x = margin + index * colWidth + 16;
      if (index > 0) {
        doc.setDrawColor(225, 220, 208);
        doc.line(margin + index * colWidth, barY + 14, margin + index * colWidth, barY + 14 + barHeight);
      }
      doc.setTextColor(...inkSoftRgb);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.text(label, x, barY + 35);
      doc.setTextColor(...color);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14.5);
      doc.text(value, x, barY + 58);
    });

    const compY = barY + 14 + barHeight + 22;
    doc.setTextColor(...inkRgb);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text('Expense composition', margin, compY);
    const compBarY = compY + 8;
    const compBarWidth = pageWidth - margin * 2;
    const mealWidth = compBarWidth * (report.mealPct / 100);
    doc.setFillColor(...mistRgb);
    doc.roundedRect(margin, compBarY, compBarWidth, 10, 3, 3, 'F');
    if (mealWidth > 0) {
      doc.setFillColor(...emeraldRgb);
      doc.roundedRect(margin, compBarY, Math.max(mealWidth, 6), 10, 3, 3, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...emeraldRgb);
    doc.text(`Meal · ${pdfCurrency(report.totalMealExpenses)} (${report.mealPct}%)`, margin, compBarY + 24);
    doc.setTextColor(...sandRgb);
    doc.text(`Utility · ${pdfCurrency(report.totalFixedExpenses)} (${100 - report.mealPct}%)`, pageWidth - margin, compBarY + 24, { align: 'right' });

    autoTable(doc, {
      startY: compBarY + 40,
      head: [['Member', 'Meals', 'Deposit', 'Bill', 'Balance']],
      body: report.rows.map((row) => [row.name, mealCount(row.meals), pdfCurrency(row.deposit), pdfCurrency(row.bill), row.balance < 0 ? `-${pdfCurrencyInt(Math.abs(row.balance))}` : row.balance > 0 ? `+${pdfCurrencyInt(row.balance)}` : pdfCurrencyInt(0)]),
      foot: [['Totals', mealCount(report.totalMeals), pdfCurrency(report.totalDeposits), pdfCurrency(report.totalBill), `${report.totalDeposits - report.totalBill < 0 ? '-' : report.totalDeposits - report.totalBill > 0 ? '+' : ''}${pdfCurrencyInt(Math.abs(report.totalDeposits - report.totalBill))}`]],
      theme: 'plain',
      headStyles: { fillColor: inkRgb, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, cellPadding: { top: 9, bottom: 9, left: 10, right: 10 } },
      footStyles: { fillColor: paperRgb, textColor: inkRgb, fontStyle: 'bold', fontSize: 9.5, cellPadding: { top: 10, bottom: 10, left: 10, right: 10 }, lineColor: goldRgb, lineWidth: { top: 1.2 } },
      alternateRowStyles: { fillColor: [246, 244, 238] },
      styles: { fontSize: 9.5, cellPadding: { top: 9, bottom: 9, left: 10, right: 10 }, textColor: [30, 41, 37], lineColor: [232, 228, 217], lineWidth: { bottom: 0.5 } },
      columnStyles: { 0: { font: 'HindSiliguri', fontStyle: 'normal' }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      didParseCell: (data) => {
        if (data.column.index !== 4) return;
        if (data.section === 'body') {
          const balance = report.rows[data.row.index]?.balance ?? 0;
          data.cell.styles.textColor = balance < 0 ? [176, 58, 46] : balance > 0 ? [15, 118, 90] : [71, 85, 105];
        } else if (data.section === 'foot') {
          const net = report.totalDeposits - report.totalBill;
          data.cell.styles.textColor = net < 0 ? [176, 58, 46] : net > 0 ? [15, 118, 90] : [71, 85, 105];
        }
      },
      margin: { left: margin, right: margin, bottom: 56 },
    });

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...slateRgb);
    doc.text('Negative balance is due to the mess; positive balance is a refund owed to the member.', margin, finalY + 16);

    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      const height = doc.internal.pageSize.getHeight();
      doc.setDrawColor(...goldRgb);
      doc.setLineWidth(0.75);
      doc.line(pageWidth / 2 - 44, height - 40, pageWidth / 2 + 44, height - 40);
      doc.setTextColor(...slateRgb);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`Prepared via MealTrack  ·  Page ${page} of ${totalPages}`, pageWidth / 2, height - 26, { align: 'center' });
    }

    return doc.output('blob');
  };
  if (profile?.role === 'member') return null;
  const makeXlsx = async () => {
    const { default: ExcelJS } = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MealTrack';
    wb.created = generatedAt;

    const INK_HEX = 'FF0E2420';
    const GOLD_HEX = 'FFB8924D';
    const ALT_HEX = 'FFF6F4EE';

    const summaryWs = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
    summaryWs.columns = [{ width: 24 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 20 }];

    summaryWs.mergeCells('A1:E1');
    const titleCell = summaryWs.getCell('A1');
    titleCell.value = 'MealTrack — Statement of Meal Accounts';
    titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    summaryWs.getRow(1).height = 30;
    for (let col = 1; col <= 5; col += 1) summaryWs.getCell(1, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK_HEX } };

    const metaPairs: [string, string][] = [
      ['Statement No.', statementNo],
      ['Date range', rangeLabel],
      ['Cycle', cycleLabel],
      ['Meal rate (Tk)', Number(report.rate.toFixed(4)).toString()],
      ['Generated', format(generatedAt, 'PPP p')],
    ];
    metaPairs.forEach(([label, value], index) => {
      const row = summaryWs.getRow(2 + index);
      row.getCell(1).value = label;
      row.getCell(1).font = { bold: true, color: { argb: 'FF44544E' } };
      row.getCell(2).value = value;
    });

    const metricsTitleRow = 2 + metaPairs.length + 1;
    summaryWs.getCell(`A${metricsTitleRow}`).value = 'Summary metrics';
    summaryWs.getCell(`A${metricsTitleRow}`).font = { bold: true, size: 12, color: { argb: 'FF0E2420' } };

    const metricHeaderRowIndex = metricsTitleRow + 1;
    const metricHeaderRow = summaryWs.getRow(metricHeaderRowIndex);
    ['Metric', 'Value'].forEach((label, index) => {
      const cell = metricHeaderRow.getCell(index + 1);
      cell.value = label;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK_HEX } };
    });
    const metricRows = [
      ['Total Expenses (Tk)', report.totalExpenses],
      ['  Meal Expenses (Tk)', report.totalMealExpenses],
      ['  Utility Expenses (Tk)', report.totalFixedExpenses],
      ['Total Meals', report.totalMeals],
      ['Meal Rate (Tk)', Number(report.rate.toFixed(4))],
      ['Total Deposits (Tk)', report.totalDeposits],
      ['Cash Remaining (Tk)', Number(report.remainingCash.toFixed(2))],
    ];
    metricRows.forEach((values, index) => {
      const row = summaryWs.getRow(metricHeaderRowIndex + 1 + index);
      values.forEach((value, colIndex) => { row.getCell(colIndex + 1).value = value as string | number; });
      if (index % 2 === 1) for (let col = 1; col <= 2; col += 1) row.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_HEX } };
    });

    const memberTitleRowIndex = metricHeaderRowIndex + 1 + metricRows.length + 1;
    summaryWs.getCell(`A${memberTitleRowIndex}`).value = 'Member breakdown';
    summaryWs.getCell(`A${memberTitleRowIndex}`).font = { bold: true, size: 12, color: { argb: 'FF0E2420' } };

    const memberHeaderRowIndex = memberTitleRowIndex + 1;
    const memberHeaders = ['Member Name', 'Meals', 'Deposit (Tk)', 'Bill (Tk)', 'Balance (Tk)'];
    const memberHeaderRow = summaryWs.getRow(memberHeaderRowIndex);
    memberHeaders.forEach((label, index) => {
      const cell = memberHeaderRow.getCell(index + 1);
      cell.value = label;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK_HEX } };
      cell.border = { bottom: { style: 'thin', color: { argb: GOLD_HEX } } };
    });

    report.rows.forEach((row, index) => {
      const sheetRow = summaryWs.getRow(memberHeaderRowIndex + 1 + index);
      const values = [
        row.name,
        row.meals,
        row.deposit,
        Number(row.bill.toFixed(2)),
        Number(row.balance.toFixed(2)),
      ];
      values.forEach((value, colIndex) => { sheetRow.getCell(colIndex + 1).value = value as string | number; });
      sheetRow.getCell(5).font = { color: { argb: row.balance < 0 ? 'FFB03A2E' : row.balance > 0 ? 'FF0F765A' : 'FF475569' }, bold: true };
      if (index % 2 === 1) for (let col = 1; col <= 5; col += 1) sheetRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_HEX } };
    });

    const totalsRowIndex = memberHeaderRowIndex + 1 + report.rows.length;
    const totalsRow = summaryWs.getRow(totalsRowIndex);
    const totalsValues = ['Totals', report.totalMeals, report.totalDeposits, Number(report.totalBill.toFixed(2)), Number((report.totalDeposits - report.totalBill).toFixed(2))];
    totalsValues.forEach((value, colIndex) => {
      const cell = totalsRow.getCell(colIndex + 1);
      cell.value = value as string | number;
      cell.font = { bold: true, color: { argb: 'FF0E2420' } };
      cell.border = { top: { style: 'medium', color: { argb: GOLD_HEX } } };
    });
    const netBalance = report.totalDeposits - report.totalBill;
    totalsRow.getCell(5).font = { bold: true, color: { argb: netBalance < 0 ? 'FFB03A2E' : netBalance > 0 ? 'FF0F765A' : 'FF0E2420' } };
    const balanceNote = summaryWs.getCell(totalsRowIndex + 1, 1);
    balanceNote.value = 'Negative balance = due to the mess; positive balance = refund owed to the member.';
    balanceNote.font = { italic: true, size: 9, color: { argb: 'FF475569' } };
    summaryWs.mergeCells(totalsRowIndex + 1, 1, totalsRowIndex + 1, 5);

    if (details?.expenses?.length) {
      const expenses = (details.expenses ?? []).filter((item) => isDateInFilterRange(item.date, from, to, fromKey, toKey));
      const expenseWs = wb.addWorksheet('Expenses', { views: [{ showGridLines: false }] });
      expenseWs.columns = [{ width: 14 }, { width: 28 }, { width: 16 }, { width: 14 }];
      const headerRow = expenseWs.getRow(1);
      ['Date', 'Title / Description', 'Category', 'Amount (Tk)'].forEach((label, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = label;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK_HEX } };
      });
      expenses.forEach((exp, index) => {
        const row = expenseWs.getRow(2 + index);
        [exp.date, exp.description, exp.type === 'utility' ? 'Utility Expense' : 'Meal Expense', exp.amount].forEach((value, colIndex) => {
          row.getCell(colIndex + 1).value = value as string | number;
        });
        if (index % 2 === 1) for (let col = 1; col <= 4; col += 1) row.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_HEX } };
      });
    }

    const wbOut = await wb.xlsx.writeBuffer();
    return new Blob([wbOut], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  };
  const run = async (task: () => Promise<void>) => { if (isGenerating) return; setIsGenerating(true); try { await task(); } catch (error) { console.error('Report generation failed:', error); toast.error('Could not create statement', { description: 'Please try again. If the issue continues, refresh the page.' }); } finally { setIsGenerating(false); } };
  const share = async (blob: Blob, name: string, type: string) => {
    const file = new File([blob], name, { type });
    const shareApi = (navigator as unknown as { share?: Navigator['share']; canShare?: Navigator['canShare'] }).share;
    const canShareApi = (navigator as unknown as { canShare?: Navigator['canShare'] }).canShare;
    let canShareFile = false;
    try {
      canShareFile = Boolean(shareApi && (!canShareApi || canShareApi.call(navigator, { files: [file] })));
    } catch {
      canShareFile = false;
    }

    if (canShareFile) {
      try {
        await shareApi!.call(navigator, { title: 'MealTrack statement', files: [file] });
        return;
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') return;
      }
    }

    download(blob, name);
    toast.info('Statement downloaded', { description: 'File sharing is unavailable here, so the statement was downloaded.' });
  };

  return (
    <div className="space-y-6">
      <PageHeader icon={FileBarChart} title="Reports" description="Review cycle performance, member balances, and downloadable statements." />

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-5 p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 lg:w-[26rem]">
              <DatePicker label="From" value={from} onChange={setFrom} disabled={(date) => date > to} />
              <DatePicker label="To" value={to} onChange={setTo} disabled={(date) => date < from || date > today} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button disabled={isGenerating || isLoading} className="gap-2 shadow-sm">
                    <Download className="h-4 w-4" /> Export
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Download statement</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void run(async () => { download(await makePdf(), `${baseName}.pdf`); toast.success('PDF exported', { description: 'Your statement download has started.' }); })}>
                    <FileText className="h-4 w-4" /> PDF statement
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void run(async () => { download(new Blob([await makeXlsx()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${baseName}.xlsx`); toast.success('Excel exported', { description: 'Your spreadsheet download has started.' }); })}>
                    <FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void run(async () => { const { blob } = await makePng(); download(blob, `${baseName}.png`); toast.success('PNG exported', { description: 'Your statement image download has started.' }); })}>
                    <FileImage className="h-4 w-4" /> PNG image
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2 border-border/80 bg-background/60" disabled={isGenerating || isLoading}>
                    {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Share
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Share statement</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void run(async () => { await share(await makePdf(), `${baseName}.pdf`, 'application/pdf'); })}>
                    <FileText className="h-4 w-4" /> Share PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void run(async () => { await share(new Blob([await makeXlsx()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${baseName}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); })}>
                    <FileSpreadsheet className="h-4 w-4" /> Share Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void run(async () => { const { blob } = await makePng(); await share(blob, `${baseName}.png`, 'image/png'); })}>
                    <FileImage className="h-4 w-4" /> Share PNG
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void run(async () => { const { blob } = await makePng(); if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Clipboard images are not supported.'); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast.success('Image copied', { description: 'The statement image is ready to paste.' }); })}>
                    <ClipboardCopy className="h-4 w-4" /> Copy image
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </section>

      <div
        className="mx-auto max-w-4xl rounded-3xl p-3 pb-6 sm:p-8"
        style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(14,36,32,0.06), transparent 60%)' }}
      >
        <div className="w-full">
              <div
                ref={previewRef}
                className="relative mx-auto w-full max-w-[820px] overflow-hidden rounded-2xl shadow-[0_28px_70px_-24px_rgba(14,36,32,0.45)] ring-1 ring-black/5"
                style={{ backgroundColor: PAPER, color: INK }}
              >
          {/* faint watermark monogram */}
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-16 -right-10 select-none font-heading text-[15rem] font-bold leading-none opacity-[0.035]"
            style={{ color: INK }}
          >
            M
          </div>

          {/* header band */}
          <div
            className="relative px-3 py-4 text-white sm:px-8 sm:py-7"
            style={{ backgroundImage: `linear-gradient(135deg, ${INK} 0%, ${INK_SOFT} 55%, #0A1B17 100%)` }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="flex items-center gap-3.5">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-heading text-lg font-bold sm:h-12 sm:w-12"
                  style={{ backgroundColor: GOLD, color: INK }}
                >
                  M
                </div>
                <div>
                  <p className="font-heading text-lg font-bold leading-tight sm:text-xl">MealTrack</p>
                  <p className="text-xs" style={{ color: GOLD_SOFT }}>Statement of Meal Accounts</p>
                </div>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-sm font-semibold text-white">{rangeLabel}</p>
                <p className="mt-1 text-[10.5px] text-white/55">Generated {format(generatedAt, 'PPP p')}</p>
                <p className="text-[10.5px] text-white/55">Statement No. {statementNo}</p>
              </div>
            </div>
            <div
              className="mt-5 h-px w-full"
              style={{ backgroundImage: `linear-gradient(to right, ${GOLD}88, ${GOLD}18, transparent)` }}
            />
          </div>

          {/* meta strip */}
          <div className="relative grid grid-cols-2 divide-x" style={{ backgroundColor: MIST, borderColor: HAIRLINE, borderBottomWidth: 1, borderBottomStyle: 'solid' }}>
            <MetaCell label="Cycle" value={cycleLabel} />
            <MetaCell label="Meal Rate" value={currency(report.rate)} />
          </div>

          {/* expense composition */}
          {!isLoading && report.totalExpenses > 0 && (
            <div className="px-3 pt-4 sm:px-8 sm:pt-6">
              <p className="text-[12.5px] font-semibold" style={{ color: INK }}>Expense composition</p>
              <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: MIST }}>
                <div style={{ width: `${report.mealPct}%`, backgroundColor: REFUND_GREEN }} />
                <div style={{ width: `${100 - report.mealPct}%`, backgroundColor: GOLD }} />
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[10px] sm:text-xs">
                <span className="flex items-center gap-1.5 font-medium" style={{ color: REFUND_GREEN }}>
                  <Utensils className="h-3 w-3" /> Meal · {currency(report.totalMealExpenses)} ({report.mealPct}%)
                </span>
                <span className="flex items-center gap-1.5 font-medium" style={{ color: '#8A6D34' }}>
                  <ShoppingBag className="h-3 w-3" /> Utility · {currency(report.totalFixedExpenses)} ({100 - report.mealPct}%)
                </span>
              </div>
            </div>
          )}

          {/* table */}
          <div className="p-2 sm:p-8">
            <div className="overflow-hidden rounded-lg" style={{ border: `1px solid ${HAIRLINE}` }}>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr style={{ backgroundColor: INK }}>
                    <th className="p-1.5 text-left text-[10px] font-semibold text-white sm:p-3 sm:text-sm">Member</th>
                    <th className="p-1.5 text-right text-[10px] font-semibold text-white sm:p-3 sm:text-sm">Meals</th>
                    <th className="p-1.5 text-right text-[10px] font-semibold text-white sm:p-3 sm:text-sm">Deposit</th>
                    <th className="p-1.5 text-right text-[10px] font-semibold text-white sm:p-3 sm:text-sm">Bill</th>
                    <th className="p-1.5 text-right text-[10px] font-semibold text-white sm:p-3 sm:text-sm">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, index) => (
                      <tr key={index} style={{ backgroundColor: index % 2 ? '#F6F4EE' : 'transparent' }}>
                        <td className="p-1.5 sm:p-3"><Skeleton className="h-4 w-12 sm:w-28" /></td>
                        <td className="p-1.5 text-right sm:p-3"><Skeleton className="ml-auto h-4 w-8 sm:w-16" /></td>
                        <td className="p-1.5 text-right sm:p-3"><Skeleton className="ml-auto h-4 w-8 sm:w-16" /></td>
                        <td className="p-1.5 text-right sm:p-3"><Skeleton className="ml-auto h-4 w-8 sm:w-12" /></td>
                        <td className="p-1.5 text-right sm:p-3"><Skeleton className="ml-auto h-4 w-8 sm:w-12" /></td>
                      </tr>
                    ))
                  ) : report.rows.length ? (
                    <>
                      {report.rows.map((row, index) => (
                        <tr key={row.id} style={{ backgroundColor: index % 2 ? '#F6F4EE' : 'transparent' }}>
                          <td className="p-1.5 text-[10px] font-semibold sm:p-3 sm:text-sm">{row.name}</td>
                          <td className="p-1.5 text-right text-[10px] tabular-nums sm:p-3 sm:text-sm">{mealCount(row.meals)}</td>
                          <td className="p-1.5 text-right text-[10px] tabular-nums sm:p-3 sm:text-sm">{currency(row.deposit)}</td>
                          <td className="p-1.5 text-right text-[10px] tabular-nums sm:p-3 sm:text-sm">{currency(row.bill)}</td>
                          <td className="p-1.5 text-right text-[9px] font-bold tabular-nums sm:p-3 sm:text-sm" style={{ color: row.balance < 0 ? DUE_RED : row.balance > 0 ? REFUND_GREEN : `${INK}80` }}>
                            {row.balance < 0 ? `-${currencyInt(Math.abs(row.balance))}` : row.balance > 0 ? `+${currencyInt(row.balance)}` : currencyInt(0)}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: `2px solid ${GOLD}` }}>
                        <td className="p-1.5 text-[10px] font-bold sm:p-3 sm:text-sm" style={{ backgroundColor: PAPER }}>Totals</td>
                        <td className="p-1.5 text-right text-[10px] font-bold tabular-nums sm:p-3 sm:text-sm" style={{ backgroundColor: PAPER }}>{mealCount(report.totalMeals)}</td>
                        <td className="p-1.5 text-right text-[10px] font-bold tabular-nums sm:p-3 sm:text-sm" style={{ backgroundColor: PAPER }}>{currency(report.totalDeposits)}</td>
                        <td className="p-1.5 text-right text-[10px] font-bold tabular-nums sm:p-3 sm:text-sm" style={{ backgroundColor: PAPER }}>{currency(report.totalBill)}</td>
                        <td className="p-1.5 text-right text-[9px] font-bold tabular-nums sm:p-3 sm:text-sm" style={{ backgroundColor: PAPER, color: report.totalDeposits - report.totalBill < 0 ? DUE_RED : report.totalDeposits - report.totalBill > 0 ? REFUND_GREEN : INK }}>{`${report.totalDeposits - report.totalBill < 0 ? '-' : report.totalDeposits - report.totalBill > 0 ? '+' : ''}${currencyInt(Math.abs(report.totalDeposits - report.totalBill))}`}</td>
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-10 text-center" style={{ color: `${INK}99` }}>
                        <p>{activeCycle ? 'No active-cycle members to include in this statement.' : 'Start a cycle to create a statement for your mess.'}</p>
                        {!activeCycle && (
                          <Link href="/app/settings">
                            <Button className="mt-4 gap-2">
                              <Play className="h-4 w-4" />
                              Start New Cycle
                            </Button>
                          </Link>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {!isLoading && report.rows.length > 0 && (
              <p className="mt-3 text-xs italic" style={{ color: `${INK}80` }}>
                Negative balances are due to the mess; positive balances are refunds owed to members.
              </p>
            )}
          </div>

          {/* footer signature */}
          <div className="relative border-t px-4 py-4 text-center sm:px-8 sm:py-5" style={{ borderColor: HAIRLINE }}>
            <div className="mx-auto mb-2.5 h-px w-14" style={{ backgroundColor: `${GOLD}70` }} />
            <p className="text-xs" style={{ color: `${INK}80` }}>Prepared via MealTrack</p>
          </div>
              </div>
        </div>
      </div>
    </div>
  );
}
