import { type ComponentProps } from "solid-js"

type SvgClassProps = Pick<ComponentProps<"svg">, "ref" | "class">

export const DeepInsightMark = (props: SvgClassProps) => {
  return (
    <svg
      ref={props.ref}
      data-component="deepinsight-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="4" y="4" width="72" height="92" rx="14" fill="var(--icon-weak-base)" opacity="0.24" />
      <path
        d="M22 24H42C53.0457 24 62 32.9543 62 44V56C62 67.0457 53.0457 76 42 76H22V24ZM34 36V64H42C46.4183 64 50 60.4183 50 56V44C50 39.5817 46.4183 36 42 36H34Z"
        fill="var(--icon-strong-base)"
      />
    </svg>
  )
}

export const DeepInsightLogo = (props: SvgClassProps) => {
  return (
    <svg
      ref={props.ref}
      data-component="deepinsight-logo"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 320 42"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="0"
        y="31"
        fill="var(--icon-strong-base)"
        font-family="Inter, system-ui, sans-serif"
        font-size="37"
        font-weight="700"
      >
        DeepInsight
      </text>
    </svg>
  )
}

export function DeepInsightWordmark(props: Pick<ComponentProps<"svg">, "class">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 900 129"
      fill="none"
      preserveAspectRatio="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <defs>
        <linearGradient id="deepinsight-wordmark-fade" x1="450" y1="0" x2="450" y2="112" gradientUnits="userSpaceOnUse">
          <stop stop-color="currentColor" stop-opacity="0.7" />
          <stop offset="1" stop-color="currentColor" stop-opacity="0" />
        </linearGradient>
        <filter
          id="deepinsight-wordmark-shadow"
          x="0"
          y="0"
          width="900"
          height="130"
          filterUnits="userSpaceOnUse"
          color-interpolation-filters="sRGB"
        >
          <feFlood flood-opacity="0" result="BackgroundImageFix" />
          <feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="1" />
          <feGaussianBlur stdDeviation="1" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" />
          <feBlend mode="normal" in2="shape" result="effect1_innerShadow_4938_16028" />
        </filter>
      </defs>
      <text
        x="0"
        y="96"
        fill="url(#deepinsight-wordmark-fade)"
        filter="url(#deepinsight-wordmark-shadow)"
        font-family="Inter, system-ui, sans-serif"
        font-size="122"
        font-weight="760"
        textLength="900"
        lengthAdjust="spacingAndGlyphs"
        opacity="0.16"
      >
        DeepInsight
      </text>
    </svg>
  )
}
