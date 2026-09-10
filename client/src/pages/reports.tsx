import { useEffect, useMemo, useRef, useState } from 'react';
import { format, startOfDay, endOfDay } from 'date-fns';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { CalendarIcon, ChefHat, ClipboardCopy, Download, FileImage, FileSpreadsheet, FileText, Loader2, Play, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useMeal } from '@/lib/meal-context';
import { cn } from '@/lib/utils';
import { Link } from 'wouter';

type ReportMember = { id: string; name: string; meals: number; deposit: number; bill: number; balance: number };
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
  return <div className="min-w-0 space-y-1.5">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start py-2 text-left text-sm font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{format(value, 'PPP')}</Button></PopoverTrigger><PopoverContent className="w-[18rem] rounded-xl border bg-card p-0 shadow-2xl" align="center"><Calendar mode="single" selected={value} onSelect={(next) => next && onChange(next)} disabled={disabled} initialFocus /></PopoverContent></Popover>
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

export default function ReportsPage() {
  const { activeCycle, getCycleDetails, loading } = useMeal();
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
    return { rows, totalExpenses, totalMeals, rate };
  }, [details, from, to, fromKey, toKey]);
  const rangeLabel = format(from, 'dd MMM yyyy') + ' - ' + format(to, 'dd MMM yyyy');
  const baseName = `Mealtrack Report-${fromKey}-to-${toKey}`;
  const makePng = async () => {
    if (!previewRef.current) throw new Error('The report preview is not available.');
    const dataUrl = await toPng(previewRef.current, { cacheBust: true, pixelRatio: 2, backgroundColor: '#ffffff' });
    return { blob: await (await fetch(dataUrl)).blob() };
  };
  const makePdf = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' }); const pageWidth = doc.internal.pageSize.getWidth();
    doc.setFillColor(15, 23, 42); doc.rect(0, 0, pageWidth, 104, 'F'); doc.setFillColor(20, 184, 166); doc.circle(52, 51, 18, 'F');
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('M', 46, 57); doc.setFontSize(21); doc.text('MealTrack', 82, 45); doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('Meal Report', 82, 64); doc.text(rangeLabel, 82, 81);
    doc.setTextColor(71, 85, 105); doc.setFontSize(9); doc.text(`Generated ${format(generatedAt, 'PPP p')}`, 40, 129);
    [['TOTAL EXPENSES', pdfCurrency(report.totalExpenses)], ['TOTAL MEALS', mealCount(report.totalMeals)], ['MEAL RATE', pdfCurrency(report.rate)]].forEach(([label, value], index) => { const x = 40 + index * 174; doc.setFillColor(240, 253, 250); doc.roundedRect(x, 149, 156, 64, 8, 8, 'F'); doc.setTextColor(13, 148, 136); doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text(label, x + 13, 172); doc.setTextColor(15, 23, 42); doc.setFontSize(17); doc.text(value, x + 13, 196); });
    autoTable(doc, { startY: 238, head: [['Member', 'Meals', 'Deposit', 'Bill', 'Due', 'Refund']], body: report.rows.map((row) => [row.name, mealCount(row.meals), pdfCurrency(row.deposit), pdfCurrency(row.bill), pdfCurrencyInt(row.balance < 0 ? Math.abs(row.balance) : 0), pdfCurrencyInt(row.balance > 0 ? row.balance : 0)]), theme: 'grid', headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' }, alternateRowStyles: { fillColor: [248, 250, 252] }, styles: { fontSize: 9, cellPadding: 8, textColor: [30, 41, 59] }, columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }, margin: { left: 40, right: 40 }, didDrawPage: () => { const height = doc.internal.pageSize.getHeight(); doc.setTextColor(100, 116, 139); doc.setFontSize(8); doc.text('Generated via MealTrack', 40, height - 24); } });
    return doc.output('blob');
  };
  const makeXlsx = () => {
    const wb = XLSX.utils.book_new();
    const summaryData: (string | number)[][] = [
      ['MealTrack - Meal Report'],
      ['Date Range:', rangeLabel],
      ['Generated At:', format(generatedAt, 'PPP p')],
      [],
      ['Summary Metrics'],
      ['Total Expenses (Tk)', report.totalExpenses],
      ['Total Meals', report.totalMeals],
      ['Meal Rate (Tk)', Number(report.rate.toFixed(4))],
      [],
      ['Member Breakdown'],
      ['Member Name', 'Meals', 'Deposit (Tk)', 'Bill (Tk)', 'Due (Tk)', 'Refund (Tk)', 'Net Balance (Tk)'],
      ...report.rows.map((row) => [
        row.name,
        row.meals,
        row.deposit,
        Number(row.bill.toFixed(2)),
        row.balance < 0 ? Math.round(Math.abs(row.balance)) : 0,
        row.balance > 0 ? Math.round(row.balance) : 0,
        Number(row.balance.toFixed(2)),
      ]),
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    summaryWs['!cols'] = [
      { wch: 22 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 16 },
    ];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    if (details?.expenses?.length) {
      const expenses = (details.expenses ?? []).filter((item) => isDateInFilterRange(item.date, from, to, fromKey, toKey));
      const expenseData: (string | number)[][] = [
        ['Date', 'Title / Description', 'Category', 'Amount (Tk)'],
        ...expenses.map((exp) => [
          exp.date,
          exp.description,
          exp.type === 'fixed' ? 'Fixed Expense' : 'Meal Expense',
          exp.amount,
        ]),
      ];
      const expenseWs = XLSX.utils.aoa_to_sheet(expenseData);
      expenseWs['!cols'] = [{ wch: 14 }, { wch: 26 }, { wch: 16 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, expenseWs, 'Expenses');
    }

    const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbOut], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  };
  const run = async (task: () => Promise<void>) => { if (isGenerating) return; setIsGenerating(true); try { await task(); } catch (error) { console.error('Report generation failed:', error); toast.error('Could not create report', { description: 'Please try again. If the issue continues, refresh the page.' }); } finally { setIsGenerating(false); } };
  const share = async (blob: Blob, name: string, type: string) => { const file = new File([blob], name, { type }); if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) { try { await navigator.share({ title: 'MealTrack report', files: [file] }); } catch (error) { if ((error as DOMException).name !== 'AbortError') throw error; } return; } download(blob, name); toast.info('Report downloaded', { description: 'Your browser does not support file sharing, so the report was downloaded.' }); };
  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.11] via-card to-card p-4 sm:p-7 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex h-9 w-9 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl sm:rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
              <FileText className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold font-heading tracking-tight sm:text-3xl truncate">Reports</h1>
              <p className="hidden sm:block mt-1 text-sm leading-6 text-muted-foreground">
                Create and export professional summaries of your mess.
              </p>
            </div>
          </div>
        </div>
      </header>
      <section className="rounded-xl border bg-card p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid gap-3 sm:grid-cols-2 xl:w-[500px]">
            <DatePicker label="From" value={from} onChange={setFrom} disabled={(date) => date > to} />
            <DatePicker label="To" value={to} onChange={setTo} disabled={(date) => date < from || date > today} />
          </div>
          <div className="flex flex-wrap gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button disabled={isGenerating || isLoading}>
                  <Download className="h-4 w-4" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Download report</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void run(async () => { download(makePdf(), `${baseName}.pdf`); toast.success('PDF exported', { description: 'Your report download has started.' }); })}>
                  <FileText className="h-4 w-4" /> PDF document
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void run(async () => { download(makeXlsx(), `${baseName}.xlsx`); toast.success('Excel exported', { description: 'Your spreadsheet download has started.' }); })}>
                  <FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void run(async () => { const { blob } = await makePng(); download(blob, `${baseName}.png`); toast.success('PNG exported', { description: 'Your report image download has started.' }); })}>
                  <FileImage className="h-4 w-4" /> PNG image
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={isGenerating || isLoading}>
                  {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />} Share
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Share report</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void run(async () => { await share(makePdf(), `${baseName}.pdf`, 'application/pdf'); })}>
                  <FileText className="h-4 w-4" /> Share PDF
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void run(async () => { await share(makeXlsx(), `${baseName}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); })}>
                  <FileSpreadsheet className="h-4 w-4" /> Share Excel
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void run(async () => { const { blob } = await makePng(); await share(blob, `${baseName}.png`, 'image/png'); })}>
                  <FileImage className="h-4 w-4" /> Share PNG
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void run(async () => { const { blob } = await makePng(); if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Clipboard images are not supported.'); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast.success('Image copied', { description: 'The report image is ready to paste.' }); })}>
                  <ClipboardCopy className="h-4 w-4" /> Copy image
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-4xl overflow-x-auto pb-2">
        <div ref={previewRef} className="min-w-[820px] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-lg">
          <div className="flex items-start justify-between bg-slate-950 px-7 py-6 text-white">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-teal-400 p-2">
                <ChefHat className="h-6 w-6 text-slate-950" />
              </div>
              <div>
                <p className="text-xl font-bold">MealTrack</p>
                <p className="text-sm text-slate-300">Meal Report</p>
              </div>
            </div>
            <div className="text-right text-xs text-slate-300">
              <p className="font-semibold text-white">{rangeLabel}</p>
              <p className="mt-1">Generated {format(generatedAt, 'PPP p')}</p>
            </div>
          </div>
          <div className="p-7">
            <div className="grid grid-cols-3 gap-4">
              {isLoading ? (
                [1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg border border-teal-100 bg-teal-50/60 p-4 space-y-2">
                    <Skeleton className="h-3.5 w-24 bg-teal-200/70" />
                    <Skeleton className="h-8 w-28 bg-teal-200/70" />
                  </div>
                ))
              ) : (
                [['Total Expenses', currency(report.totalExpenses)], ['Total Meals', mealCount(report.totalMeals)], ['Current Meal Rate', currency(report.rate)]].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-teal-100 bg-teal-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-teal-700">{label}</p>
                    <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
                  </div>
                ))
              )}
            </div>
            <div className="mt-7 overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-900 text-left text-white">
                  <tr>
                    <th className="p-3">Member</th>
                    <th className="p-3 text-right">Meals</th>
                    <th className="p-3 text-right">Deposit</th>
                    <th className="p-3 text-right">Bill</th>
                    <th className="p-3 text-right">Due</th>
                    <th className="p-3 text-right">Refund</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, index) => (
                      <tr key={index} className={index % 2 ? 'bg-slate-50' : 'bg-white'}>
                        <td className="p-3">
                          <Skeleton className="h-4 w-28 bg-slate-200" />
                        </td>
                        <td className="p-3 text-right">
                          <Skeleton className="ml-auto h-4 w-12 bg-slate-200" />
                        </td>
                        <td className="p-3 text-right">
                          <Skeleton className="ml-auto h-4 w-16 bg-slate-200" />
                        </td>
                        <td className="p-3 text-right">
                          <Skeleton className="ml-auto h-4 w-16 bg-slate-200" />
                        </td>
                        <td className="p-3 text-right">
                          <Skeleton className="ml-auto h-4 w-12 bg-slate-200" />
                        </td>
                        <td className="p-3 text-right">
                          <Skeleton className="ml-auto h-4 w-12 bg-slate-200" />
                        </td>
                      </tr>
                    ))
                  ) : report.rows.length ? (
                    report.rows.map((row, index) => (
                      <tr key={row.id} className={index % 2 ? 'bg-slate-50' : 'bg-white'}>
                        <td className="p-3 font-semibold">{row.name}</td>
                        <td className="p-3 text-right">{mealCount(row.meals)}</td>
                        <td className="p-3 text-right">{currency(row.deposit)}</td>
                        <td className="p-3 text-right">{currency(row.bill)}</td>
                        <td className="p-3 text-right font-bold text-rose-700">
                          {row.balance < 0 ? currencyInt(Math.abs(row.balance)) : '-'}
                        </td>
                        <td className="p-3 text-right font-bold text-emerald-700">
                          {row.balance > 0 ? currencyInt(row.balance) : '-'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-slate-500">
                        <p>{activeCycle ? 'No active-cycle members to include in this report.' : 'Start a cycle to create a report for your mess.'}</p>
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
          </div>
          <div className="border-t border-slate-200 px-7 py-4 text-center text-xs text-slate-500">Generated via MealTrack</div>
        </div>
      </div>
    </div>
  );
}
