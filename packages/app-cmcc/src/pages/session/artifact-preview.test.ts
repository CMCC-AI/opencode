import { describe, expect, test } from "bun:test"
import {
  artifactBytes,
  artifactBuffer,
  artifactDataUrl,
  artifactExtension,
  artifactImageMimeType,
  artifactPreviewKind,
  artifactText,
  resolveArtifactPath,
} from "./artifact-preview"

describe("artifact preview", () => {
  test("classifies supported document formats case-insensitively", () => {
    expect(artifactPreviewKind("reports/brief.DOCX")).toBe("docx")
    expect(artifactPreviewKind("reports/model.xlsx")).toBe("excel")
    expect(artifactPreviewKind("slides/deck.pptx")).toBe("pptx")
    expect(artifactPreviewKind("notes/readme.markdown")).toBe("markdown")
    expect(artifactPreviewKind("source/main.go")).toBe("text")
    expect(artifactPreviewKind("site/index.HTML")).toBe("html")
    expect(artifactPreviewKind("images/chart.svg")).toBe("image")
    expect(artifactPreviewKind("images/chart.PNG")).toBe("image")
    expect(artifactPreviewKind("images/photo.JPG")).toBe("image")
    expect(artifactPreviewKind("legacy/report.doc")).toBe("unsupported")
  })

  test("normalizes Windows paths when reading extensions", () => {
    expect(artifactExtension("output\\report.PDF")).toBe("pdf")
  })

  test("decodes base64 content for renderers", () => {
    const encoded = btoa("hello")
    expect(new TextDecoder().decode(artifactBytes(encoded))).toBe("hello")
    expect(new TextDecoder().decode(artifactBuffer(encoded, "base64"))).toBe("hello")
    expect(artifactText(encoded, "base64")).toBe("hello")
  })

  test("builds encoded text and binary data URLs", () => {
    expect(artifactDataUrl({ content: "<svg></svg>" }, "image/svg+xml")).toBe(
      "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E",
    )
    expect(artifactDataUrl({ content: "aGVsbG8=", encoding: "base64" }, "application/pdf")).toBe(
      "data:application/pdf;base64,aGVsbG8=",
    )
  })

  test("infers image MIME types from filenames when servers omit them", () => {
    expect(artifactImageMimeType("images/logo.SVG")).toBe("image/svg+xml")
    expect(artifactImageMimeType("images/photo.jpg")).toBe("image/jpeg")
    expect(artifactImageMimeType("images/chart.png", "application/octet-stream")).toBe("image/png")
    expect(artifactImageMimeType("images/chart.png", "image/x-custom")).toBe("image/x-custom")
  })

  test("resolves inline filenames and relative links to known artifacts", () => {
    const paths = ["conversation-203229/中国商业航天简报.docx", "reports/brief.pdf"]
    expect(resolveArtifactPath("中国商业航天简报.docx", paths)).toBe(paths[0])
    expect(resolveArtifactPath("./reports/brief.pdf#page=2", paths)).toBe(paths[1])
    expect(resolveArtifactPath("https://example.com/brief.pdf", paths)).toBeUndefined()
    expect(resolveArtifactPath("brief.unknown", paths)).toBeUndefined()
  })

  test("does not guess when duplicate filenames exist", () => {
    expect(resolveArtifactPath("brief.pdf", ["one/brief.pdf", "two/brief.pdf"])).toBeUndefined()
  })
})
