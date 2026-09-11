import { ExitCode } from "bailian-cli-core";
import { describe, expect, test } from "vite-plus/test";
import { resolveSandboxImage, SANDBOX_IMAGES } from "../src/commands/sandbox/images.ts";
import {
  buildTemplateCreateBody,
  buildTemplateUpdateBody,
} from "../src/commands/sandbox/template.ts";

const EXPECTED_IMAGES = [
  ["code-interpreter", "代码解释器", "code-interpreter-v1"],
  ["browser", "浏览器", "browser"],
  ["all-in-one", "全能型", "all-in-one"],
] as const;

describe("Sandbox built-in image presets", () => {
  test("contains exactly the three pinned images with icons and bilingual descriptions", () => {
    expect(SANDBOX_IMAGES.map((image) => image.id)).toEqual(EXPECTED_IMAGES.map(([id]) => id));
    for (const image of SANDBOX_IMAGES) {
      expect(image.icon).toMatch(/^https:\/\/img\.alicdn\.com\/.*\.png$/);
      expect(image.description["en-US"]).not.toBe("");
      expect(image.description["zh-CN"]).not.toBe("");
    }
  });

  test.each(EXPECTED_IMAGES)(
    "%s maps both selectors to the exact create/update payload",
    async (id, imageName, repositoryName) => {
      const fromImage = `fc-e2b-registry.cn-beijing.cr.aliyuncs.com/runtime/${repositoryName}:v0.0.44`;
      for (const selector of [id, imageName]) {
        expect(resolveSandboxImage(selector)).toMatchObject({ id, imageName, imageUrl: fromImage });
        expect(
          await buildTemplateCreateBody({
            image: selector,
            name: "test",
            cpuCount: 1,
            memoryMb: 2048,
            async: false,
          }),
        ).toEqual({ name: "test", cpuCount: 1, memoryMB: 2048, fromImage, imageName });
        expect(
          await buildTemplateUpdateBody({
            image: selector,
            templateId: "template-test",
            async: false,
          }),
        ).toEqual({ fromImage, imageName });
      }
    },
  );

  test("preset fields override body fields without sending catalog metadata", async () => {
    expect(
      await buildTemplateUpdateBody({
        image: "browser",
        templateId: "template-test",
        async: false,
        body: JSON.stringify({ fromImage: "body:latest", imageName: "body", description: "kept" }),
      }),
    ).toEqual({
      fromImage: "fc-e2b-registry.cn-beijing.cr.aliyuncs.com/runtime/browser:v0.0.44",
      imageName: "浏览器",
      description: "kept",
    });
  });

  test("explicit custom image fields override the corresponding preset fields", async () => {
    expect(
      await buildTemplateUpdateBody({
        image: "browser",
        fromImage: "custom:v2",
        imageName: "custom name",
        templateId: "template-test",
        async: false,
      }),
    ).toEqual({ fromImage: "custom:v2", imageName: "custom name" });
    expect(
      await buildTemplateUpdateBody({
        image: "browser",
        imageName: "renamed",
        templateId: "template-test",
        async: false,
      }),
    ).toEqual({
      fromImage: "fc-e2b-registry.cn-beijing.cr.aliyuncs.com/runtime/browser:v0.0.44",
      imageName: "renamed",
    });
  });

  test("without --image, display names and custom URLs retain their previous behavior", async () => {
    expect(
      await buildTemplateUpdateBody({
        imageName: "浏览器",
        templateId: "template-test",
        async: false,
      }),
    ).toEqual({ imageName: "浏览器" });
    expect(
      await buildTemplateCreateBody({
        name: "test",
        cpuCount: 4,
        memoryMb: 8192,
        async: false,
        body: '{"fromImage":"custom:latest","imageName":"custom"}',
      }),
    ).toEqual({
      name: "test",
      cpuCount: 4,
      memoryMB: 8192,
      fromImage: "custom:latest",
      imageName: "custom",
    });
    expect(
      await buildTemplateCreateBody({
        name: "test",
        cpuCount: 1,
        memoryMb: 2048,
        async: false,
      }),
    ).not.toHaveProperty("fromImage");
    expect(
      await buildTemplateUpdateBody({
        description: "only description",
        templateId: "template-test",
        async: false,
      }),
    ).toEqual({ description: "only description" });
  });

  test("rejects unknown presets locally", () => {
    expect(() => resolveSandboxImage("unknown")).toThrowError(
      expect.objectContaining({ exitCode: ExitCode.USAGE }),
    );
  });
});
