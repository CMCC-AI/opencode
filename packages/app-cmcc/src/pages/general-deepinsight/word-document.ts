import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  ImageRun,
  ImportedXmlComponent,
  LevelFormat,
  LineRuleType,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type ILevelsOptions,
  type IParagraphOptions,
  type IRunOptions,
  type ParagraphChild,
} from "docx"

const bodyFont = "仿宋_GB2312"
const lineSpacing = { before: 0, after: 0, line: 560, lineRule: LineRuleType.EXACT }
const noIndent = { firstLine: 0 }
const headingParagraph = { indent: noIndent, spacing: lineSpacing, keepNext: true, keepLines: true }
const pageWidth = 9360

type Context = {
  style: string
  bold?: boolean
  indent?: { left: number; hanging?: number; firstLine?: number }
  numbering?: { reference: string; level: number }
}

export async function createResearchWord(element: HTMLElement) {
  await waitForCharts(element)
  const snapshot = element.cloneNode(true) as HTMLElement
  const copies = snapshot.querySelectorAll("canvas")
  element
    .querySelectorAll("canvas")
    .forEach((canvas, index) => copies[index]?.getContext("2d")?.drawImage(canvas, 0, 0))
  const numbering: { reference: string; levels: ILevelsOptions[] }[] = []
  const title = snapshot.querySelector("h1")
  const headings = Array.from(snapshot.querySelectorAll("h1,h2,h3,h4,h5,h6"))
  const headingOffset = title
    ? 1
    : headings.length
      ? Math.min(...headings.map((heading) => Number(heading.tagName.slice(1)))) - 1
      : 0

  const inline = async (node: Node, formatting: IRunOptions = {}): Promise<ParagraphChild[]> => {
    if (node.nodeType === 3) return [new TextRun({ ...formatting, text: node.textContent ?? "" })]
    if (node.nodeType !== 1) return []
    const child = node as HTMLElement
    if (ignored(child)) return []
    if (child.tagName === "BR") return [new TextRun({ ...formatting, break: 1 })]
    if (child.tagName === "IMG") return [await image(child as HTMLImageElement)]
    if (child.tagName === "INPUT")
      return child.getAttribute("type") === "checkbox"
        ? [new TextRun({ ...formatting, text: (child as HTMLInputElement).checked ? "☑ " : "☐ " })]
        : []
    const next = {
      ...formatting,
      ...(["B", "STRONG"].includes(child.tagName) ? { bold: true } : {}),
      ...(["I", "EM"].includes(child.tagName) ? { italics: true } : {}),
      ...(["DEL", "S"].includes(child.tagName) ? { strike: true } : {}),
      ...(child.tagName === "SUP" ? { superScript: true } : {}),
      ...(child.tagName === "SUB" ? { subScript: true } : {}),
      ...(child.tagName === "CODE" ? { font: "Consolas" } : {}),
    }
    const content = (await Promise.all(Array.from(child.childNodes, (node) => inline(node, next)))).flat()
    if (child.tagName === "A") {
      const href = child.getAttribute("href") ?? ""
      if (/^(https?:\/\/|mailto:)/i.test(href)) return [new ExternalHyperlink({ link: href, children: content })]
    }
    return content
  }

  const blocks = async (parent: Element, context: Context): Promise<(Paragraph | Table)[]> => {
    const output: (Paragraph | Table)[] = []
    let pending: Node[] = []
    let numbered = false
    const paragraph = (children: ParagraphChild[], extra: IParagraphOptions = {}) => {
      const current = !numbered ? context.numbering : undefined
      numbered = true
      return new Paragraph({
        style: context.style,
        ...(context.indent ? { indent: context.indent } : {}),
        ...(current ? { numbering: current } : {}),
        children,
        ...extra,
      })
    }
    const flush = async () => {
      if (pending.some((node) => node.nodeType === 1 || node.textContent?.trim()))
        output.push(paragraph((await Promise.all(pending.map((node) => inline(node, { bold: context.bold })))).flat()))
      pending = []
    }
    for (const node of Array.from(parent.childNodes)) {
      if (node.nodeType !== 1) {
        pending.push(node)
        continue
      }
      const child = node as HTMLElement
      if (ignored(child)) continue
      const tag = child.tagName
      if (/^H[1-6]$/.test(tag)) {
        await flush()
        const level = Math.min(3, Math.max(1, Number(tag.slice(1)) - headingOffset))
        output.push(
          new Paragraph({ style: child === title ? "Title" : `Heading${level}`, children: await inline(child) }),
        )
        continue
      }
      if (tag === "P" || tag === "FIGCAPTION") {
        await flush()
        output.push(
          paragraph(
            await inline(child, { bold: context.bold }),
            child.querySelector("img")
              ? { style: "ResearchImage", indent: noIndent }
              : tag === "FIGCAPTION"
                ? { style: "ResearchCaption", indent: noIndent }
                : {},
          ),
        )
        continue
      }
      if (tag === "PRE") {
        await flush()
        output.push(
          new Paragraph({
            style: "ResearchCode",
            children: (child.textContent ?? "")
              .split(/\r?\n/)
              .map((line, index) => new TextRun({ text: line, ...(index ? { break: 1 } : {}) })),
          }),
        )
        continue
      }
      if (tag === "UL" || tag === "OL") {
        await flush()
        const depth = Array.from(ancestors(child)).filter((ancestor) => ["UL", "OL"].includes(ancestor.tagName)).length
        const reference = `research-list-${numbering.length}`
        const left = Math.min(depth + 1, 9) * 720
        numbering.push({
          reference,
          levels: [
            {
              level: 0,
              format: tag === "OL" ? LevelFormat.DECIMAL : LevelFormat.BULLET,
              text: tag === "OL" ? "%1." : "•",
              start: Math.max(1, Number(child.getAttribute("start")) || 1),
              style: { run: { font: bodyFont, size: 32 }, paragraph: { indent: { left, hanging: 360 } } },
            },
          ],
        })
        for (const item of Array.from(child.children).filter((item) => item.tagName === "LI"))
          output.push(
            ...(await blocks(item, {
              style: "ResearchList",
              indent: { left, hanging: 360 },
              numbering: { reference, level: 0 },
            })),
          )
        continue
      }
      if (tag === "TABLE") {
        await flush()
        const rows = Array.from((child as HTMLTableElement).rows)
        const columns = Math.max(
          1,
          ...rows.map((row) => Array.from(row.cells).reduce((count, cell) => count + cell.colSpan, 0)),
        )
        const border = { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" }
        output.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: Array.from({ length: columns }, () => Math.floor(pageWidth / columns)),
            borders: {
              top: border,
              bottom: border,
              left: border,
              right: border,
              insideHorizontal: border,
              insideVertical: border,
            },
            rows: await Promise.all(
              rows.map(
                async (row) =>
                  new TableRow({
                    ...(row.parentElement?.tagName === "THEAD" ? { tableHeader: true } : {}),
                    children: await Promise.all(
                      Array.from(
                        row.cells,
                        async (cell) =>
                          new TableCell({
                            children: await blocks(cell, { style: "ResearchTable", bold: cell.tagName === "TH" }),
                            width: { size: (100 * cell.colSpan) / columns, type: WidthType.PERCENTAGE },
                            columnSpan: cell.colSpan,
                            rowSpan: cell.rowSpan,
                            verticalAlign: VerticalAlign.CENTER,
                            margins: { top: 100, bottom: 100, left: 120, right: 120 },
                            ...(cell.tagName === "TH" ? { shading: { fill: "F2F2F2" } } : {}),
                          }),
                      ),
                    ),
                  }),
              ),
            ),
          }),
        )
        continue
      }
      if (tag === "CANVAS") {
        await flush()
        const host = child.closest(".research-chart")
        if (host && host.querySelector("canvas") !== child) continue
        const source = child as HTMLCanvasElement
        const canvas = element.ownerDocument.createElement("canvas")
        canvas.width = source.width
        canvas.height = source.height
        const drawing = canvas.getContext("2d")
        if (!drawing || !canvas.width || !canvas.height) throw new Error("报告图表尚未完成渲染，请稍后重试")
        for (const layer of host ? Array.from(host.querySelectorAll("canvas")) : [source])
          drawing.drawImage(layer, 0, 0)
        output.push(
          new Paragraph({
            style: "ResearchImage",
            children: [
              new ImageRun({
                type: "png",
                data: base64(canvas.toDataURL("image/png")),
                transformation: dimensions(canvas.width, canvas.height),
              }),
            ],
          }),
        )
        continue
      }
      if (tag === "IMG") {
        await flush()
        output.push(new Paragraph({ style: "ResearchImage", children: [await image(child as HTMLImageElement)] }))
        continue
      }
      if (["DIV", "SECTION", "ARTICLE", "FIGURE", "BLOCKQUOTE", "HEADER", "FOOTER"].includes(tag)) {
        await flush()
        const nested = await blocks(child, {
          ...context,
          numbering: numbered ? undefined : context.numbering,
          ...(tag === "FIGURE" || tag === "BLOCKQUOTE"
            ? { style: "ResearchCaption", indent: { left: 0, firstLine: 0 } }
            : {}),
        })
        output.push(...nested)
        if (nested.some((block) => block instanceof Paragraph)) numbered = true
        continue
      }
      if (tag !== "HR") pending.push(node)
    }
    await flush()
    return output.length ? output : [paragraph([])]
  }

  const children = await blocks(snapshot, { style: "ResearchBody" })
  const document = new Document({
    styles: {
      default: {
        document: { run: { font: bodyFont, size: 32, color: "000000" }, paragraph: { spacing: lineSpacing } },
        title: {
          run: { font: "小标宋简体", size: 44, bold: false, color: "000000" },
          paragraph: {
            alignment: AlignmentType.CENTER,
            indent: noIndent,
            spacing: { before: 0, after: 240, line: 640, lineRule: LineRuleType.EXACT },
            keepNext: true,
          },
        },
        heading1: { run: { font: "黑体", size: 32, bold: false, color: "000000" }, paragraph: headingParagraph },
        heading2: { run: { font: "楷体_GB2312", size: 32, bold: false, color: "000000" }, paragraph: headingParagraph },
        heading3: { run: { font: "仿宋", size: 32, bold: true, color: "000000" }, paragraph: headingParagraph },
        hyperlink: { run: { color: "000000" } },
      },
      paragraphStyles: [
        { id: "ResearchList", name: "研究列表", basedOn: "Normal", paragraph: { spacing: lineSpacing } },
        {
          id: "ResearchTable",
          name: "研究表格",
          basedOn: "Normal",
          paragraph: { indent: noIndent, spacing: lineSpacing },
        },
        {
          id: "ResearchCaption",
          name: "研究图注",
          basedOn: "Normal",
          paragraph: { indent: noIndent, spacing: lineSpacing },
        },
        {
          id: "ResearchImage",
          name: "研究图片",
          basedOn: "Normal",
          paragraph: { indent: noIndent, spacing: { before: 120, after: 120, line: 240, lineRule: LineRuleType.AUTO } },
        },
        {
          id: "ResearchCode",
          name: "研究代码",
          basedOn: "Normal",
          run: { font: "Consolas", size: 24 },
          paragraph: { indent: noIndent, spacing: { line: 360, lineRule: LineRuleType.AT_LEAST } },
        },
      ],
    },
    numbering: { config: numbering },
    sections: [
      {
        properties: {
          page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
        },
        children,
      },
    ],
  })
  // The SDK exposes twips only; add Word's native two-character body indent.
  const body = new ImportedXmlComponent("w:style", { "w:type": "paragraph", "w:styleId": "ResearchBody" })
  body.push(new ImportedXmlComponent("w:name", { "w:val": "研究正文" }))
  body.push(new ImportedXmlComponent("w:basedOn", { "w:val": "Normal" }))
  const properties = new ImportedXmlComponent("w:pPr")
  properties.push(new ImportedXmlComponent("w:ind", { "w:firstLine": "640", "w:firstLineChars": "200" }))
  body.push(properties)
  document.Styles.addChildElement(body)
  return Packer.toBlob(document)
}

