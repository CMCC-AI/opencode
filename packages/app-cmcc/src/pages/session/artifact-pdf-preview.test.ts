import { expect, test } from "bun:test"
import { artifactPdfPreviewUrl } from "./artifact-pdf-preview"

test("uses the existing PDF endpoint with encoded workspace and file paths", () => {
  const url = new URL(
    artifactPdfPreviewUrl({
      serverUrl: "https://example.com",
      directory: "D:/workspace/用户 3",
      path: "runs/a/财务报告 #1.pdf",
    }),
  )
  expect(url.origin).toBe("https://example.com")
  expect(url.pathname).toBe("/file/preview")
  expect(url.searchParams.get("directory")).toBe("D:/workspace/用户 3")
  expect(url.searchParams.get("path")).toBe("runs/a/财务报告 #1.pdf")
  expect(url.searchParams.has("runtime")).toBe(false)
  expect(url.searchParams.has("auth_token")).toBe(false)
})

test("preserves the configured server auth token without adding it to the path", () => {
  const url = new URL(
    artifactPdfPreviewUrl({
      serverUrl: "http://localhost:4096",
      directory: "/workspace/user",
      path: "output.pdf",
      authToken: "test+/=",
    }),
  )
  expect(url.searchParams.get("auth_token")).toBe("test+/=")
  expect(url.pathname).toBe("/file/preview")
})
