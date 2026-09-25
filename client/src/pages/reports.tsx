import { useEffect, useMemo, useRef, useState } from 'react';
import { format, startOfDay, startOfMonth, subDays, endOfDay } from 'date-fns';
import {
  BadgeCheck,
  CalendarIcon,
  ClipboardCopy,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  Loader2,
  Play,
  Share2,
  ShoppingBag,
  Users,
  Utensils,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useMeal } from '@/lib/meal-context';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { Link, useLocation } from 'wouter';

type ReportMember = { id: string; name: string; meals: number; deposit: number; bill: number; balance: number };

// ── Palette ──────────────────────────────────────────────────────────────────
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

// ── Statement stat cell (ledger-bar segment) ──────────────────────────────────
function StatCell({ label, value, isLoading, accent }: { label: string; value: string; isLoading?: boolean; accent?: string }) {
  return (
    <div className="flex flex-col justify-center px-4 py-4 sm:px-6 sm:py-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.13em]" style={{ color: `${INK}96` }}>{label}</p>
      {isLoading ? (
        <Skeleton className="mt-2 h-6 w-20" />
      ) : (
        <p className="mt-1 font-heading text-xl font-bold tabular-nums sm:text-[1.45rem]" style={{ color: accent ?? INK }}>{value}</p>
      )}
    </div>
  );
}

// ── Meta strip cell (statement no / cycle / prepared by / members) ──────────
function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col justify-center px-4 py-4 sm:px-6">
      <p className="text-[9.5px] font-medium uppercase tracking-[0.1em]" style={{ color: `${INK}70` }}>{label}</p>
      <p className="mt-0.5 truncate text-[13.5px] font-semibold" style={{ color: INK }}>{value}</p>
    </div>
  );
}

type PresetKey = 'cycle' | '7d' | '30d' | 'month';

