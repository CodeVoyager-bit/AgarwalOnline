"use client";
import { useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { shrink } from "@/components/photo-input";
import { uploadTeamPhotoAction } from "@/lib/settings/actions";

/**
 * Settings → Developer and team → Your photo: picking a photo uploads it straight away (shrunk on the
 * phone first, like product photos) and fills the form's field; Save puts it on the card.
 */
export function TeamPhotoField({ name, label, hint, value }: { name: string; label: string; hint?: string; value: string }) {
  const [url, setUrl] = useState(value);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setNote({ text: "Uploading photo…" });
    try {
      const body = new FormData();
      body.set("file", await shrink(file).catch(() => file));
      const result = await uploadTeamPhotoAction(body);
      if (result.url) {
        setUrl(result.url);
        setNote({ text: "Photo ready. Save to put it on the card." });
      } else setNote({ text: result.error ?? "Unable to upload this photo. Please try again.", error: true });
    } catch {
      setNote({ text: "Unable to upload this photo. Please try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="team-photo-field">
      <span className="team-photo-label">
        {label} {hint && <small>{hint}</small>}
      </span>
      <div className="team-photo-row">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a preview of a just-uploaded photo
          <img src={url} alt="Your photo" className="dev-photo" />
        ) : (
          <span className="dev-photo is-empty" aria-hidden="true">
            <ImagePlus size={28} />
          </span>
        )}
        <div className="team-photo-actions">
          <label className={`secondary-button${busy ? " is-busy" : ""}`}>
            <ImagePlus size={18} aria-hidden="true" />
            {url ? "Change photo" : "Choose a photo"}
            <input
              type="file"
              className="sr-only"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void upload(file);
              }}
            />
          </label>
          {url && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                setUrl("");
                setNote({ text: "Photo removed. Save to take it off the card." });
              }}
            >
              <Trash2 size={16} aria-hidden="true" />
              Remove photo
            </button>
          )}
        </div>
      </div>
      {note && (
        <p role={note.error ? "alert" : "status"} className={note.error ? "error-message" : "muted"}>
          {note.text}
        </p>
      )}
      <input type="hidden" name={name} value={url} />
    </div>
  );
}
