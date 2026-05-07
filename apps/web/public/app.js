import { marked } from "https://esm.sh/marked@12.0.2";
import markedKatex from "https://esm.sh/marked-katex-extension@5.1.1";
import DOMPurify from "https://esm.sh/dompurify@3.1.6?bundle";

marked.use(
  markedKatex({
    throwOnError: false,
    nonStandard: true,
  }),
);
marked.setOptions({
  gfm: true,
  breaks: false,
});

const KATEX_TAGS = ["math", "semantics", "annotation", "mrow", "mi", "mn", "mo", "ms", "mspace", "mtext", "msub", "msup", "msubsup", "mfrac", "mroot", "msqrt", "mover", "munder", "munderover", "mtable", "mtr", "mtd", "mlabeledtr", "menclose", "mphantom", "mpadded", "mstyle", "merror", "maction"];

const SANITIZE_CONFIG = {
  ADD_TAGS: ["svg", "path", "g", "use", "defs", "line", "rect", "circle", "polyline", "polygon", "text", "tspan", "foreignObject", ...KATEX_TAGS],
  ADD_ATTR: ["xmlns", "viewBox", "fill", "stroke", "stroke-width", "d", "x", "y", "rx", "ry", "cx", "cy", "r", "transform", "preserveAspectRatio", "width", "height", "style", "class", "encoding"],
};

const chatPanel = document.querySelector("#chatPanel");
const composer = document.querySelector("#composer");
const messageInput = document.querySelector("#messageInput");
const sendButton = document.querySelector("#sendButton");
const sessionStatus = document.querySelector("#sessionStatus");
const fileInput = document.querySelector("#fileInput");
const pickFileButton = document.querySelector("#pickFileButton");
const outputFolderInput = document.querySelector("#outputFolderInput");
const pickOutputButton = document.querySelector("#pickOutputButton");
const fileStatus = document.querySelector("#fileStatus");
const markdownViewButton = document.querySelector("#markdownViewButton");
const pdfViewButton = document.querySelector("#pdfViewButton");
const viewerPlaceholder = document.querySelector("#viewerPlaceholder");
const markdownViewer = document.querySelector("#markdownViewer");
const pdfViewer = document.querySelector("#pdfViewer");
const configToggleButton = document.querySelector("#configToggleButton");
const configPanel = document.querySelector("#configPanel");
const closeConfigButton = document.querySelector("#closeConfigButton");
const divider = document.querySelector("#divider");
const workspace = document.querySelector("#workspace");

const folderModal = document.querySelector("#folderModal");
const folderModalTitle = document.querySelector("#folderModalTitle");
const folderModalCurrentPath = document.querySelector("#folderModalCurrentPath");
const folderModalUpButton = document.querySelector("#folderModalUpButton");
const folderModalSelectButton = document.querySelector("#folderModalSelectButton");
const folderModalNewButton = document.querySelector("#folderModalNewButton");
const closeFolderModalButton = document.querySelector("#closeFolderModalButton");
const folderList = document.querySelector("#folderList");

let sessionId = null;
const history = [];
let currentMarkdownContent = "";
let currentFilePath = "";
let currentOutputFolder = "";
let modalCurrentPath = "";
let modalParentPath = null;
let modalMode = "folder";

function appendMessage(role, text) {
  const node = document.createElement("article");
  node.className = `msg ${role}`;
  node.textContent = text;
  chatPanel.appendChild(node);
  chatPanel.scrollTop = chatPanel.scrollHeight;
  return node;
}

function updateFileStatus(text) {
  if (fileStatus) {
    fileStatus.textContent = text;
  }
}

function dirname(filePath) {
  const idx = filePath.lastIndexOf("/");
  return idx > 0 ? filePath.substring(0, idx) : filePath;
}

function basename(filePath) {
  const idx = filePath.lastIndexOf("/");
  return idx >= 0 ? filePath.substring(idx + 1) : filePath;
}

async function fetchDirectories(targetPath, includeFiles) {
  const params = new URLSearchParams();
  if (targetPath) params.set("path", targetPath);
  if (includeFiles) params.set("includeFiles", "md");
  const response = await fetch(`/api/fs/list?${params.toString()}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Unable to list directories (${response.status})`);
  }
  return response.json();
}

