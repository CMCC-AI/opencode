declare module "virtual:cmcc-report-runtime" {
  const url: string
  export default url
}

declare module "echarts/dist/echarts.min.js" {
  const echarts: typeof import("echarts")
  export default echarts
}