function ignored(element: HTMLElement) {
  return (
    ["BUTTON", "SCRIPT", "STYLE", "SVG"].includes(element.tagName) ||
    element.hidden ||
    element.getAttribute("aria-hidden") === "true"
  )
}

function* ancestors(element: Element): Generator<Element> {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) yield parent
}

function base64(data: string) {
  return Uint8Array.from(atob(data.slice(data.indexOf(",") + 1)), (char) => char.charCodeAt(0))
}

function dimensions(width: number, height: number) {
  const scale = Math.min(1, 624 / width, 864 / height)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

async function image(element: HTMLImageElement) {
  const source = element.currentSrc || element.src
  if (!/^(https?:|blob:|data:image\/)/i.test(source)) throw new Error("报告图片地址不支持导出")
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(source, { signal: controller.signal })
    if (!response.ok) throw new Error(`报告图片加载失败（HTTP ${response.status}）`)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    try {
      const decoded = element.ownerDocument.createElement("img")
      decoded.src = url
      await decoded.decode()
      const canvas = element.ownerDocument.createElement("canvas")
      canvas.width = decoded.naturalWidth
      canvas.height = decoded.naturalHeight
      const context = canvas.getContext("2d")
      if (!context) throw new Error("报告图片无法转换")
      context.drawImage(decoded, 0, 0)
      return new ImageRun({
        type: "png",
        data: base64(canvas.toDataURL("image/png")),
        transformation: dimensions(canvas.width, canvas.height),
        altText: { title: element.alt, description: element.alt, name: element.alt || "报告图片" },
      })
    } finally {
      URL.revokeObjectURL(url)
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function waitForCharts(element: HTMLElement) {
  const charts = Array.from(element.querySelectorAll<HTMLElement>(".research-chart"))
  if (!charts.length) return
  const { getInstanceByDom } = await import("echarts")
  const deadline = Date.now() + 10000
  while (
    charts.some(
      (chart) =>
        !getInstanceByDom(chart) ||
        !chart.querySelector("canvas") ||
        !getInstanceByDom(chart)!.getZr().animation.isFinished(),
    )
  ) {
    if (Date.now() >= deadline) throw new Error("报告图表尚未完成渲染，请稍后重试")
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
