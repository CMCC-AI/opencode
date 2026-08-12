import { For, type JSX } from "solid-js"
import brandMark from "@cmcc/assets/home-v6/brand-mark.svg"
import background from "@cmcc/assets/home-v6/background.svg"
import robotSheet from "@cmcc/assets/home-v6/robot-sheet.png"
import capabilityResearch from "@cmcc/assets/home-v6/capability-research.svg"
import capabilityFinance from "@cmcc/assets/home-v6/capability-finance.svg"
import capabilityPhoto from "@cmcc/assets/home-v6/capability-photo.svg"
import capabilityNews from "@cmcc/assets/home-v6/capability-news.svg"

const capabilities = [
  { icon: capabilityResearch, label: "深度研究", width: "w-[100px]" },
  { icon: capabilityFinance, label: "财经分析", width: "w-[100px]" },
  { icon: capabilityPhoto, label: "拍照即懂", width: "w-[100px]" },
  { icon: capabilityNews, label: "行业资讯追踪", width: "w-[132px]" },
]

export function CmccNewSessionHome(props: { children: JSX.Element }) {
  return (
    <div data-component="session-new-design" class="relative size-full overflow-y-auto rounded-[10px] bg-white">
      <img src={background} alt="" class="pointer-events-none absolute inset-0 size-full object-cover opacity-70" />
      <div class="relative mx-auto flex min-h-[900px] w-[calc(100%_-_48px)] max-w-[1046px] flex-col pb-10 pt-[132px]">
        <div class="flex flex-col items-center">
          <div class="flex items-center gap-[26px]">
            <img src={brandMark} alt="" class="size-20 shrink-0" />
            <h1 class="bg-[linear-gradient(90deg,#8800ff_0%,#2c5dff_100%)] bg-clip-text text-[48px] font-medium leading-none text-transparent">
              DeepInsight深度洞察
            </h1>
          </div>
          <p class="mt-2 text-base leading-6 text-[#a2a6b0]">
            您的私人研究助理，一键生成博士级深度研究报告，AI赋能产业洞察
          </p>
        </div>
        <div class="relative mx-auto mt-[117px] w-full max-w-[800px]">
          <div class="absolute -top-[50px] h-[88px] w-full rounded-[16px] bg-[linear-gradient(173deg,rgba(123,119,253,0.4)_2%,rgba(89,188,254,0)_100%)]" />
          <div class="absolute -top-[40px] left-[10px] z-10 flex gap-2">
            <For each={capabilities}>
              {(item) => (
                <div
                  class={`flex h-[30px] items-center gap-1 rounded-lg bg-[linear-gradient(90deg,rgba(255,255,255,0.6),rgba(255,255,255,0.6)),linear-gradient(180deg,#c5bcff_0%,#d2ddff_100%)] px-2 text-base leading-6 ${item.width}`}
                  style={{ color: "#7368ab" }}
                >
                  <img src={item.icon} alt="" class="size-4 shrink-0" />
                  {item.label}
                </div>
              )}
            </For>
          </div>
          <div class="pointer-events-none absolute -right-1 -top-[102px] z-20 h-[110px] w-[101px] overflow-hidden">
            <img src={robotSheet} alt="" class="absolute h-[338%] w-[409%] max-w-none -left-[266%] -top-[220%]" />
          </div>
          <div class="relative z-10">{props.children}</div>
        </div>
      </div>
    </div>
  )
}
