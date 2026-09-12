export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-primary px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src="/logo.png" alt="Gurukul Football Academy" width={88} height={88} className="rounded-full bg-white p-1" />
          <h1 className="text-xl font-bold text-white">Gurukul FC Dashboard</h1>
          <p className="text-sm text-white/70">Staff sign-in</p>
        </div>
        {children}
      </div>
    </main>
  );
}
