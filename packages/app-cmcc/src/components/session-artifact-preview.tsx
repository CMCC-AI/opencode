import { createMemo, type ComponentProps } from "solid-js"
import { ArtifactPreview } from "./artifact-preview"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { authTokenFromCredentials } from "@/utils/server"
import { artifactPreviewKind } from "@/pages/session/artifact-preview"
import { artifactPdfPreviewUrl } from "@/pages/session/artifact-pdf-preview"

export function SessionArtifactPreview(props: ComponentProps<typeof ArtifactPreview>) {
  const sdk = useSDK()
  const serverSDK = useServerSDK()
  const pdfSrc = createMemo(() => {
    if (props.pdfSrc || artifactPreviewKind(props.path) !== "pdf") return props.pdfSrc
    const connection = serverSDK().server.http
    return artifactPdfPreviewUrl({
      serverUrl: sdk().url,
      directory: sdk().directory,
      path: props.path,
      authToken: connection.password
        ? authTokenFromCredentials({ username: connection.username, password: connection.password })
        : undefined,
    })
  })
  return <ArtifactPreview {...props} pdfSrc={pdfSrc()} />
}
