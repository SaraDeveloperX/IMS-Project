"use client";

import AuthShell from "@/components/AuthShell";
import Link from "next/link";
import { useState } from "react";

export default function SignUpPage() {
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr("");
    setLoading(true);

    const form = e.currentTarget as HTMLFormElement;

    const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    const pass = (form.elements.namedItem("password") as HTMLInputElement).value;
    const confirm = (form.elements.namedItem("confirm") as HTMLInputElement).value;
    const role =
      (form.elements.namedItem("role") as HTMLSelectElement)?.value || "CAPTAIN";

    if (!name || name.length < 2) {
      setErr("Please enter your name (2+ characters).");
      setLoading(false);
      return;
    }
    if (pass.length < 6) {
      setErr("Password must be at least 6 characters.");
      setLoading(false);
      return;
    }
    if (pass !== confirm) {
      setErr("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password: pass, role }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Sign up failed");
      }

      try {
        localStorage.setItem("captainName", name);
      } catch {}

      const finalRole = data.user?.role || role;
      if (finalRole === "OPERATOR") {
        window.location.href = "/operator/dashboard";
      } else {
        window.location.href = "/captain/dashboard";
      }
    } catch (e: any) {
      setErr(e.message || "Sign up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Create your Account">
      <form className="space-y-3" onSubmit={onSubmit}>
        <input
          className="input bg-[#14233D]/60 border border-white/10 placeholder-white/70"
          type="text"
          name="name"
          placeholder="Full name"
          required
        />

        <input
          className="input bg-[#14233D]/60 border border-white/10 placeholder-white/70"
          type="email"
          name="email"
          placeholder="Email"
          required
        />

        <div className="relative">
          <input
            className="input bg-[#14233D]/60 border border-white/10 placeholder-white/70 pr-16"
            type={show ? "text" : "password"}
            name="password"
            placeholder="Password (min 6)"
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

        <input
          className="input bg-[#14233D]/60 border border-white/10 placeholder-white/70"
          type={show ? "text" : "password"}
          name="confirm"
          placeholder="Confirm Password"
          required
        />

        <select
          name="role"
          className="input bg-[#14233D]/60 border border-white/10 text-white w-full"
          required
        >
          <option value="CAPTAIN">Captain</option>
          <option value="OPERATOR">VTS Operator</option>
        </select>

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
          {loading ? "Creating…" : "Sign Up"}
        </button>

        <p className="text-center text-[12px] text-white/75 mt-2">
          Already have an account?{" "}
          <Link href="/login" className="underline hover:text-white/90">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
