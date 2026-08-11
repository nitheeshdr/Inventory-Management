import Link from "next/link";
import { Factory } from "lucide-react";
import { MobileNav, Sidebar } from "@/components/shell/sidebar";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { CommandPalette } from "@/components/shell/command-palette";
import { connectDb } from "@/db/connect";
import { CompanyProfile } from "@/db/models";

async function companyName(): Promise<string> {
  try {
    await connectDb();
    const company = await CompanyProfile.findOne().select("name").lean();
    return company?.name ?? "Sri City Plant";
  } catch {
    // The shell must still render if Mongo is unreachable, so the page below
    // can show the real connection error instead of a blank screen.
    return "Sri City Plant";
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const name = await companyName();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="no-print sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface lg:flex">
        <Link
          href="/"
          className="flex items-center gap-2.5 border-b border-border px-4 py-3.5 transition-colors hover:bg-surface-2"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-fg">
            <Factory className="h-4 w-4" strokeWidth={2} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold leading-tight text-fg">
              {name}
            </span>
            <span className="block text-[11px] text-fg-subtle">Inventory & job work</span>
          </span>
        </Link>
        <div className="scroll-thin flex-1 overflow-y-auto">
          <Sidebar />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="no-print sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-bg/85 px-4 py-2.5 backdrop-blur">
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-fg">
              <Factory className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
          </Link>
          <CommandPalette />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>

        <div className="no-print border-b border-border bg-surface px-2 py-1.5 lg:hidden">
          <MobileNav />
        </div>

        <main className="min-w-0 flex-1 px-4 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