export default function ReportsPage() {
  const { activeCycle, getCycleDetails, loading } = useMeal();
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

  const applyPreset = (preset: PresetKey) => {
    const cycleStart = activeCycle?.startedAt ? startOfDay(new Date(activeCycle.startedAt)) : today;
    if (preset === 'cycle') { setFrom(cycleStart); setTo(today); return; }
    if (preset === '7d') { setFrom(startOfDay(subDays(today, 6))); setTo(today); return; }
    if (preset === '30d') { setFrom(startOfDay(subDays(today, 29))); setTo(today); return; }
    if (preset === 'month') { setFrom(startOfDay(startOfMonth(today))); setTo(today); return; }
  };
  const activePreset: PresetKey | null = useMemo(() => {
    const cycleStart = activeCycle?.startedAt ? startOfDay(new Date(activeCycle.startedAt)) : today;
    const toIsToday = fileDate(to) === fileDate(today);
    if (!toIsToday) return null;
    if (fileDate(from) === fileDate(cycleStart)) return 'cycle';
    if (fileDate(from) === fileDate(startOfDay(subDays(today, 6)))) return '7d';
    if (fileDate(from) === fileDate(startOfDay(subDays(today, 29)))) return '30d';
    if (fileDate(from) === fileDate(startOfDay(startOfMonth(today)))) return 'month';
    return null;
  }, [from, to, activeCycle?.startedAt, today]);

  const report = useMemo(() => {
    const members = details?.members ?? [];
    const expenses = (details?.expenses ?? []).filter((item) => isDateInFilterRange(item.date, from, to, fromKey, toKey));
    const logs = (details?.mealLogs ?? []).filter((item) => isDateInFilterRange(item.date, from, to, fromKey, toKey));
    const deposits = (details?.deposits ?? []).filter((item) => isDateInFilterRange(item.createdAt, from, to, fromKey, toKey));
    const totalMealExpenses = expenses.filter((item) => item.type === 'meal').reduce((sum, item) => sum + item.amount, 0);
    const totalFixedExpenses = expenses.filter((item) => item.type === 'fixed').reduce((sum, item) => sum + item.amount, 0);
    const totalExpenses = totalMealExpenses + totalFixedExpenses;
    const totalMeals = logs.reduce((sum, item) => sum + item.count, 0);
    const rate = totalMeals > 0 ? totalMealExpenses / totalMeals : 0;
    const fixedShare = members.length > 0 ? totalFixedExpenses / members.length : 0;
    const rows: ReportMember[] = members.map((member) => {
      const meals = logs.filter((item) => item.memberId === member.id).reduce((sum, item) => sum + item.count, 0);
      const deposit = deposits.filter((item) => item.memberId === member.id).reduce((sum, item) => sum + item.amount, 0);
      const bill = meals * rate + fixedShare;
      return { id: member.id, name: member.name, meals, deposit, bill, balance: deposit - bill };
    });
    const totalDeposits = rows.reduce((sum, row) => sum + row.deposit, 0);
    const totalBill = rows.reduce((sum, row) => sum + row.bill, 0);
    const totalDue = rows.reduce((sum, row) => sum + (row.balance < 0 ? Math.abs(row.balance) : 0), 0);
    const totalRefund = rows.reduce((sum, row) => sum + (row.balance > 0 ? row.balance : 0), 0);
    const mealPct = totalExpenses > 0 ? Math.round((totalMealExpenses / totalExpenses) * 100) : 0;
    return {
      rows, totalExpenses, totalMealExpenses, totalFixedExpenses, totalMeals, rate,
      totalDeposits, totalBill, totalDue, totalRefund, mealPct,
      remainingCash: totalDeposits - totalExpenses,
    };
  }, [details, from, to, fromKey, toKey]);

  const rangeLabel = format(from, 'dd MMM yyyy') + ' – ' + format(to, 'dd MMM yyyy');
  const dayCount = Math.max(1, Math.round((endOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000));
  const statementNo = `MT-${format(generatedAt, 'yyyyMMdd')}-${(activeCycle?.id ?? 'DRAFT').replace(/-/g, '').slice(0, 6).toUpperCase()}`;
  const preparedBy = profile?.full_name?.trim() || 'Manager';
  const cycleLabel = activeCycle?.name ?? '—';
  const baseName = `Mealtrack Statement-${fromKey}-to-${toKey}`;

  const makePng = async () => {
    if (!previewRef.current) throw new Error('The report preview is not available.');
    const { toPng } = await import('html-to-image');
    const dataUrl = await toPng(previewRef.current, { cacheBust: true, pixelRatio: 2, backgroundColor: PAPER });
    return { blob: await (await fetch(dataUrl)).blob() };
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
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 40;

    // ── Header band ──────────────────────────────────────────────────────────
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

    // ── Meta strip ───────────────────────────────────────────────────────────
    const metaY = 100;
    const metaHeight = 32;
    doc.setFillColor(...mistRgb);
    doc.rect(0, metaY, pageWidth, metaHeight, 'F');
    const metaItems: [string, string][] = [
      ['CYCLE', cycleLabel],
      ['PREPARED BY', preparedBy],
      ['MEMBERS', String(report.rows.length)],
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

    // ── Ledger stat bar (4 columns) ────────────────────────────────────────────
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

    // ── Expense composition ────────────────────────────────────────────────────
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
    doc.text(`Fixed · ${pdfCurrency(report.totalFixedExpenses)} (${100 - report.mealPct}%)`, pageWidth - margin, compBarY + 24, { align: 'right' });

    // ── Member table ─────────────────────────────────────────────────────────
    autoTable(doc, {
      startY: compBarY + 40,
      head: [['Member', 'Meals', 'Deposit', 'Bill', 'Due', 'Refund']],
      body: report.rows.map((row) => [row.name, mealCount(row.meals), pdfCurrency(row.deposit), pdfCurrency(row.bill), pdfCurrencyInt(row.balance < 0 ? Math.abs(row.balance) : 0), pdfCurrencyInt(row.balance > 0 ? row.balance : 0)]),
      foot: [['Totals', mealCount(report.totalMeals), pdfCurrency(report.totalDeposits), pdfCurrency(report.totalBill), pdfCurrencyInt(report.totalDue), pdfCurrencyInt(report.totalRefund)]],
      theme: 'plain',
      headStyles: { fillColor: inkRgb, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, cellPadding: { top: 9, bottom: 9, left: 10, right: 10 } },
      footStyles: { fillColor: paperRgb, textColor: inkRgb, fontStyle: 'bold', fontSize: 9.5, cellPadding: { top: 10, bottom: 10, left: 10, right: 10 }, lineColor: goldRgb, lineWidth: { top: 1.2 } },
      alternateRowStyles: { fillColor: [246, 244, 238] },
      styles: { fontSize: 9.5, cellPadding: { top: 9, bottom: 9, left: 10, right: 10 }, textColor: [30, 41, 37], lineColor: [232, 228, 217], lineWidth: { bottom: 0.5 } },
      columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', textColor: [176, 58, 46] }, 5: { halign: 'right', textColor: [15, 118, 90] } },
      margin: { left: margin, right: margin, bottom: 56 },
    });

    // ── Footnote ─────────────────────────────────────────────────────────────
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(...slateRgb);
    doc.text('Due is owed to the mess by the member; Refund is owed to the member by the mess.', margin, finalY + 16);

    // ── Footer + pagination on every page ─────────────────────────────────────
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
    summaryWs.columns = [{ width: 24 }, { width: 18 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 }];

    summaryWs.mergeCells('A1:G1');
    const titleCell = summaryWs.getCell('A1');
    titleCell.value = 'MealTrack — Statement of Meal Accounts';
    titleCell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    summaryWs.getRow(1).height = 30;
    for (let col = 1; col <= 7; col += 1) summaryWs.getCell(1, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK_HEX } };

    const metaPairs: [string, string][] = [
      ['Statement No.', statementNo],
      ['Date range', rangeLabel],
      ['Cycle', cycleLabel],
      ['Prepared by', preparedBy],
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
      ['  Fixed Expenses (Tk)', report.totalFixedExpenses],
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
    const memberHeaders = ['Member Name', 'Meals', 'Deposit (Tk)', 'Bill (Tk)', 'Due (Tk)', 'Refund (Tk)', 'Net Balance (Tk)'];
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
        row.balance < 0 ? Math.round(Math.abs(row.balance)) : 0,
        row.balance > 0 ? Math.round(row.balance) : 0,
        Number(row.balance.toFixed(2)),
      ];
      values.forEach((value, colIndex) => { sheetRow.getCell(colIndex + 1).value = value as string | number; });
      if (index % 2 === 1) for (let col = 1; col <= 7; col += 1) sheetRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT_HEX } };
    });

    const totalsRowIndex = memberHeaderRowIndex + 1 + report.rows.length;
    const totalsRow = summaryWs.getRow(totalsRowIndex);
    const totalsValues = ['Totals', report.totalMeals, report.totalDeposits, Number(report.totalBill.toFixed(2)), Math.round(report.totalDue), Math.round(report.totalRefund), Number((report.totalDeposits - report.totalBill).toFixed(2))];
    totalsValues.forEach((value, colIndex) => {
      const cell = totalsRow.getCell(colIndex + 1);
      cell.value = value as string | number;
      cell.font = { bold: true, color: { argb: 'FF0E2420' } };
      cell.border = { top: { style: 'medium', color: { argb: GOLD_HEX } } };
    });

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
        [exp.date, exp.description, exp.type === 'fixed' ? 'Fixed Expense' : 'Meal Expense', exp.amount].forEach((value, colIndex) => {
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
  const share = async (blob: Blob, name: string, type: string) => { const file = new File([blob], name, { type }); if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) { try { await navigator.share({ title: 'MealTrack statement', files: [file] }); } catch (error) { if ((error as DOMException).name !== 'AbortError') throw error; } return; } download(blob, name); toast.info('Statement downloaded', { description: 'Your browser does not support file sharing, so the statement was downloaded.' }); };

  const presets: { key: PresetKey; label: string }[] = [
    { key: 'cycle', label: 'Full cycle' },
    { key: '7d', label: 'Last 7 days' },
    { key: '30d', label: 'Last 30 days' },
    { key: 'month', label: 'This month' },
  ];

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <header className="relative overflow-hidden rounded-2xl border p-4 sm:p-7 shadow-sm" style={{ backgroundImage: `linear-gradient(135deg, ${INK} 0%, ${INK_SOFT} 60%, #0A1B17 100%)` }}>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 select-none font-heading text-[9rem] font-bold leading-none opacity-[0.06]"
          style={{ color: GOLD }}
        >
          M
        </div>
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex h-10 w-10 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl font-heading text-lg font-bold shadow-md" style={{ backgroundColor: GOLD, color: INK }}>
              M
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold font-heading tracking-tight text-white sm:text-3xl truncate">Reports</h1>
              <p className="hidden sm:block mt-1 text-sm leading-6" style={{ color: GOLD_SOFT }}>
                Premium statements and exports, ready to share with your mess.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ── Control panel ── */}
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

      {/* ── Statement preview ── */}
      <div
        className="mx-auto max-w-4xl overflow-x-auto rounded-3xl p-4 pb-6 sm:p-8"
        style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(14,36,32,0.06), transparent 60%)' }}
      >
        <div
          ref={previewRef}
          className="relative min-w-[820px] overflow-hidden rounded-2xl shadow-[0_28px_70px_-24px_rgba(14,36,32,0.45)] ring-1 ring-black/5"
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
            className="relative px-7 py-6 text-white sm:px-8 sm:py-7"
            style={{ backgroundImage: `linear-gradient(135deg, ${INK} 0%, ${INK_SOFT} 55%, #0A1B17 100%)` }}
          >
            <div className="flex items-start justify-between gap-6">
              <div className="flex items-center gap-3.5">
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-heading text-lg font-bold sm:h-12 sm:w-12"
                  style={{ backgroundColor: GOLD, color: INK }}
                >
                  M
                </div>
                <div>
                  <p className="font-heading text-lg font-bold leading-tight sm:text-xl">MealTrack</p>
                  <p className="text-[11.5px]" style={{ color: GOLD_SOFT }}>Statement of Meal Accounts</p>
                </div>
              </div>
              <div className="text-right">
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
          <div className="relative grid grid-cols-2 sm:grid-cols-4 divide-x" style={{ backgroundColor: MIST, borderColor: HAIRLINE, borderBottomWidth: 1, borderBottomStyle: 'solid' }}>
            <MetaCell label="Cycle" value={cycleLabel} />
            <MetaCell label="Prepared by" value={preparedBy} />
            <MetaCell label="Members" value={String(report.rows.length)} />
            <MetaCell label="Meal Rate" value={currency(report.rate)} />
          </div>

          {/* expense composition */}
          {!isLoading && report.totalExpenses > 0 && (
            <div className="px-7 pt-6 sm:px-8">
              <p className="text-[12.5px] font-semibold" style={{ color: INK }}>Expense composition</p>
              <div className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: MIST }}>
                <div style={{ width: `${report.mealPct}%`, backgroundColor: REFUND_GREEN }} />
                <div style={{ width: `${100 - report.mealPct}%`, backgroundColor: GOLD }} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 font-medium" style={{ color: REFUND_GREEN }}>
                  <Utensils className="h-3 w-3" /> Meal · {currency(report.totalMealExpenses)} ({report.mealPct}%)
                </span>
                <span className="flex items-center gap-1.5 font-medium" style={{ color: '#8A6D34' }}>
                  <ShoppingBag className="h-3 w-3" /> Fixed · {currency(report.totalFixedExpenses)} ({100 - report.mealPct}%)
                </span>
              </div>
            </div>
          )}

          {/* table */}
          <div className="p-7 sm:p-8">
            <div className="overflow-hidden rounded-lg" style={{ border: `1px solid ${HAIRLINE}` }}>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr style={{ backgroundColor: INK }}>
                    <th className="p-3 text-left font-semibold text-white">Member</th>
                    <th className="p-3 text-right font-semibold text-white">Meals</th>
                    <th className="p-3 text-right font-semibold text-white">Deposit</th>
                    <th className="p-3 text-right font-semibold text-white">Bill</th>
                    <th className="p-3 text-right font-semibold text-white">Due</th>
                    <th className="p-3 text-right font-semibold text-white">Refund</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, index) => (
                      <tr key={index} style={{ backgroundColor: index % 2 ? '#F6F4EE' : 'transparent' }}>
                        <td className="p-3"><Skeleton className="h-4 w-28" /></td>
                        <td className="p-3 text-right"><Skeleton className="ml-auto h-4 w-12" /></td>
                        <td className="p-3 text-right"><Skeleton className="ml-auto h-4 w-16" /></td>
                        <td className="p-3 text-right"><Skeleton className="ml-auto h-4 w-16" /></td>
                        <td className="p-3 text-right"><Skeleton className="ml-auto h-4 w-12" /></td>
                        <td className="p-3 text-right"><Skeleton className="ml-auto h-4 w-12" /></td>
                      </tr>
                    ))
                  ) : report.rows.length ? (
                    <>
                      {report.rows.map((row, index) => (
                        <tr key={row.id} style={{ backgroundColor: index % 2 ? '#F6F4EE' : 'transparent' }}>
                          <td className="p-3 font-semibold">{row.name}</td>
                          <td className="p-3 text-right tabular-nums">{mealCount(row.meals)}</td>
                          <td className="p-3 text-right tabular-nums">{currency(row.deposit)}</td>
                          <td className="p-3 text-right tabular-nums">{currency(row.bill)}</td>
                          <td className="p-3 text-right font-bold tabular-nums" style={{ color: DUE_RED }}>
                            {row.balance < 0 ? currencyInt(Math.abs(row.balance)) : '–'}
                          </td>
                          <td className="p-3 text-right font-bold tabular-nums" style={{ color: REFUND_GREEN }}>
                            {row.balance > 0 ? currencyInt(row.balance) : '–'}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: `2px solid ${GOLD}` }}>
                        <td className="p-3 font-bold" style={{ backgroundColor: PAPER }}>Totals</td>
                        <td className="p-3 text-right font-bold tabular-nums" style={{ backgroundColor: PAPER }}>{mealCount(report.totalMeals)}</td>
                        <td className="p-3 text-right font-bold tabular-nums" style={{ backgroundColor: PAPER }}>{currency(report.totalDeposits)}</td>
                        <td className="p-3 text-right font-bold tabular-nums" style={{ backgroundColor: PAPER }}>{currency(report.totalBill)}</td>
                        <td className="p-3 text-right font-bold tabular-nums" style={{ backgroundColor: PAPER, color: DUE_RED }}>{currencyInt(report.totalDue)}</td>
                        <td className="p-3 text-right font-bold tabular-nums" style={{ backgroundColor: PAPER, color: REFUND_GREEN }}>{currencyInt(report.totalRefund)}</td>
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-10 text-center" style={{ color: `${INK}99` }}>
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
              <p className="mt-3 text-[11px] italic" style={{ color: `${INK}80` }}>
                Due is owed to the mess by the member; Refund is owed to the member by the mess.
              </p>
            )}
          </div>

          {/* footer signature */}
          <div className="relative border-t px-8 py-5 text-center" style={{ borderColor: HAIRLINE }}>
            <div className="mx-auto mb-2.5 h-px w-14" style={{ backgroundColor: `${GOLD}70` }} />
            <p className="text-[11px]" style={{ color: `${INK}80` }}>Prepared via MealTrack</p>
          </div>
        </div>
      </div>
    </div>
  );
}
