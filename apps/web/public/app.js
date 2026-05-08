import { marked } from "https://esm.sh/marked@12.0.2";
import markedKatex from "https://esm.sh/marked-katex-extension@5.1.1";
import DOMPurify from "https://esm.sh/dompurify@3.1.6?bundle";

marked.use(markedKatex({ throwOnError: false, nonStandard: true }));
marked.setOptions({ gfm: true, breaks: false });

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
const workspaceLayout = document.querySelector("#workspace");

const setupStatus = document.querySelector("#setupStatus");
const workspaceRootInput = document.querySelector("#workspaceRootInput");
const pickWorkspaceRootButton = document.querySelector("#pickWorkspaceRootButton");
const saveWorkspaceRootButton = document.querySelector("#saveWorkspaceRootButton");
const newWorkspaceNameInput = document.querySelector("#newWorkspaceNameInput");
const createWorkspaceButton = document.querySelector("#createWorkspaceButton");
const workspaceSelect = document.querySelector("#workspaceSelect");
const openWorkspaceButton = document.querySelector("#openWorkspaceButton");
const copyWorkspaceButton = document.querySelector("#copyWorkspaceButton");
const workspaceMeta = document.querySelector("#workspaceMeta");
const addDocumentButton = document.querySelector("#addDocumentButton");
const documentSelect = document.querySelector("#documentSelect");
const setCurrentDocumentButton = document.querySelector("#setCurrentDocumentButton");
const workspaceOutputInput = document.querySelector("#workspaceOutputInput");

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
let modalCurrentPath = "";
let modalParentPath = null;
let modalMode = "pick-workspace-root";
let workspaceLibraryRoot = "";
let currentWorkspace = null;
let workspaces = [];
let serverCurrentWorkspaceId = "";

function basename(filePath) {
  const idx = filePath.lastIndexOf("/");
  return idx >= 0 ? filePath.substring(idx + 1) : filePath;
}

function dirname(filePath) {
  const idx = filePath.lastIndexOf("/");
  return idx > 0 ? filePath.substring(0, idx) : filePath;
}

function updateFileStatus(text) {
  fileStatus.textContent = text;
}

function updateSetupStatus(text) {
  setupStatus.textContent = text;
}

function appendMessage(role, text) {
  const node = document.createElement("article");
  node.className = `msg ${role}`;
  node.textContent = text;
  chatPanel.appendChild(node);
  chatPanel.scrollTop = chatPanel.scrollHeight;
  return node;
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
  if (rel.startsWith("/")) return rel;
  const baseSegments = base.split("/").filter(Boolean);
  const relSegments = rel.split("/");
  for (const seg of relSegments) {
    if (!seg || seg === ".") continue;
    if (seg === "..") baseSegments.pop();
    else baseSegments.push(seg);
  }
  return `/${baseSegments.join("/")}`;
}

function rewriteRelativeAssets(rootElement, mdFilePath) {
  if (!mdFilePath) return;
  const baseDir = dirname(mdFilePath);
  for (const img of rootElement.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    if (!src || isAbsoluteUrl(src)) continue;
    const absolute = src.startsWith("/") ? src : joinPath(baseDir, src);
    img.setAttribute("src", `/api/fs/file?path=${encodeURIComponent(absolute)}`);
    img.setAttribute("loading", "lazy");
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

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error ?? `${response.status} ${response.statusText}`);
  }
  return body;
}

async function fetchDirectories(targetPath, includeFiles = false) {
  const params = new URLSearchParams();
  if (targetPath) params.set("path", targetPath);
  if (includeFiles) params.set("includeFiles", "md");
  return apiRequest(`/api/fs/list?${params.toString()}`);
}

async function renderFolderModal(pathToLoad) {
  const includeFiles = modalMode === "pick-document-file";
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
    empty.textContent = includeFiles ? "No folders or markdown files here." : "No subfolders here.";
    folderList.appendChild(empty);
    return;
  }

  for (const directory of directories) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "folder-item";
    button.textContent = `📁 ${directory.name}`;
    button.addEventListener("click", () => renderFolderModal(directory.path).catch(showSetupError));
    folderList.appendChild(button);
  }
  if (includeFiles) {
    for (const file of files) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "folder-item file-item";
      button.textContent = `📄 ${file.name}`;
      button.addEventListener("click", () => handleDocumentPicked(file.path).catch(showSetupError));
      folderList.appendChild(button);
    }
  }
}

