export default function HistoryPage() {
  return (
    <div className="px-4 pt-4">
      <h1 className="font-display text-[22px] tracking-wider text-ink">历史订单</h1>
      <p className="mt-1 text-[11px] text-ink-3">锁单后会自动归档到这里</p>

      <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-line-2 py-20 text-center">
        <p className="font-display text-[15px] tracking-wider text-ink-3">还没有记录</p>
        <p className="mt-2 px-10 text-[11px] leading-relaxed text-ink-3">
          这一页接 Cloudflare D1，等框架确认后再接上
        </p>
      </div>
    </div>
  );
}
