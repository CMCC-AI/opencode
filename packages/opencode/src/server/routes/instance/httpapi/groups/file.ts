import { NonNegativeInt, RelativePath } from "@opencode-ai/core/schema"
import { LSP } from "@/lsp/lsp"
import { Schema } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { Authorization } from "../middleware/authorization"
import { InstanceContextMiddleware } from "../middleware/instance-context"
import {
  WorkspaceRoutingMiddleware,
  WorkspaceRoutingQuery,
  WorkspaceRoutingQueryFields,
} from "../middleware/workspace-routing"
import { described } from "./metadata"

export const FileQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  path: Schema.String,
})

export const FilePreviewQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  path: Schema.String,
  runtime: Schema.optional(Schema.String),
})

export const FindTextQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  pattern: Schema.String,
})

export const FindFileQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  query: Schema.String,
  dirs: Schema.optional(Schema.Literals(["true", "false"])),
  type: Schema.optional(Schema.Literals(["file", "directory"])),
  limit: Schema.optional(
    Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(200)),
  ),
})

export const FindSymbolQuery = Schema.Struct({
  ...WorkspaceRoutingQueryFields,
  query: Schema.String,
})

export const CreateDirectoryPayload = Schema.Struct({
  path: Schema.String,
})

export const UploadPayload = Schema.Struct({
  path: RelativePath,
  content: Schema.String,
  encoding: Schema.Literal("base64"),
})

export const UploadResult = Schema.Struct({
  path: RelativePath,
})

export const RemovePayload = Schema.Struct({
  path: RelativePath,
  recursive: Schema.optional(Schema.Boolean),
})

export const RemoveResult = Schema.Struct({
  path: RelativePath,
})

export const ArchivePayload = Schema.Struct({
  paths: Schema.Array(Schema.String),
})

export const LegacyMatch = Schema.Struct({
  path: Schema.Struct({ text: Schema.String }),
  lines: Schema.Struct({ text: Schema.String }),
  line_number: NonNegativeInt,
  absolute_offset: NonNegativeInt,
  submatches: Schema.Array(
    Schema.Struct({
      match: Schema.Struct({ text: Schema.String }),
      start: NonNegativeInt,
      end: NonNegativeInt,
    }),
  ),
})

export const LegacyEntry = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  absolute: Schema.String,
  type: Schema.Literals(["file", "directory"]),
  ignored: Schema.Boolean,
}).annotate({ identifier: "FileNode" })

export const LegacyContent = Schema.Struct({
  type: Schema.Literals(["text", "binary"]),
  content: Schema.String,
  diff: Schema.optional(Schema.String),
  patch: Schema.optional(
    Schema.Struct({
      oldFileName: Schema.String,
      newFileName: Schema.String,
      oldHeader: Schema.optional(Schema.String),
      newHeader: Schema.optional(Schema.String),
      hunks: Schema.Array(
        Schema.Struct({
          oldStart: NonNegativeInt,
          oldLines: NonNegativeInt,
          newStart: NonNegativeInt,
          newLines: NonNegativeInt,
          lines: Schema.Array(Schema.String),
        }),
      ),
      index: Schema.optional(Schema.String),
    }),
  ),
  encoding: Schema.optional(Schema.Literal("base64")),
  mimeType: Schema.optional(Schema.String),
}).annotate({ identifier: "FileContent" })

export const LegacyStatus = Schema.Struct({
  path: Schema.String,
  added: NonNegativeInt,
  removed: NonNegativeInt,
  status: Schema.Literals(["added", "deleted", "modified"]),
}).annotate({ identifier: "File" })

export const KnowledgeGraph = Schema.Struct({
  nodes: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      path: Schema.String,
      label: Schema.String,
      degree: NonNegativeInt,
      inDegree: NonNegativeInt,
      outDegree: NonNegativeInt,
      x: Schema.Number.check(Schema.isFinite()),
      y: Schema.Number.check(Schema.isFinite()),
    }),
  ),
  edges: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      source: Schema.String,
      target: Schema.String,
    }),
  ),
}).annotate({ identifier: "KnowledgeGraph" })

export const FilePaths = {
  findText: "/find",
  findFile: "/find/file",
  findSymbol: "/find/symbol",
  list: "/file",
  content: "/file/content",
  download: "/file/download",
  preview: "/file/preview",
  archive: "/file/archive",
  createDirectory: "/file/directory",
  upload: "/file/upload",
  remove: "/file",
  knowledgeGraph: "/file/knowledge-graph",
  status: "/file/status",
} as const

