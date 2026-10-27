/** All requests are intercepted. This fixture never falls back to the network. */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RAG_PATHS } from "bailian-cli-core";
import { createCli } from "bailian-cli-runtime";
import sync from "../../src/commands/knowledge/doc-sync.ts";

const directory = process.env.SYNC_TEST_DIRECTORY;
if (!directory) throw new Error("SYNC_TEST_DIRECTORY required");
const remoteFile = join(directory, "fake-remote.json");
interface Remote {
  files: { fileId: string; tags: string[] }[];
  documents: { doc_id: string; tags: string[]; status: string }[];
}
const remote: Remote = existsSync(remoteFile)
  ? JSON.parse(readFileSync(remoteFile, "utf8"))
  : { files: [], documents: [{ doc_id: "sentinel", tags: [], status: "FINISH" }] };
const response = (data: unknown) => Response.json({ data });
globalThis.fetch = async (input, options) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
  );
  const path = url.pathname;
  appendFileSync(join(directory, "requests.jsonl"), `${JSON.stringify({ path })}\n`);
  const body = typeof options?.body === "string" ? JSON.parse(options.body) : {};
  if (path === RAG_PATHS.indexList)
    return response({
      rows: [{ id: "index-test", name: "test", knowledgeType: "document" }],
      total_count: 1,
    });
  if (path === RAG_PATHS.listCategory)
    return response({ categoryList: [{ categoryId: "category-test", isDefault: true }] });
  if (path === RAG_PATHS.listFile) return response({ fileList: remote.files });
  if (path === RAG_PATHS.indexFileDetails)
    return response({ rows: remote.documents, total_count: remote.documents.length });
  if (path === RAG_PATHS.applyFileUploadLease)
    return response({
      leaseId: "lease-test",
      param: { url: "https://upload.invalid/fixture-upload" },
    });
  if (path === "/fixture-upload") {
    if (new Headers(options?.headers).has("Authorization")) throw new Error("Credential leaked");
    await new Response(options?.body).text();
    return new Response("", { status: 200 });
  }
  let result: Response;
  if (path === RAG_PATHS.addFile) {
    const fileId = `file-${remote.files.length + 1}`;
    remote.files.push({ fileId, tags: body.tags });
    result = response({ fileId });
  } else if (path === RAG_PATHS.indexJobCreate) {
    if (process.env.SYNC_TEST_FAILURE === "import")
      return Response.json({ message: "original import failure" }, { status: 400 });
    const file = remote.files.find((entry) => entry.fileId === body.docIds[0]);
    if (!file) throw new Error("Unknown import source");
    remote.documents.push({ doc_id: `doc-${file.fileId}`, tags: file.tags, status: "FINISH" });
    result = response({ ingestionId: file.fileId });
  } else if (path === RAG_PATHS.indexJobStatus) {
    return response({
      total_count: 1,
      rows: [{ doc_id: `doc-${url.searchParams.get("job_id")}`, code: "FINISH" }],
    });
  } else if (path === RAG_PATHS.indexDeleteFile) {
    remote.documents = remote.documents.filter((entry) => !body.doc_ids.includes(entry.doc_id));
    result = response({ deleted: body.doc_ids });
  } else throw new Error(`Unexpected request blocked: ${path}`);
  writeFileSync(remoteFile, JSON.stringify(remote));
  return result;
};
void createCli(
  { "knowledge doc sync": sync },
  {
    binName: "bl",
    version: "0.0.0-test",
    npmPackage: "bailian-cli",
    clientName: "sync-test",
  },
).run();
