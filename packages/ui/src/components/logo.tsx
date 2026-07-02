import { type ComponentProps } from "solid-js"

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="0"
        y="17"
        fill="currentColor"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="18"
        font-weight="bold"
      >
        DI
      </text>
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="10"
        y="65"
        fill="currentColor"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="48"
        font-weight="bold"
      >
        DI
      </text>
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 240 42"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <text
        x="0"
        y="32"
        fill="currentColor"
        font-family="system-ui, -apple-system, sans-serif"
        font-size="32"
        font-weight="800"
        letter-spacing="-0.03em"
      >
        Deep<tspan font-weight="400">Insight</tspan>
      </text>
    </svg>
  )
}
