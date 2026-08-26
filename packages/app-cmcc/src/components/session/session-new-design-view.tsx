import type { JSX } from "solid-js"
import jiutianLogo from "@/assets/home-v6/jiutian-logo.png"

export function NewSessionDesignView(props: { children: JSX.Element }) {
  return (
    <div
      data-component="session-new-design"
      class="relative grid size-full min-h-0 justify-items-center overflow-y-auto bg-white"
      style={{
        padding: "48px 40px",
        "grid-template-rows": "minmax(max-content, 1fr) auto minmax(0, 1fr)",
        "font-family":
          "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        "-webkit-font-smoothing": "antialiased",
        "-moz-osx-font-smoothing": "grayscale",
      }}
    >
      <div class="flex w-full max-w-[900px] self-end flex-col items-center" style={{ "padding-bottom": "60px" }}>
        <div
          class="flex items-center justify-center"
          style={{
            gap: "12px",
            "margin-bottom": "12px",
          }}
        >
          <img
            src={jiutianLogo}
            alt="九天"
            style={{
              width: "54px",
              height: "54px",
              "object-fit": "contain",
              flex: "0 0 auto",
            }}
          />
          <h1
            style={{
              margin: "0",
              "font-size": "39px",
              "font-weight": "500",
              "line-height": "1.25",
              "padding-bottom": "6px",
              "margin-bottom": "-6px",
              "letter-spacing": "0",
              background: "linear-gradient(135deg, #1e3a8a 0%, #5b4fd7 50%, #9b59f0 100%)",
              "-webkit-background-clip": "text",
              "-webkit-text-fill-color": "transparent",
              "background-clip": "text",
              "font-family":
                "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
            }}
          >
            DeepInsight深度洞察
          </h1>
        </div>
        <p
          style={{
            margin: "0",
            "font-size": "23px",
            "font-weight": "400",
            color: "#9ca3af",
            "line-height": "1.5",
            "text-align": "center",
            "font-family":
              "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
            "-webkit-font-smoothing": "antialiased",
            "-moz-osx-font-smoothing": "grayscale",
          }}
        >
          您的智能研究助理，一键式深度研究与自动化科研，赋能AI+产业洞察
        </p>
      </div>
      <div
        class="relative z-10 mx-auto w-full"
        style={{
          "max-width": "min(90%, 810px)",
          width: "900px",
        }}
      >
        {props.children}
      </div>
      <div aria-hidden="true" />
    </div>
  )
}
