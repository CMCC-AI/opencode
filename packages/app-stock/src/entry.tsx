import { render } from "solid-js/web"
import { App } from "./app"
import "./index.css"

const root = document.getElementById("root")
if (!(root instanceof HTMLElement)) throw new Error("找不到应用挂载节点")
render(() => <App />, root)
