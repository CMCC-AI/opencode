#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CJK_SAMPLE = "产业洞察报告字体校验";
const FONT_FAMILY = "OpenCode Report CJK";

export async function exportReportPdf(options) {
  const input = resolve(options.input || "");
  const output = resolve(options.output || join(dirname(input), `${input.split(/[\\/]/).at(-1)?.replace(/\.html?$/i, "") || "report"}.pdf`));
  if (!options.input) throw new Error("缺少 HTML 输入路径");
  if (!(await stat(input)).isFile()) throw new Error(`HTML 不存在：${input}`);
  requireAscii(options.headerLabel || "", "页眉标签");
  requireAscii(options.footerLabel || "", "页脚标签");

  const browser = await findBrowser();
  const font = await findCjkFont();
  const profile = await mkdtemp(join(tmpdir(), `${options.profilePrefix || "report-pdf"}-`));
  const chrome = spawn(browser, [
    "--headless=new", "--disable-gpu", "--disable-extensions", "--allow-file-access-from-files",
    "--remote-debugging-pipe", `--user-data-dir=${profile}`, "about:blank"
  ], { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] });
  let browserError = "";
  chrome.stderr.on("data", (chunk) => { browserError += chunk.toString(); });
  let client;

  try {
    client = new CdpClient(chrome.stdio[3], chrome.stdio[4]);
    chrome.once("error", (error) => client.fail(error));
    chrome.once("exit", (code, signal) => client.fail(new Error(`浏览器提前退出：${signal || code}`)));
    const target = await client.send("Target.createTarget", { url: "about:blank" });
    const attached = await client.send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
    await client.send("Page.enable", {}, attached.sessionId);
    await client.send("Runtime.enable", {}, attached.sessionId);
    await client.send("DOM.enable", {}, attached.sessionId);
    await client.send("CSS.enable", {}, attached.sessionId);
    await client.send("Emulation.setEmulatedMedia", { media: "print" }, attached.sessionId);
    await client.send("Page.navigate", { url: pathToFileURL(input).href }, attached.sessionId);
    await waitForReport(client, attached.sessionId);
    const fontAudit = await installAndVerifyFont(client, attached.sessionId, font);
    await runPageChecks(client, attached.sessionId, options.pageChecks);

    const result = await client.send("Page.printToPDF", {
      displayHeaderFooter: true,
      headerTemplate: headerTemplate(options.headerLabel || ""),
      footerTemplate: footerTemplate(options.footerLabel || ""),
      printBackground: true,
      preferCSSPageSize: true,
      marginTop: 0.42,
      marginBottom: 0.42,
      marginLeft: 0,
      marginRight: 0,
      transferMode: "ReturnAsBase64"
    }, attached.sessionId);
    const pdf = Buffer.from(result.data, "base64");
    if (pdf.length < 1024 || pdf.subarray(0, 4).toString() !== "%PDF") throw new Error("浏览器返回的文件不是有效 PDF");
    await writeFile(output, pdf);
    process.stdout.write(`已生成 PDF：${output}（${pdf.length} 字节，中文字体：${fontAudit.join("、")}）\n`);
  } catch (error) {
    const suffix = browserError.trim() ? `\n浏览器：${browserError.trim().slice(-1200)}` : "";
    throw new Error(`${error.message}${suffix}`);
  } finally {
    client?.close();
    chrome.kill("SIGTERM");
    if (chrome.exitCode === null) {
      await Promise.race([
        new Promise((done) => chrome.once("exit", done)),
        new Promise((done) => setTimeout(done, 2000))
      ]);
    }
    await cleanupProfile(profile);
  }
}

function requireAscii(value, label) {
  if (/^[\x20-\x7e]*$/.test(value)) return;
  throw new Error(`${label}只允许 ASCII；中文内容请放入报告正文，避免 Chrome 独立页眉页脚丢失字形`);
}

async function findBrowser() {
  const configured = process.env.CHROME_PATH ? executablePaths(process.env.CHROME_PATH) : [];
  const candidates = [
    ...configured,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    process.env.ProgramFiles ? join(process.env.ProgramFiles, "Google/Chrome/Application/chrome.exe") : null,
    process.env["ProgramFiles(x86)"] ? join(process.env["ProgramFiles(x86)"], "Microsoft/Edge/Application/msedge.exe") : null,
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"
  ].filter(Boolean);
  const checked = await Promise.all(candidates.map((candidate) => access(candidate).then(() => candidate, () => null)));
  const browser = checked.find(Boolean);
  if (browser) return browser;
  throw new Error("未找到 Chrome、Edge 或 Chromium；可通过 CHROME_PATH 指定可执行文件");
}

function executablePaths(value) {
  if (value.includes("/") || value.includes("\\")) return [resolve(value)];
  return (process.env.PATH || "").split(delimiter).filter(Boolean).map((directory) => join(directory, value));
}

