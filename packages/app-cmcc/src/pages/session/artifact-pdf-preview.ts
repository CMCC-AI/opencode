export function artifactPdfPreviewUrl(input: {
  serverUrl: string | URL
  directory: string
  path: string
  authToken?: string
}) {
  const url = new URL("/file/preview", input.serverUrl)
  url.searchParams.set("directory", input.directory)
  url.searchParams.set("path", input.path)
  if (input.authToken) url.searchParams.set("auth_token", input.authToken)
  return url.toString()
}