async function loadMarkdownFromPath(absolutePath) {
  const response = await fetch(`/api/fs/read?path=${encodeURIComponent(absolutePath)}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `Unable to read file (${response.status})`);
  }
  return response.json();
}

function renderMarkdownToHtml(markdownSource) {
  try {
    const rawHtml = marked.parse(markdownSource);
    return DOMPurify.sanitize(rawHtml, SANITIZE_CONFIG);
  } catch (error) {
    console.error("Markdown render failed:", error);
    return `<pre>${markdownSource.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])}</pre>`;
  }
}

function isAbsoluteUrl(value) {
  return /^(?:[a-z]+:)?\/\//i.test(value) || value.startsWith("data:") || value.startsWith("blob:");
}

function joinPath(base, rel) {
  if (rel.startsWith("/")) {
    return rel;
  }
  const baseSegments = base.split("/").filter(Boolean);
  const relSegments = rel.split("/");
  for (const seg of relSegments) {
    if (seg === "" || seg === ".") {
      continue;
    }
    if (seg === "..") {
      baseSegments.pop();
    } else {
      baseSegments.push(seg);
    }
  }
  return "/" + baseSegments.join("/");
}

function rewriteRelativeAssets(rootElement, mdFilePath) {
  if (!mdFilePath) {
    return;
  }
  const baseDir = dirname(mdFilePath);

  for (const img of rootElement.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    if (!src || isAbsoluteUrl(src)) {
      continue;
    }
    const absolute = src.startsWith("/") ? src : joinPath(baseDir, src);
    img.setAttribute("src", `/api/fs/file?path=${encodeURIComponent(absolute)}`);
    img.setAttribute("loading", "lazy");
  }

  for (const a of rootElement.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    if (!href || isAbsoluteUrl(href) || href.startsWith("#")) {
      continue;
    }
    if (/\.md$/i.test(href)) {
      continue;
    }
    const absolute = href.startsWith("/") ? href : joinPath(baseDir, href);
    a.setAttribute("href", `/api/fs/file?path=${encodeURIComponent(absolute)}`);
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener");
  }
}

function showMarkdown() {
  markdownViewButton.classList.add("active");
  pdfViewButton.classList.remove("active");
  viewerPlaceholder.classList.add("hidden");
  pdfViewer.classList.add("hidden");
  markdownViewer.classList.remove("hidden");
  markdownViewer.innerHTML = renderMarkdownToHtml(currentMarkdownContent);
  rewriteRelativeAssets(markdownViewer, currentFilePath);
}

async function selectMarkdownFile(absolutePath) {
  updateFileStatus(`Loading ${basename(absolutePath)}...`);
  try {
    const result = await loadMarkdownFromPath(absolutePath);
    currentFilePath = result.path;
    currentMarkdownContent = result.content;
    fileInput.value = result.path;

    const defaultOutput = dirname(result.path) + "/outputs";
    outputFolderInput.value = defaultOutput;
    currentOutputFolder = defaultOutput;
    pickOutputButton.disabled = false;

    await     showMarkdown();
    markdownViewer.scrollTop = 0;
    updateFileStatus(`✓ Loaded: ${basename(result.path)} | Output: ${defaultOutput}`);
    closeFolderModal();
    configPanel.classList.add("hidden");
    configToggleButton.textContent = "Setup";
  } catch (error) {
    updateFileStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

async function renderFolderModal(pathToLoad) {
  try {
    const includeFiles = modalMode === "file";
    const payload = await fetchDirectories(pathToLoad, includeFiles);
    modalCurrentPath = payload.currentPath;
    modalParentPath = payload.parentPath;
    folderModalCurrentPath.textContent = payload.currentPath;
    folderModalUpButton.disabled = !payload.parentPath;

    folderList.innerHTML = "";

    const directories = payload.directories ?? [];
    const files = payload.files ?? [];

    if (directories.length === 0 && files.length === 0) {
      const empty = document.createElement("p");
      empty.className = "subtle";
      empty.textContent = modalMode === "file"
        ? "No subfolders or .md files here."
        : "No subfolders here. Click 'Use this folder' to select.";
      folderList.appendChild(empty);
      return;
    }

    for (const directory of directories) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "folder-item";
      button.textContent = `📁 ${directory.name}`;
      button.addEventListener("click", () => renderFolderModal(directory.path));
      folderList.appendChild(button);
    }

    for (const file of files) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "folder-item file-item";
      button.textContent = `📄 ${file.name}`;
      button.addEventListener("click", () => selectMarkdownFile(file.path));
      folderList.appendChild(button);
    }
  } catch (error) {
    folderList.innerHTML = "";
    const errorEl = document.createElement("p");
    errorEl.className = "subtle";
    errorEl.textContent = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
    folderList.appendChild(errorEl);
  }
}

function openFilePickerModal() {
  modalMode = "file";
  folderModalTitle.textContent = "Select Markdown file";
  folderModalSelectButton.style.display = "none";
  folderModalNewButton.style.display = "none";
  folderModal.classList.remove("hidden");
  const startPath = currentFilePath ? dirname(currentFilePath) : "";
  renderFolderModal(startPath);
}

function openFolderPickerModal() {
  if (!currentFilePath) {
    return;
  }
  modalMode = "folder";
  folderModalTitle.textContent = "Select output folder";
  folderModalSelectButton.style.display = "";
  folderModalNewButton.style.display = "";
  folderModal.classList.remove("hidden");
  const startPath = dirname(currentFilePath);
  renderFolderModal(startPath);
}

function closeFolderModal() {
  folderModal.classList.add("hidden");
}

function applyFolderSelection() {
  if (modalMode === "folder" && modalCurrentPath) {
    outputFolderInput.value = modalCurrentPath;
    currentOutputFolder = modalCurrentPath;
    const fileName = currentFilePath ? basename(currentFilePath) : "";
    updateFileStatus(`✓ ${fileName} | Output: ${modalCurrentPath}`);
  }
  closeFolderModal();
}

async function createNewFolder() {
  if (!modalCurrentPath) {
    return;
  }

  const name = window.prompt(`Create new folder under:\n${modalCurrentPath}\n\nFolder name:`, "outputs");
  if (!name || !name.trim()) {
    return;
  }

  try {
    const response = await fetch("/api/fs/mkdir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parent: modalCurrentPath, name: name.trim() }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `Failed to create folder (${response.status})`);
    }
    const result = await response.json();
    await renderFolderModal(result.path);
  } catch (error) {
    window.alert(`Error creating folder: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

