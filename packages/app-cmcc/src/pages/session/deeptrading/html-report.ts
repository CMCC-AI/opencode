export type DeepTradingHtmlReportPreviewInput = {
  serverUrl: string | URL
  directory: string
  path: string
  runtimeUrl: string
  pageOrigin: string
  authToken?: string
}

export function deepTradingHtmlReportPreviewUrl(input: DeepTradingHtmlReportPreviewInput) {
  const url = new URL("/file/preview", input.serverUrl)
  url.searchParams.set("directory", input.directory)
  url.searchParams.set("path", input.path)
  url.searchParams.set("runtime", new URL(input.runtimeUrl, input.pageOrigin).toString())
  if (input.authToken) url.searchParams.set("auth_token", input.authToken)
  return url.toString()
}