function showSetupError(error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  updateSetupStatus(`Error: ${message}`);
}

function openModal(mode, title, startPath = "") {
  modalMode = mode;
  folderModalTitle.textContent = title;
  folderModal.classList.remove("hidden");
  folderModalSelectButton.style.display = mode === "pick-document-file" ? "none" : "";
  folderModalNewButton.style.display = mode === "pick-document-file" ? "none" : "";
  renderFolderModal(startPath).catch(showSetupError);
}

function closeFolderModal() {
  folderModal.classList.add("hidden");
}

async function createFolderFromModal() {
  if (!modalCurrentPath) return;
  const name = window.prompt(`Create new folder under:\n${modalCurrentPath}\n\nFolder name:`, "outputs");
  if (!name || !name.trim()) return;
  await apiRequest("/api/fs/mkdir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ parent: modalCurrentPath, name: name.trim() }),
  });
  await renderFolderModal(modalCurrentPath);
}

function applyModalSelection() {
  if (modalMode === "pick-workspace-root") {
    workspaceRootInput.value = modalCurrentPath;
    saveWorkspaceRoot()
      .then(() => {
        updateSetupStatus(`Workspace root selected and applied: ${modalCurrentPath}`);
      })
      .catch(showSetupError);
  } else if (modalMode === "copy-workspace-root") {
    copyCurrentWorkspace(modalCurrentPath).catch(showSetupError);
  }
  closeFolderModal();
}

async function loadWorkspaceRoot() {
  const payload = await apiRequest("/api/workspaces/root");
  workspaceLibraryRoot = payload.workspaceRoot;
  workspaceRootInput.value = workspaceLibraryRoot;
}

function renderWorkspaceOptions() {
  workspaceSelect.innerHTML = "";
  if (workspaces.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No workspaces yet";
    workspaceSelect.appendChild(option);
    copyWorkspaceButton.disabled = true;
    return;
  }
  for (const ws of workspaces) {
    const option = document.createElement("option");
    option.value = ws.id;
    option.textContent = `${ws.name} (${ws.documentCount} docs)`;
    workspaceSelect.appendChild(option);
  }
  if (currentWorkspace) {
    workspaceSelect.value = currentWorkspace.id;
  }
  copyWorkspaceButton.disabled = !currentWorkspace;
}

function renderDocumentOptions() {
  documentSelect.innerHTML = "";
  if (!currentWorkspace || currentWorkspace.documents.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No documents added";
    documentSelect.appendChild(option);
    setCurrentDocumentButton.disabled = true;
    return;
  }
  for (const doc of currentWorkspace.documents) {
    const option = document.createElement("option");
    option.value = doc.id;
    option.textContent = doc.name;
    documentSelect.appendChild(option);
  }
  if (currentWorkspace.currentDocumentId) {
    documentSelect.value = currentWorkspace.currentDocumentId;
  }
  setCurrentDocumentButton.disabled = false;
}

function renderCurrentWorkspaceMeta() {
  if (!currentWorkspace) {
    workspaceMeta.textContent = "No workspace opened.";
    workspaceOutputInput.value = "";
    addDocumentButton.disabled = true;
    copyWorkspaceButton.disabled = true;
    renderDocumentOptions();
    return;
  }
  workspaceMeta.textContent = `Path: ${currentWorkspace.path}`;
  workspaceOutputInput.value = currentWorkspace.outputRoot;
  addDocumentButton.disabled = false;
  copyWorkspaceButton.disabled = false;
  renderDocumentOptions();
}

async function refreshWorkspaceList() {
  const payload = await apiRequest("/api/workspaces");
  workspaceLibraryRoot = payload.workspaceRoot;
  workspaceRootInput.value = workspaceLibraryRoot;
  workspaces = payload.workspaces;
  serverCurrentWorkspaceId = typeof payload.currentWorkspace === "string" ? payload.currentWorkspace : "";
  if (currentWorkspace) {
    const stillExists = workspaces.find((ws) => ws.id === currentWorkspace.id);
    if (!stillExists) currentWorkspace = null;
  }
  if (!currentWorkspace && serverCurrentWorkspaceId) {
    const match = workspaces.find((ws) => ws.id === serverCurrentWorkspaceId);
    if (match) {
      currentWorkspace = match;
    }
  }
  renderWorkspaceOptions();
  renderCurrentWorkspaceMeta();
}