function attachDividerBehavior() {
  let isDragging = false;

  divider.addEventListener("mousedown", () => {
    isDragging = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", (event) => {
    if (!isDragging) {
      return;
    }

    const containerRect = workspace.getBoundingClientRect();
    const offsetX = event.clientX - containerRect.left;
    const percentage = (offsetX / containerRect.width) * 100;

    if (percentage >= 20 && percentage <= 80) {
      workspace.style.gridTemplateColumns = `${percentage}% 4px 1fr`;
    }
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  });
}

function attachConfigDashboardBehavior() {
  configToggleButton.addEventListener("click", () => {
    const isHidden = configPanel.classList.contains("hidden");
    if (isHidden) {
      configPanel.classList.remove("hidden");
      configToggleButton.textContent = "Close";
    } else {
      configPanel.classList.add("hidden");
      configToggleButton.textContent = "Setup";
    }
  });

  closeConfigButton.addEventListener("click", () => {
    configPanel.classList.add("hidden");
    configToggleButton.textContent = "Setup";
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!folderModal.classList.contains("hidden")) {
        closeFolderModal();
      } else if (!configPanel.classList.contains("hidden")) {
        configPanel.classList.add("hidden");
        configToggleButton.textContent = "Setup";
      }
    }
  });
}

function parseSseEvent(block) {
  const lines = block.split("\n");
  let eventType = "";
  let data = "";

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventType = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      data += line.slice("data:".length).trim();
    }
  }

  if (!eventType || !data) {
    return null;
  }

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function streamAssistantReply(userText) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: userText, history }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Streaming request failed (${response.status})`);
  }

  const assistantNode = appendMessage("assistant", "");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullReply = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const rawEvent of events) {
      const parsed = parseSseEvent(rawEvent);
      if (!parsed) {
        continue;
      }

      if (parsed.type === "chunk") {
        fullReply += parsed.delta ?? "";
        assistantNode.textContent = fullReply;
      } else if (parsed.type === "error") {
        throw new Error(parsed.message ?? "Unknown stream error");
      }
    }
  }

  history.push({ role: "assistant", content: fullReply });
}

async function initialize() {
  sessionStatus.textContent = "Creating session...";

  try {
    const response = await fetch("/api/sessions", { method: "POST" });
    if (!response.ok) {
      throw new Error(`Session creation failed (${response.status})`);
    }

    const body = await response.json();
    sessionId = body.sessionId;
    sessionStatus.textContent = `Session: ${sessionId.slice(0, 8)}`;
  } catch (error) {
    sessionStatus.textContent = `Session error: ${error instanceof Error ? error.message : "Unknown error"}`;
    sendButton.disabled = true;
    messageInput.disabled = true;
  }

  updateFileStatus("Click 'Setup' to load a book.");
}

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!sessionId) {
    return;
  }

  const userText = messageInput.value.trim();
  if (!userText) {
    return;
  }

  sendButton.disabled = true;
  messageInput.disabled = true;

  appendMessage("user", userText);
  history.push({ role: "user", content: userText });
  messageInput.value = "";

  try {
    await streamAssistantReply(userText);
  } catch (error) {
    appendMessage("system", `Stream error: ${error instanceof Error ? error.message : "Unknown error"}`);
  } finally {
    sendButton.disabled = false;
    messageInput.disabled = false;
    messageInput.focus();
  }
});

pickFileButton.addEventListener("click", openFilePickerModal);
pickOutputButton.addEventListener("click", openFolderPickerModal);
markdownViewButton.addEventListener("click", () => {
  if (currentMarkdownContent) {
    showMarkdown();
  }
});

closeFolderModalButton.addEventListener("click", closeFolderModal);
folderModalSelectButton.addEventListener("click", applyFolderSelection);
folderModalNewButton.addEventListener("click", createNewFolder);
folderModalUpButton.addEventListener("click", () => {
  if (modalParentPath) {
    renderFolderModal(modalParentPath);
  }
});
folderModal.addEventListener("click", (event) => {
  if (event.target === folderModal) {
    closeFolderModal();
  }
});

attachDividerBehavior();
attachConfigDashboardBehavior();
initialize();