async function findCjkFont() {
  const configured = process.env.REPORT_PDF_FONT_REGULAR ? [{
    regular: resolve(process.env.REPORT_PDF_FONT_REGULAR),
    bold: resolve(process.env.REPORT_PDF_FONT_BOLD || process.env.REPORT_PDF_FONT_REGULAR),
    systemFamily: process.env.REPORT_PDF_FONT_FAMILY || "Noto Sans CJK SC"
  }] : [];
  const windows = process.env.WINDIR || "C:\\Windows";
  const candidates = [
    ...configured,
    { regular: "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", bold: "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", systemFamily: "Noto Sans CJK SC" },
    { regular: "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc", bold: "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc", systemFamily: "Noto Sans CJK SC" },
    { regular: "/System/Library/Fonts/Hiragino Sans GB.ttc", bold: "/System/Library/Fonts/Hiragino Sans GB.ttc", systemFamily: "Hiragino Sans GB" },
    { regular: join(windows, "Fonts/msyh.ttc"), bold: join(windows, "Fonts/msyhbd.ttc"), systemFamily: "Microsoft YaHei" }
  ];
  const checked = await Promise.all(candidates.map(async (candidate) => {
    const files = await Promise.all([candidate.regular, candidate.bold].map((file) => access(file).then(() => true, () => false)));
    return files.every(Boolean) ? candidate : null;
  }));
  const font = checked.find(Boolean);
  if (font) return font;
  throw new Error("未找到可嵌入的中文字体；请安装 Noto Sans CJK，或设置 REPORT_PDF_FONT_REGULAR/REPORT_PDF_FONT_BOLD");
}

