import { useEffect, useState } from "react";
import { useRevalidator } from "react-router";
import { flush, pendingCount } from "~/lib/offline-queue";

export function PendingSync() {
  const [count, setCount] = useState(0);
  const revalidator = useRevalidator();

  useEffect(() => {
    const update = () => setCount(pendingCount());
    const retry = () =>
      flush().then((ok) => {
        update();
        if (ok) revalidator.revalidate();
      });
    update();
    window.addEventListener("rocky-queue", update);
    window.addEventListener("online", retry);
    const timer = window.setInterval(() => pendingCount() > 0 && retry(), 15_000);
    return () => {
      window.removeEventListener("rocky-queue", update);
      window.removeEventListener("online", retry);
      window.clearInterval(timer);
    };
  }, [revalidator]);

  if (count === 0) return null;
  return (
    <div role="status" className="glass fixed left-1/2 top-[max(12px,env(safe-area-inset-top))] z-40 -translate-x-1/2 rounded-full px-4 py-2 text-[14px] font-semibold">
      Saving {count} change{count === 1 ? "" : "s"}... (offline)
    </div>
  );
}
