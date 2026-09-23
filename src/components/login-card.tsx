"use client";

import { useState } from "react";
import { useAuth, type Me } from "@/lib/auth-store";
import { cn } from "@/lib/utils";

type Mode = "login" | "register";

export function LoginCard() {
  const setMe = useAuth((s) => s.setMe);
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setErr("");
    try {
      const body =
        mode === "login"
          ? { username, password }
          : { username, password, displayName };
      const r = await fetch(`/api/${mode}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await r.json()) as { user?: Me; error?: string };
      if (!r.ok || !data.user) {
        setErr(data.error ?? "出错了，再试一次");
        return;
      }
      setMe(data.user);
    } catch {
      setErr("连不上服务器");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-6">
      <div className="w-full max-w-[320px]">
        <p className="text-[10px] tracking-[0.34em] text-ink-3">TODAY&apos;S PICK</p>
        <h1 className="mt-1.5 font-display text-[26px] tracking-wide text-ink">
          今天吃什么
        </h1>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-3">
          {mode === "login"
            ? "登录后点菜单会在所有设备同步"
            : "注册的账号可以点菜，但不能清空和删历史"}
        </p>

        <form onSubmit={submit} className="mt-7 flex flex-col gap-2.5">
          <Field
            label="用户名"
            value={username}
            onChange={setUsername}
            autoComplete="username"
          />
          {mode === "register" && (
            <Field label="显示名" value={displayName} onChange={setDisplayName} />
          )}
          <Field
            label="密码"
            value={password}
            onChange={setPassword}
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />

          {err && <p className="px-1 text-[11px] text-chili">{err}</p>}

          <button
            type="submit"
            disabled={busy || !username || !password}
            className={cn(
              "mt-2 h-11 rounded-full bg-accent text-[14px] tracking-wider text-white transition",
              "active:scale-[0.98] disabled:opacity-40",
            )}
          >
            {busy ? "稍等…" : mode === "login" ? "进厨房" : "注册并进厨房"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setErr("");
          }}
          className="mt-4 w-full text-center text-[11.5px] text-ink-3 underline underline-offset-4"
        >
          {mode === "login" ? "没有账号？注册一个" : "已经有账号了，去登录"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-line bg-card px-3.5 py-2.5">
      <span className="w-[42px] shrink-0 text-[11.5px] text-ink-3">{label}</span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-3"
      />
    </label>
  );
}
