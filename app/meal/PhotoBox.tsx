import { useState } from "react";
import { Icon } from "~/components/ui";
import { useSyncClient, useSyncStatus } from "~/sync/react";

async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85));
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

/** The meal's photo, or a place to add one. The photo goes to R2, so this is the meal screen's one server request. */
export function PhotoBox({ slug, photoKey, alt }: { slug: string; photoKey: string | null; alt: string }) {
  const client = useSyncClient();
  const offline = useSyncStatus()?.online === false;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("photo", await shrink(file));
      const res = await fetch(`/api/meals/${encodeURIComponent(slug)}/photo`, { method: "POST", body });
      const reply = (await res.json().catch(() => ({}))) as { ok?: true; error?: string };
      // The new photo_key comes down with the next pull, like any other change.
      if (reply.ok) void client?.sync();
      else setError(reply.error ?? "That photo didn't save.");
    } catch {
      setError("Photos need a signal");
    } finally {
      setBusy(false);
    }
  }
  const input = <input type="file" accept="image/*" capture="environment" disabled={offline || busy} onChange={onChange} className="sr-only" />;
  const label = offline ? "Photos need a signal" : busy ? "Uploading..." : null;

  return (
    <div className="flex flex-col gap-1.5">
      {photoKey ? (
        <div className="relative h-[170px] overflow-hidden rounded-[6px] bg-well">
          <img src={`/media/${photoKey}`} alt={alt} className="size-full object-cover" />
          <label aria-label={label ?? "Change photo"} className={`absolute bottom-2.5 right-2.5 flex size-11 items-center justify-center rounded-[6px] bg-paper text-ink ${offline ? "opacity-60" : "cursor-pointer"}`}>
            <Icon name="camera" size={20} strokeWidth={1.8} />
            {input}
          </label>
        </div>
      ) : (
        <div className="flex h-[170px] flex-col items-center justify-center gap-2 rounded-[6px] bg-well">
          <span className="text-ink-3">
            <Icon name="camera" size={28} strokeWidth={1.8} />
          </span>
          <label className={`flex h-11 items-center rounded-[6px] border-[1.5px] border-ink-3 px-3.5 text-[15px] font-semibold ${offline ? "opacity-60" : "cursor-pointer"}`}>
            {label ?? "Add a photo"}
            {input}
          </label>
        </div>
      )}
      {photoKey && label && <p className="text-[14px] text-ink-3">{label}</p>}
      {error && <p className="text-[14px] text-ink-2">{error}</p>}
    </div>
  );
}
