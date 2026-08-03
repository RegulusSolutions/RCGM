"use client";

import { downloadUrl, UPLOAD_ACCEPT, type DocumentMeta } from "@/lib/documents";

export function DocumentControl({
  label,
  doc,
  canUpload,
  uploading,
  onUpload,
}: {
  label: string;
  doc: DocumentMeta | undefined;
  canUpload: boolean;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  if (!doc && !canUpload) return null;
  return (
    <div className="flex items-center gap-2">
      {doc && (
        <a
          href={downloadUrl(doc.id)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-[12.5px] font-medium hover:bg-muted"
        >
          {label}
        </a>
      )}
      {canUpload && (
        <label className="inline-flex h-8 cursor-pointer items-center rounded-lg border border-border px-2.5 text-[12.5px] font-medium hover:bg-muted">
          {uploading ? "Uploading…" : doc ? "Replace" : `Attach ${label.toLowerCase()}`}
          <input
            type="file"
            accept={UPLOAD_ACCEPT}
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onUpload(file);
            }}
          />
        </label>
      )}
    </div>
  );
}