export const FileApi = HttpApi.make("file")
  .add(
    HttpApiGroup.make("file")
      .add(
        HttpApiEndpoint.get("findText", FilePaths.findText, {
          query: FindTextQuery,
          success: described(Schema.Array(LegacyMatch), "Matches"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "find.text",
            summary: "Find text",
            description: "Search for text patterns across files in the project using ripgrep.",
          }),
        ),
        HttpApiEndpoint.get("findFile", FilePaths.findFile, {
          query: FindFileQuery,
          success: described(Schema.Array(Schema.String), "File paths"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "find.files",
            summary: "Find files",
            description: "Search for files or directories by name or pattern in the project directory.",
          }),
        ),
        HttpApiEndpoint.get("findSymbol", FilePaths.findSymbol, {
          query: FindSymbolQuery,
          success: described(Schema.Array(LSP.Symbol), "Symbols"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "find.symbols",
            summary: "Find symbols",
            description: "Search for workspace symbols like functions, classes, and variables using LSP.",
          }),
        ),
        HttpApiEndpoint.get("list", FilePaths.list, {
          query: FileQuery,
          success: described(Schema.Array(LegacyEntry), "Files and directories"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "file.list",
            summary: "List files",
            description: "List files and directories in a specified path.",
          }),
        ),
        HttpApiEndpoint.get("content", FilePaths.content, {
          query: FileQuery,
          success: described(LegacyContent, "File content"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "file.read",
            summary: "Read file",
            description: "Read the content of a specified file.",
          }),
        ),
        HttpApiEndpoint.get("download", FilePaths.download, {
          query: FileQuery,
          success: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array()),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "file.download",
            summary: "Download file",
            description: "Download a file from the current workspace without altering its contents.",
          }),
        ),
        HttpApiEndpoint.get("preview", FilePaths.preview, {
          query: FilePreviewQuery,
          success: [
            Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array({ contentType: "application/pdf" })),
            Schema.Uint8Array.pipe(
              HttpApiSchema.asUint8Array({ contentType: "application/pdf" }),
              HttpApiSchema.status(206),
            ),
            Schema.String.pipe(HttpApiSchema.asText({ contentType: "text/html; charset=utf-8" })),
          ],
          error: [HttpApiError.BadRequest, HttpApiSchema.Empty(416)],
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "file.preview",
            summary: "Preview PDF or HTML file",
            description:
              "Stream a PDF file with byte range support or render an isolated HTML report from the current workspace.",
          }),
        ),
        HttpApiEndpoint.post("archive", FilePaths.archive, {
          query: WorkspaceRoutingQuery,
          payload: ArchivePayload,
          success: Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array({ contentType: "application/zip" })),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "file.archive",
            summary: "Download file archive",
            description: "Download selected workspace files as a ZIP archive.",
          }),
        ),
        HttpApiEndpoint.post("upload", FilePaths.upload, {
          query: WorkspaceRoutingQuery,
          payload: UploadPayload,
          success: described(UploadResult, "Uploaded file"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "file.upload",
            summary: "Upload file",
            description:
              "Upload a base64-encoded file into the current workspace without overwriting an existing file.",
          }),
        ),
        HttpApiEndpoint.delete("remove", FilePaths.remove, {
          query: WorkspaceRoutingQuery,
          payload: RemovePayload,
          success: described(RemoveResult, "Deleted path"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "file.remove",
            summary: "Delete file or directory",
            description:
              "Permanently delete a file or directory inside the current workspace. Directories require recursive=true.",
          }),
        ),
        HttpApiEndpoint.get("knowledgeGraph", FilePaths.knowledgeGraph, {
          query: WorkspaceRoutingQuery,
          success: described(KnowledgeGraph, "Knowledge graph"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "file.knowledgeGraph",
            summary: "Build knowledge graph",
            description: "Build a notebook knowledge graph from indexed LLM Wiki Markdown links.",
          }),
        ),
        HttpApiEndpoint.get("status", FilePaths.status, {
          query: WorkspaceRoutingQuery,
          success: described(Schema.Array(LegacyStatus), "File status"),
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "file.status",
            summary: "Get file status",
            description: "Get the git status of all files in the project.",
          }),
        ),
      )
      .annotateMerge(
        OpenApi.annotations({
          title: "file",
          description: "Experimental HttpApi file routes.",
        }),
      )
      // Creating the CMCC workspace only needs routing and authorization. Add it after
      // instance middleware so a recursive mkdir does not bootstrap a project instance.
      .middleware(InstanceContextMiddleware)
      .add(
        HttpApiEndpoint.post("createDirectory", FilePaths.createDirectory, {
          query: WorkspaceRoutingQuery,
          payload: CreateDirectoryPayload,
          success: described(Schema.Void, "Created directory"),
          error: HttpApiError.BadRequest,
        }).annotateMerge(
          OpenApi.annotations({
            identifier: "file.createDirectory",
            summary: "Create directory",
            description: "Create a local directory recursively.",
          }),
        ),
      )
      .middleware(WorkspaceRoutingMiddleware)
      .middleware(Authorization),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "opencode experimental HttpApi",
      version: "0.0.1",
      description: "Experimental HttpApi surface for selected instance routes.",
    }),
  )
