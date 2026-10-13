export interface ReportChapter {
  id: string
  headingRaw: string
  headingText: string
  headingLevel: number | null
  body: string
}

export interface ReportDocument {
  leadingRaw: string
  chapters: ReportChapter[]
}

function headingRanges(content: string) {
  const ranges: { start: number; end: number; raw: string; level: number; text: string }[] = []
  let cursor = 0
  let fenceChar = ""
  let fenceLength = 0
  while (cursor < content.length) {
    const lineEnd = content.indexOf("\n", cursor)
    const end = lineEnd < 0 ? content.length : lineEnd + 1
    const raw = content.slice(cursor, end)
    const line = raw.replace(/\r?\n$/, "")
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (fence) {
      const marker = fence[1]!
      if (!fenceChar) {
        fenceChar = marker[0]!
        fenceLength = marker.length
      } else if (marker[0] === fenceChar && marker.length >= fenceLength) {
        fenceChar = ""
        fenceLength = 0
      }
    } else if (!fenceChar) {
      const heading = line.match(/^\s{0,3}(#{1,6})(?:[ \t]+(.*?)\s*|[ \t]*)$/)
      if (heading)
        ranges.push({
          start: cursor,
          end,
          raw,
          level: heading[1]!.length,
          text: (heading[2] || "").replace(/[ \t]+#+[ \t]*$/, "").trim(),
        })
    }
    cursor = end
  }
  return ranges
}

// Keep original heading/newline bytes when rebuilding a chapter-edited report.
export function parseReportMarkdown(content: string): ReportDocument {
  const ranges = headingRanges(content)
  if (!ranges.length)
    return {
      leadingRaw: "",
      chapters: [{ id: "chapter-0", headingRaw: "", headingText: "", headingLevel: null, body: content }],
    }
  const leading = content.slice(0, ranges[0]!.start)
  return {
    leadingRaw: leading.trim() ? "" : leading,
    chapters: [
      ...(leading.trim()
        ? [{ id: "chapter-leading", headingRaw: "", headingText: "前言", headingLevel: null, body: leading }]
        : []),
      ...ranges.map((heading, index) => ({
        id: `chapter-${index}`,
        headingRaw: heading.raw,
        headingText: heading.text,
        headingLevel: heading.level,
        body: content.slice(heading.end, ranges[index + 1]?.start ?? content.length),
      })),
    ],
  }
}

export function containsMarkdownHeading(content: string) {
  return headingRanges(content).length > 0
}

export function rebuildReportMarkdown(document: ReportDocument, chapterId: string, body: string) {
  return (
    document.leadingRaw +
    document.chapters
      .map((chapter) => {
        const content = chapter.id === chapterId ? body : chapter.body
        const separator = content && chapter.headingRaw && !/\r?\n$/.test(chapter.headingRaw) ? "\n" : ""
        return chapter.headingRaw + separator + content
      })
      .join("")
  )
}

export function replaceTextRange(content: string, start: number, end: number, replacement: string) {
  return content.slice(0, start) + replacement + content.slice(end)
}
