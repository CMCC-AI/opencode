export type ExcelPreviewCell = {
  value: string
  colSpan?: number
  rowSpan?: number
  hidden?: boolean
}

export type ExcelPreviewSheet = {
  name: string
  rows: ExcelPreviewCell[][]
  columnWidths: number[]
  totalRows: number
  totalColumns: number
  truncated: boolean
}

export type ExcelPreviewWorkbook = {
  sheets: ExcelPreviewSheet[]
}

const MAX_ROWS = 1_000
const MAX_COLUMNS = 100
const MIN_ROWS = 20
const MIN_COLUMNS = 12

export async function parseExcelPreview(data: ArrayBuffer): Promise<ExcelPreviewWorkbook> {
  const { read, utils } = await import("xlsx")
  const workbook = read(data, { type: "array", cellDates: true, cellStyles: true })

  return {
    sheets: workbook.SheetNames.flatMap((name) => {
      const sheet = workbook.Sheets[name]
      if (!sheet) return []

      const range = utils.decode_range(sheet["!ref"] ?? "A1:A1")
      const totalRows = range.e.r + 1
      const totalColumns = range.e.c + 1
      const rowCount = Math.min(Math.max(totalRows, MIN_ROWS), MAX_ROWS)
      const columnCount = Math.min(Math.max(totalColumns, MIN_COLUMNS), MAX_COLUMNS)
      const starts = new Map<string, { colSpan: number; rowSpan: number }>()
      const covered = new Set<string>()

      for (const merge of sheet["!merges"] ?? []) {
        if (merge.s.r >= rowCount || merge.s.c >= columnCount) continue
        const endRow = Math.min(merge.e.r, rowCount - 1)
        const endColumn = Math.min(merge.e.c, columnCount - 1)
        starts.set(`${merge.s.r}:${merge.s.c}`, {
          rowSpan: endRow - merge.s.r + 1,
          colSpan: endColumn - merge.s.c + 1,
        })
        for (let row = merge.s.r; row <= endRow; row++) {
          for (let column = merge.s.c; column <= endColumn; column++) {
            if (row === merge.s.r && column === merge.s.c) continue
            covered.add(`${row}:${column}`)
          }
        }
      }

      const rows = Array.from({ length: rowCount }, (_, row) =>
        Array.from({ length: columnCount }, (_, column) => {
          const key = `${row}:${column}`
          if (covered.has(key)) return { value: "", hidden: true }
          const cell = sheet[utils.encode_cell({ r: row, c: column })]
          const span = starts.get(key)
          return {
            value:
              cell?.w ??
              (cell?.v instanceof Date
                ? cell.v.toLocaleString()
                : cell?.v === undefined || cell.v === null
                  ? cell?.f
                    ? `=${cell.f}`
                    : ""
                  : String(cell.v)),
            ...span,
          }
        }),
      )

      return [
        {
          name,
          rows,
          columnWidths: Array.from({ length: columnCount }, (_, column) => {
            const width = sheet["!cols"]?.[column]
            return Math.min(320, Math.max(64, width?.wpx ?? (width?.wch ? width.wch * 7 + 16 : 96)))
          }),
          totalRows,
          totalColumns,
          truncated: totalRows > MAX_ROWS || totalColumns > MAX_COLUMNS,
        },
      ]
    }),
  }
}