async function waitForReport(client, sessionId) {
  const started = Date.now();
  while (Date.now() - started < 30000) {
    const result = await client.send("Runtime.evaluate", {
      expression: '({complete:document.readyState==="complete",ready:window.__REPORT_READY__!==false,fallbacks:Array.from(document.querySelectorAll(".fallback")).filter(function(el){return el.offsetParent!==null}).map(function(el){return el.textContent.trim()}),rawTableSyntax:/\\|(?:\\s*:?-{3,}:?\\s*\\|){2,}/.test((document.getElementById("report-body")||{}).innerText||"")})',
      returnByValue: true
    }, sessionId);
    const state = result.result?.value || {};
    if (state.fallbacks?.length) throw new Error(`HTML 有未渲染内容：${state.fallbacks.join("；")}`);
    if (state.rawTableSyntax) throw new Error("HTML 正文仍显示未渲染的 Markdown 表格语法");
    if (state.complete && state.ready) return;
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error("HTML、字体或图表在 30 秒内未完成渲染");
}

async function installAndVerifyFont(client, sessionId, font) {
  const regularUrl = pathToFileURL(font.regular).href;
  const boldUrl = pathToFileURL(font.bold).href;
  const css = `
    @font-face { font-family: "${FONT_FAMILY}"; src: local("${font.systemFamily}"), url("${regularUrl}"); font-style: normal; font-weight: 100 500; font-display: block; }
    @font-face { font-family: "${FONT_FAMILY}"; src: local("${font.systemFamily}"), url("${boldUrl}"); font-style: normal; font-weight: 600 900; font-display: block; }
  `;
  const installed = await client.send("Runtime.evaluate", {
    expression: `(async function(){
      const style=document.createElement("style");
      style.dataset.reportPdfFont="";
      style.textContent=${JSON.stringify(css)};
      document.head.appendChild(style);
      const regular=await document.fonts.load('400 16px "${FONT_FAMILY}"', ${JSON.stringify(CJK_SAMPLE)});
      const bold=await document.fonts.load('700 16px "${FONT_FAMILY}"', ${JSON.stringify(CJK_SAMPLE)});
      await document.fonts.ready;
      if(!regular.length||!bold.length) return {ok:false,reason:"字体文件未被浏览器加载"};
      const elements=[document.body].concat(Array.from(document.body.querySelectorAll("*")));
      elements.forEach(function(element){
        if(!(element instanceof HTMLElement)&&!(element instanceof SVGElement)) return;
        const current=getComputedStyle(element).fontFamily||"sans-serif";
        element.style.setProperty("font-family", '"${FONT_FAMILY}", '+current, "important");
      });
      const descriptor=Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype,"font");
      if(descriptor&&descriptor.get&&descriptor.set&&!CanvasRenderingContext2D.prototype.__reportPdfFontPatched){
        Object.defineProperty(CanvasRenderingContext2D.prototype,"font",{
          configurable:descriptor.configurable,
          enumerable:descriptor.enumerable,
          get:descriptor.get,
          set:function(value){descriptor.set.call(this,value.includes("${FONT_FAMILY}")?value:'"${FONT_FAMILY}", '+value);}
        });
        Object.defineProperty(CanvasRenderingContext2D.prototype,"__reportPdfFontPatched",{value:true});
      }
      window.dispatchEvent(new Event("resize"));
      await new Promise(function(done){setTimeout(done,500);});
      const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
      let node;
      while((node=walker.nextNode())){
        if(!/[\\u3400-\\u9fff]/.test(node.nodeValue||"")) continue;
        const parent=node.parentElement;
        if(!parent||["SCRIPT","STYLE","NOSCRIPT","TEMPLATE"].includes(parent.tagName)) continue;
        const computed=getComputedStyle(parent);
        if(computed.display==="none"||computed.visibility!=="visible"||computed.opacity==="0") continue;
        const range=document.createRange();
        range.selectNodeContents(node);
        if(!Array.from(range.getClientRects()).some(function(rect){return rect.width>0&&rect.height>0;})) continue;
        window.__REPORT_PDF_CJK_NODE__=node;
        break;
      }
      return {ok:true,hasCjk:Boolean(node)};
    })()`,
    awaitPromise: true,
    returnByValue: true
  }, sessionId);
  const status = installed.result?.value;
  if (!status?.ok) throw new Error(`中文字体加载失败：${status?.reason || "未知错误"}`);
  if (!status.hasCjk) return [font.systemFamily];

  await client.send("DOM.getDocument", { depth: -1, pierce: true }, sessionId);
  const remoteNode = await client.send("Runtime.evaluate", { expression: "window.__REPORT_PDF_CJK_NODE__" }, sessionId);
  const requested = await client.send("DOM.requestNode", { objectId: remoteNode.result.objectId }, sessionId);
  const platform = await client.send("CSS.getPlatformFontsForNode", { nodeId: requested.nodeId }, sessionId);
  const fonts = (platform.fonts || []).filter((item) => item.glyphCount > 0);
  if (!fonts.some((item) => item.isCustomFont || item.familyName === font.systemFamily || item.familyName === FONT_FAMILY)) {
    throw new Error(`中文节点未使用指定中文字体，实际字体：${fonts.map((item) => item.familyName).join("、") || "无"}`);
  }
  return [...new Set(fonts.map((item) => item.familyName))];
}

async function runPageChecks(client, sessionId, checks) {
  for (const check of checks ?? []) {
    if (!check?.name || !check?.expression) continue;
    const result = await client.send("Runtime.evaluate", {
      expression: check.expression,
      awaitPromise: true,
      returnByValue: true
    }, sessionId);
    const value = result.result?.value;
    const problems = Array.isArray(value)
      ? value.filter((item) => item !== null && item !== undefined && item !== "")
      : typeof value === "string" && value.trim()
        ? [value.trim()]
        : [];
    if (problems.length) throw new Error(`${check.name}未通过：${problems.join("；")}`);
  }
}

function headerTemplate(label) {
  return `<div style="width:100%;padding:0 18mm;font-family:Arial,sans-serif;font-size:8px;color:#64748b;border-bottom:1px solid #e2e8f0;display:flex;justify-content:flex-end"><span>${escapeHtml(label)}</span></div>`;
}

function footerTemplate(label) {
  return `<div style="width:100%;padding:0 18mm;font-family:Arial,sans-serif;font-size:8px;color:#94a3b8;display:flex;justify-content:space-between"><span>${escapeHtml(label)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

async function cleanupProfile(profile) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const removed = await rm(profile, { recursive: true, force: true, maxRetries: 2, retryDelay: 150 }).then(() => true, () => false);
    if (removed) return;
    await new Promise((done) => setTimeout(done, 250));
  }
  process.stderr.write(`无法清理临时浏览器目录：${profile}\n`);
}

class CdpClient {
  constructor(input, output) {
    this.id = 1;
    this.pending = new Map();
    this.input = input;
    this.buffer = "";
    output.setEncoding("utf8");
    output.on("data", (chunk) => {
      this.buffer += chunk;
      const messages = this.buffer.split("\0");
      this.buffer = messages.pop() || "";
      messages.filter(Boolean).forEach((value) => {
        const message = JSON.parse(value);
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        message.error ? pending.reject(new Error(message.error.message)) : pending.done(message.result || {});
      });
    });
    output.on("error", (error) => {
      this.fail(error);
    });
  }
  send(method, params = {}, sessionId) {
    const id = this.id++;
    return new Promise((done, reject) => {
      this.pending.set(id, { done, reject });
      this.input.write(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
    });
  }
  close() {
    this.input.end();
  }
  fail(error) {
    this.pending.forEach((pending) => pending.reject(error));
    this.pending.clear();
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === await realpath(resolve(process.argv[1])).catch(() => resolve(process.argv[1]))
) {
  await exportReportPdf({
    input: process.argv[2],
    output: process.argv[3],
    headerLabel: process.env.REPORT_PDF_HEADER_LABEL || "",
    footerLabel: process.env.REPORT_PDF_FOOTER_LABEL || "",
    profilePrefix: "report-pdf"
  });
}
