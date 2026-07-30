"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession, ApiError } from "@/lib/session";

const DEMO_CREDS: { u: string; p: string; r: string; vm?: boolean }[] = [
  { u: "superadmin", p: "superadmin123", r: "Super Admin" },
  { u: "admin", p: "admin123", r: "Tenant Admin" },
  { u: "marketing", p: "marketing123", r: "Marketing Agent" },
  { u: "coordinator", p: "coordinator123", r: "Coordinator" },
  { u: "reservations", p: "reservations123", r: "Reservations" },
  { u: "transport", p: "transport123", r: "Transport" },
  { u: "host", p: "host123", r: "F&B / Host", vm: true },
  { u: "manager", p: "manager123", r: "Manager", vm: true },
];

export default function LoginPage() {
  const { user, loading, login } = useSession();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [loading, user, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Invalid credentials, or user inactive.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{
        background:
          "radial-gradient(1200px 600px at 70% -10%, #21345C 0%, transparent 60%), radial-gradient(900px 500px at 0% 110%, #1A2A4C 0%, transparent 55%), var(--rcgm-navy)",
      }}
    >
      <div className="flex w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        <div
          className="hidden flex-[1.1] flex-col border-r border-border p-9 md:flex"
          style={{ background: "linear-gradient(160deg,#16243F 0%,#121E37 100%)" }}
        >
          <div
            className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl font-serif text-3xl font-bold text-[#15203A] shadow-lg"
            style={{ background: "linear-gradient(135deg,var(--rcgm-gold) 0%,var(--rcgm-gold2) 100%)" }}
          >
            J
          </div>
          <h1 className="text-xl font-semibold tracking-wide">Regulus Casino Guest Manager</h1>
          <div className="mt-1.5 text-xs tracking-[2.5px] text-[var(--rcgm-gold-soft)] uppercase">
            Guest Logistics Control Desk
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            One accountable record for the complete guest movement cycle — request, clearance, flights,
            hotels, transport, and closure. Part of the Regulus Compliance Solutions suite.
          </p>
          <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
            Demo tenant: <b className="text-[var(--rcgm-gold-soft)]">Jims Diamond Lounge</b> · Casino Marina,
            Colombo
          </p>
          <div className="mt-6 text-[11px] tracking-widest text-[#54678C]">
            RCGM · CONFIDENTIAL
          </div>
        </div>

        <div className="flex-1 p-8">
          <h2 className="mb-4 text-sm tracking-widest text-[var(--rcgm-gold-soft)]">SIGN IN</h2>
          <form onSubmit={onSubmit} className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-[11px] tracking-wide text-muted-foreground uppercase">
                Username
              </Label>
              <Input
                id="username"
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[11px] tracking-wide text-muted-foreground uppercase">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={submitting}
              className="w-full font-bold text-[#15203A]"
              style={{ background: "linear-gradient(135deg,var(--rcgm-gold),var(--rcgm-gold2))" }}
            >
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
            <div className="min-h-[18px] text-[12.5px] text-destructive">{error}</div>
          </form>

          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-2.5 text-[11px] tracking-wide text-muted-foreground uppercase">
              Demo credentials — tap to fill
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {DEMO_CREDS.map((c) => (
                <button
                  key={c.u}
                  type="button"
                  onClick={() => {
                    setUsername(c.u);
                    setPassword(c.p);
                    setError("");
                  }}
                  className="rounded-md border border-border bg-[var(--rcgm-navy3)] px-2.5 py-1.5 text-left text-[11.5px] text-muted-foreground transition-colors hover:border-[var(--rcgm-gold)] hover:text-foreground"
                >
                  <b className="block text-[12px] text-foreground">
                    {c.r}
                    {c.vm && <span className="ml-1 text-[10px] font-normal text-[var(--rcgm-gold-soft)]">· view-mode</span>}
                  </b>
                  {c.u}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
