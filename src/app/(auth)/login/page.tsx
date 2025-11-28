"use client";
import AuthShell from "@/components/AuthShell";
import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    setLoading(true);

    const form = e.currentTarget as HTMLFormElement;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data.error || "Invalid credentials");

      if (data.role === "OPERATOR") {
        window.location.href = "/operator/dashboard";
      } else {
        window.location.href = "/captain/dashboard";
      }
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Login to your Account">
      <form className="space-y-3" onSubmit={onSubmit}>
        <input
          className="input bg-[#1C304D] border border-white/10 placeholder-white/70 w-full px-3"
          type="email"
          name="email"
          placeholder="Email"
          required
        />

        <div className="relative">
          <input
            className="input bg-[#1C304D] border border-white/10 placeholder-white/70 w-full pr-16 px-3"
            type={show ? "text" : "password"}
            name="password"
            placeholder="Password"
            required
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/80 hover:text-white"
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>

        {err && <div className="text-red-400 text-sm">{err}</div>}

        <button
        className="w-full py-2 rounded-md font-semibold text-white transition
                  bg-[#38588B] hover:bg-[#4369A3] active:bg-[#304A73]
                  shadow-md shadow-black/30 border border-white/10
                  focus:outline-none focus:ring-2 focus:ring-[#4EA4FF]/40
                  disabled:opacity-60"
        type="submit"
        disabled={loading}
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>


        <p className="text-center text-[12px] text-white/75 mt-2">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="underline hover:text-white/90">
            Sign up
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
