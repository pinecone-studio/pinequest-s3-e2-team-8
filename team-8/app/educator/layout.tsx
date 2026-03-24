import Header from "./_features/Header";
import Sidebar from "./_features/Sidebar";

export default function EducatorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <Header />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
