import { parseStdoutJson } from "../helpers.ts";

/** Quiet preserves the full result; consumers explicitly read its JSON fields. */
export function readUploadedFileIds(stdout: string): string[] {
  const response = parseStdoutJson<{ files: { fileId: string }[] }>(stdout);
  return response.files.map((file) => file.fileId);
}

export function readImportedFileIds(stdout: string): string[] {
  const response = parseStdoutJson<{ data?: { addFileResultList?: { fileId?: string }[] } }>(
    stdout,
  );
  return (response.data?.addFileResultList ?? []).flatMap((file) =>
    file.fileId ? [file.fileId] : [],
  );
}

export function readDocumentIds(stdout: string): string[] {
  const response = parseStdoutJson<{ data?: { rows?: { doc_id?: string }[] } }>(stdout);
  return (response.data?.rows ?? []).flatMap((document) =>
    document.doc_id ? [document.doc_id] : [],
  );
}

export function readChunkIds(stdout: string): string[] {
  const response = parseStdoutJson<{ data?: { nodes?: { metadata?: { _id?: string } }[] } }>(
    stdout,
  );
  return (response.data?.nodes ?? []).flatMap((chunk) =>
    chunk.metadata?._id ? [chunk.metadata._id] : [],
  );
}

export function readIngestionStatus(stdout: string): string {
  const response = parseStdoutJson<{ data?: { ingestion_status?: string } }>(stdout);
  return response.data?.ingestion_status ?? "UNKNOWN";
}
