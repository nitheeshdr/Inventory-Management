import { PrintToolbar } from "@/components/print/print-toolbar";

/**
 * Print documents live outside the app shell: no sidebar, no header, white
 * ground. The toolbar is `.no-print`, so what you see below it is what comes
 * out of the printer.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-2 print:bg-white">
      <PrintToolbar />
      <div className="mx-auto max-w-[210mm] px-3 py-4 print:max-w-none print:p-0">
        {children}
      </div>
    </div>
  );
}
