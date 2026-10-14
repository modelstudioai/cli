import { describe, expect, test, vi } from "vite-plus/test";
import {
  cancelCompressJob,
  createCompressJob,
  deleteCompressJob,
  getCompressJob,
  getCompressJobLogs,
  listCompressJobs,
  listCompressTemplates,
  type Client,
} from "../src/index.ts";

function mockClient(response: unknown = {}) {
  const requestJson = vi.fn<Client["requestJson"]>().mockResolvedValue(response);
  return { client: { requestJson } as unknown as Client, requestJson };
}

describe("model compression API", () => {
  test("serializes template and job-list query parameters", async () => {
    const templates = mockClient();
    await listCompressTemplates(templates.client, { model: "qwen ft/?", lang: "en-US" });
    expect(templates.requestJson).toHaveBeenCalledWith({
      path: "/api/v1/fine-tunes/compress/templates?model=qwen+ft%2F%3F&lang=en-US",
      method: "GET",
      signal: undefined,
    });

    const jobs = mockClient();
    await listCompressJobs(jobs.client, {
      status: "SUCCEEDED",
      model: "qwen-ft",
      templateId: "tpl-1",
      quantSpec: "w4a16",
      quantMethod: "gptq",
      startTime: "2026-04-01",
      endTime: "2026-04-30",
      searchKey: "name",
      selectKey: "job_name",
      sortOrder: "asc",
      pageNo: 2,
      pageSize: 20,
    });
    expect(jobs.requestJson.mock.calls[0]?.[0].path).toBe(
      "/api/v1/fine-tunes/compress/jobs?status=SUCCEEDED&model=qwen-ft&template_id=tpl-1&quant_spec=w4a16&quant_method=gptq&start_time=2026-04-01&end_time=2026-04-30&search_key=name&select_key=job_name&sort_order=asc&page_no=2&page_size=20",
    );
  });

  test("maps create, get, logs, cancel, and delete endpoints", async () => {
    const { client, requestJson } = mockClient();
    await createCompressJob(client, { model: "qwen-ft", template_id: "tpl-1" });
    await getCompressJob(client, "quant /?#");
    await getCompressJobLogs(client, "quant /?#", { offset: 10, line: 50 });
    await cancelCompressJob(client, "quant /?#");
    await deleteCompressJob(client, "quant /?#");

    expect(requestJson.mock.calls.map(([options]) => [options.method, options.path])).toEqual([
      ["POST", "/api/v1/fine-tunes/compress/jobs"],
      ["GET", "/api/v1/fine-tunes/compress/jobs/quant%20%2F%3F%23"],
      ["GET", "/api/v1/fine-tunes/compress/jobs/quant%20%2F%3F%23/logs?offset=10&line=50"],
      ["POST", "/api/v1/fine-tunes/compress/jobs/quant%20%2F%3F%23/cancel"],
      ["DELETE", "/api/v1/fine-tunes/compress/jobs/quant%20%2F%3F%23"],
    ]);
  });
});