async function saveWorkspaceRoot() {
  const rootPath = workspaceRootInput.value.trim();
  if (!rootPath) {
    updateSetupStatus("Workspace root path is required.");
    return;
  }
  await apiRequest("/api/workspaces/root", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceRoot: rootPath }),
  });
  updateSetupStatus(`Workspace root set: ${rootPath}`);
  currentWorkspace = null;
  await refreshWorkspaceList();
}

async function ensureWorkspaceRootApplied() {
  const desiredRoot = workspaceRootInput.value.trim();
  if (!desiredRoot) {
    throw new Error("Workspace root path is required.");
  }
  if (desiredRoot !== workspaceLibraryRoot) {
    await saveWorkspaceRoot();
  }
}

async function createWorkspace() {
  await ensureWorkspaceRootApplied();
  const name = newWorkspaceNameInput.value.trim();
  if (!name) {
    updateSetupStatus("Enter a workspace name.");
    return;
  }
  const workspace = await apiRequest("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  currentWorkspace = workspace;
  newWorkspaceNameInput.value = "";
  updateSetupStatus(`Created workspace: ${workspace.name}`);
  await refreshWorkspaceList();
  renderCurrentWorkspaceMeta();
  await refreshChatSession();
}

async function openSelectedWorkspace() {
  await ensureWorkspaceRootApplied();
  const workspaceId = workspaceSelect.value;
  if (!workspaceId) {
    updateSetupStatus("Select a workspace first.");
    return;
  }
  currentWorkspace = await apiRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}/select`, {
    method: "POST",
  });
  renderCurrentWorkspaceMeta();
  updateSetupStatus(`Opened workspace: ${currentWorkspace.name}`);
  await refreshChatSession();
  if (currentWorkspace.currentDocumentId) {
    await renderCurrentDocument();
  }
}

async function handleDocumentPicked(absolutePath) {
  if (!currentWorkspace) {
    updateSetupStatus("Open a workspace first.");
    return;
  }
  const updated = await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourcePath: absolutePath, mode: "copy" }),
  });
  currentWorkspace = updated;
  closeFolderModal();
  renderCurrentWorkspaceMeta();
  updateSetupStatus(`Added document: ${basename(absolutePath)}`);
  await renderCurrentDocument();
}

async function setCurrentDocument() {
  if (!currentWorkspace) return;
  const documentId = documentSelect.value;
  if (!documentId) {
    updateSetupStatus("Select a document first.");
    return;
  }
  currentWorkspace = await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/current-document`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId }),
  });
  renderCurrentWorkspaceMeta();
  await refreshChatSession();
  await renderCurrentDocument();
}

