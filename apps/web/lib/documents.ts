import { apiFetch } from "./api";

export interface DocumentMeta {
  id: string;
  trip_id: string | null;
  owner_type: string;
  owner_id: string;
  category: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  uploaded_at: string;
}

export const UPLOAD_ACCEPT = ".jpg,.jpeg,.png,.pdf";
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);

export function listTripDocuments(tripId: string) {
  return apiFetch<DocumentMeta[]>(`/api/files?trip_id=${tripId}`);
}

export function validateUploadFile(file: File): string | null {
  if (!ALLOWED_MIME.has(file.type)) return "Only JPG, PNG or PDF files are accepted.";
  return null;
}

export function uploadDocument(params: {
  file: File;
  ownerType: "booking" | "visa" | "guest" | "companion" | "other";
  ownerId: string;
  category: "invoice" | "eta" | "passport" | "other";
  tripId: string;
}) {
  const fd = new FormData();
  fd.append("file", params.file);
  fd.append("owner_type", params.ownerType);
  fd.append("owner_id", params.ownerId);
  fd.append("category", params.category);
  fd.append("trip_id", params.tripId);
  return apiFetch<DocumentMeta>("/api/files", { method: "POST", body: fd });
}

export function downloadUrl(documentId: string) {
  return `/api/files/${documentId}/download`;
}