async function renderCurrentDocument() {
  if (!currentWorkspace) {
    return;
  }
  const payload = await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/current-document/content`);
  currentFilePath = payload.document.mdPath ?? payload.document.sourcePath;
  currentMarkdownContent = payload.content;
  showMarkdown();
  markdownViewer.scrollTop = 0;
  updateFileStatus(`Viewing ${payload.document.name} | Workspace ${currentWorkspace.name}`);
}

async function copyCurrentWorkspace(targetRoot) {
  if (!currentWorkspace) {
    updateSetupStatus("Open a workspace first.");
    return;
  }
  const copied = await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/copy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetRoot }),
  });
  updateSetupStatus(`Copied workspace to ${copied.path}`);
  await refreshWorkspaceList();
}

function attachDividerBehavior() {
  let isDragging = false;
  divider.addEventListener("mousedown", () => {
    isDragging = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });
  document.addEventListener("mousemove", (event) => {
    if (!isDragging) return;
    const rect = workspaceLayout.getBoundingClientRect();
    const percentage = ((event.clientX - rect.left) / rect.width) * 100;
    if (percentage >= 20 && percentage <= 80) {
      workspaceLayout.style.gridTemplateColumns = `${percentage}% 10px 1fr`;
    }
  });
  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  });
}

function attachConfigDashboardBehavior() {
  configToggleButton.addEventListener("click", () => {
    const hidden = configPanel.classList.contains("hidden");
    configPanel.classList.toggle("hidden", !hidden);
    configToggleButton.textContent = hidden ? "Close" : "Setup";
  });
  closeConfigButton.addEventListener("click", () => {
    configPanel.classList.add("hidden");
    configToggleButton.textContent = "Setup";
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!folderModal.classList.contains("hidden")) {
      closeFolderModal();
    } else if (!configPanel.classList.contains("hidden")) {
      configPanel.classList.add("hidden");
      configToggleButton.textContent = "Setup";
    }
  });
}

function parseSseEvent(block) {
  const lines = block.split("\n");
  let eventType = "";
  let data = "";
  for (const line of lines) {
    if (line.startsWith("event:")) eventType = line.slice("event:".length).trim();
    if (line.startsWith("data:")) data += line.slice("data:".length).trim();
  }
  if (!eventType || !data) return null;
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
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const rawEvent of events) {
      const parsed = parseSseEvent(rawEvent);
      if (!parsed) continue;
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

async function initializeChat() {
  sessionStatus.textContent = "Create/open a workspace to start chat session...";
  sendButton.disabled = true;
  messageInput.disabled = true;
}

async function refreshChatSession() {
  if (!currentWorkspace) {
    return;
  }
  sessionStatus.textContent = "Creating workspace chat session...";
  try {
    const result = await apiRequest("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cwd: currentWorkspace.path,
        bookAgentConfigPath: `${workspaceRootInput.value.trim()}/.book_agent.json`,
      }),
    });
    sessionId = result.sessionId;
    history.length = 0;
    chatPanel.innerHTML = "";
    sessionStatus.textContent = `Session: ${sessionId.slice(0, 8)} | ${currentWorkspace.id}`;
    sendButton.disabled = false;
    messageInput.disabled = false;
  } catch (error) {
    sessionStatus.textContent = `Session error: ${error instanceof Error ? error.message : "Unknown error"}`;
    sendButton.disabled = true;
    messageInput.disabled = true;
  }
}

async function initializeWorkspaceUI() {
  await loadWorkspaceRoot();
  await refreshWorkspaceList();
  updateSetupStatus("Set workspace root, create/open workspace, then add documents.");
  if (currentWorkspace?.id) {
    await openSelectedWorkspace();
  }
}

composer.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!sessionId) return;
  const userText = messageInput.value.trim();
  if (!userText) return;
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

pickWorkspaceRootButton.addEventListener("click", () => openModal("pick-workspace-root", "Select workspace root", workspaceRootInput.value));
saveWorkspaceRootButton.addEventListener("click", () => saveWorkspaceRoot().catch(showSetupError));
createWorkspaceButton.addEventListener("click", () => createWorkspace().catch(showSetupError));
openWorkspaceButton.addEventListener("click", () => openSelectedWorkspace().catch(showSetupError));
addDocumentButton.addEventListener("click", () => {
  ensureWorkspaceRootApplied()
    .then(() => openModal("pick-document-file", "Add markdown document", currentWorkspace ? currentWorkspace.path : workspaceRootInput.value))
    .catch(showSetupError);
});
setCurrentDocumentButton.addEventListener("click", () => setCurrentDocument().catch(showSetupError));
copyWorkspaceButton.addEventListener("click", () => {
  ensureWorkspaceRootApplied()
    .then(() => openModal("copy-workspace-root", "Copy workspace to root folder", workspaceRootInput.value))
    .catch(showSetupError);
});
markdownViewButton.addEventListener("click", () => {
  if (currentMarkdownContent) showMarkdown();
});

folderModalUpButton.addEventListener("click", () => {
  if (modalParentPath) {
    renderFolderModal(modalParentPath).catch(showSetupError);
  }
});
folderModalSelectButton.addEventListener("click", () => applyModalSelection());
folderModalNewButton.addEventListener("click", () => createFolderFromModal().catch(showSetupError));
closeFolderModalButton.addEventListener("click", closeFolderModal);
folderModal.addEventListener("click", (event) => {
  if (event.target === folderModal) closeFolderModal();
});

attachDividerBehavior();
attachConfigDashboardBehavior();
initializeChat();
initializeWorkspaceUI().catch(showSetupError);
