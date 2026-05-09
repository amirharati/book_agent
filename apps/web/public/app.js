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

// DOM References - Sidebar
const workspaceRootInput = document.querySelector("#workspaceRootInput");
const pickWorkspaceRootButton = document.querySelector("#pickWorkspaceRootButton");
const workspaceSelect = document.querySelector("#workspaceSelect");
const createWorkspaceButton = document.querySelector("#createWorkspaceButton");
const openWorkspaceButton = document.querySelector("#openWorkspaceButton");
const addDocumentButton = document.querySelector("#addDocumentButton");
const documentList = document.querySelector("#documentList");
const setupStatus = document.querySelector("#setupStatus");
const workspaceChip = document.querySelector("#workspaceChip");
const documentChip = document.querySelector("#documentChip");

// DOM References - Reader
const tabBar = document.querySelector("#tabBar");
const tabs = document.querySelector("#tabs");
const markdownViewButton = document.querySelector("#markdownViewButton");
const pdfViewButton = document.querySelector("#pdfViewButton");
const viewerPlaceholder = document.querySelector("#viewerPlaceholder");
const markdownViewer = document.querySelector("#markdownViewer");
const pdfViewer = document.querySelector("#pdfViewer");
const readerContent = document.querySelector("#readerContent");

// DOM References - Chat
const chatMessages = document.querySelector("#chatMessages");
const composer = document.querySelector("#composer");
const messageInput = document.querySelector("#messageInput");
const sendButton = document.querySelector("#sendButton");
const sessionStatus = document.querySelector("#sessionStatus");
const modelSelect = document.querySelector("#modelSelect");
const newSessionButton = document.querySelector("#newSessionButton");
const chatListModal = document.querySelector("#chatListModal");
const closeChatListModalButton = document.querySelector("#closeChatListModalButton");
const cancelChatListButton = document.querySelector("#cancelChatListButton");
const newChatFromListButton = document.querySelector("#newChatFromListButton");
const chatListContainer = document.querySelector("#chatListContainer");

// DOM References - Layout
const mainContent = document.querySelector(".main-content");
const resizeHandle = document.querySelector("#resizeHandle");

// DOM References - Create Workspace Modal
const createWorkspaceModal = document.querySelector("#createWorkspaceModal");
const newWorkspaceNameInput = document.querySelector("#newWorkspaceNameInput");
const closeCreateWorkspaceModal = document.querySelector("#closeCreateWorkspaceModal");
const cancelCreateWorkspace = document.querySelector("#cancelCreateWorkspace");
const confirmCreateWorkspace = document.querySelector("#confirmCreateWorkspace");

// DOM References - Folder Modal
const folderModal = document.querySelector("#folderModal");
const folderModalTitle = document.querySelector("#folderModalTitle");
const folderModalCurrentPath = document.querySelector("#folderModalCurrentPath");
const folderModalUpButton = document.querySelector("#folderModalUpButton");
const folderModalSelectButton = document.querySelector("#folderModalSelectButton");
const folderModalNewButton = document.querySelector("#folderModalNewButton");
const closeFolderModalButton = document.querySelector("#closeFolderModalButton");
const folderModalCancelButton = document.querySelector("#folderModalCancelButton");
const folderList = document.querySelector("#folderList");

// DOM References - File Tree
const fileTree = document.querySelector("#fileTree");
const toggleFiltersButton = document.querySelector("#toggleFiltersButton");
const refreshFilesButton = document.querySelector("#refreshFilesButton");
const filterControls = document.querySelector("#filterControls");
const hideImagesCheckbox = document.querySelector("#hideImagesCheckbox");
const hideHiddenCheckbox = document.querySelector("#hideHiddenCheckbox");

// State
let sessionId = null;
const history = [];
let workspaceLibraryRoot = "";
let currentWorkspace = null;
let workspaces = [];
let serverCurrentWorkspaceId = "";
let modalCurrentPath = "";
let modalParentPath = null;
let modalMode = "pick-workspace-root";
let selectedModelId = "default";
let currentSessionContext = null;
let activeConversationId = null;
let bootstrapPayload = null;
let isHydrating = false;
let conversationSummaries = [];

// Tab state
let openTabs = [];
let activeTabId = null;

// File tree state
let workspaceFileTree = [];
const expandedDirs = new Set();
const saveSessionStateDebounced = debounce(() => {
  persistWorkspaceSessionState().catch((error) => {
    console.warn("Failed to persist workspace session:", error);
  });
}, 350);
const saveGlobalStateDebounced = debounce(() => {
  persistGlobalState().catch((error) => {
    console.warn("Failed to persist global state:", error);
  });
}, 350);

// Utilities
function basename(filePath) {
  const idx = filePath.lastIndexOf("/");
  return idx >= 0 ? filePath.substring(idx + 1) : filePath;
}

function dirname(filePath) {
  const idx = filePath.lastIndexOf("/");
  return idx > 0 ? filePath.substring(0, idx) : filePath;
}

function updateStatus(text, type = "info") {
  setupStatus.textContent = text;
  setupStatus.style.color = type === "error" ? "var(--color-error)" : "var(--color-text-muted)";
}

function debounce(callback, delayMs) {
  let timeoutId = null;
  return (...args) => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => {
      timeoutId = null;
      callback(...args);
    }, delayMs);
  };
}

function updateContextChips() {
  if (currentWorkspace) {
    workspaceChip.textContent = currentWorkspace.name;
    workspaceChip.title = currentWorkspace.path;
    workspaceChip.classList.add("active");
  } else {
    workspaceChip.textContent = "No workspace";
    workspaceChip.title = "No workspace selected";
    workspaceChip.classList.remove("active");
  }

  const activeTab = openTabs.find(t => t.id === activeTabId);
  if (activeTab) {
    documentChip.textContent = activeTab.name;
    documentChip.title = activeTab.path;
    documentChip.classList.add("active");
  } else {
    documentChip.textContent = "No document";
    documentChip.title = "No document open";
    documentChip.classList.remove("active");
  }
}

function clearChatSessionState(statusText = "Open a workspace to start") {
  sessionId = null;
  currentSessionContext = null;
  activeConversationId = null;
  conversationSummaries = [];
  history.length = 0;
  chatMessages.innerHTML = "";
  sessionStatus.textContent = statusText;
  sessionStatus.title = "";
  sendButton.disabled = true;
  messageInput.disabled = true;
  newSessionButton.disabled = !currentWorkspace;
}

function formatChatTimestamp(timestamp) {
  if (!timestamp) return "No messages yet";
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "No messages yet";
  return parsed.toLocaleString();
}

function buildAutoConversationTitle(userText) {
  const normalized = (userText || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "New chat";
  }
  const trimmed = normalized.length > 56 ? `${normalized.slice(0, 55)}…` : normalized;
  return trimmed;
}

function shouldAutoRenameConversation(title) {
  const normalized = (title || "").trim().toLowerCase();
  return normalized === "" || normalized === "new chat" || normalized === "untitled chat";
}

function renderSessionStatus(modelId, runtimeContext) {
  const modelLabel = formatModelName(modelId || selectedModelId);
  const shortSessionId = runtimeContext?.sessionShortId || (sessionId ? String(sessionId).slice(0, 8) : "n/a");
  sessionStatus.textContent = `${modelLabel} · ${shortSessionId}`;
  sessionStatus.title = [
    `session: ${runtimeContext?.sessionId || sessionId || "(none)"}`,
    `workspace: ${runtimeContext?.currentWorkspaceId || currentWorkspace?.id || "(none)"}`,
    `document: ${runtimeContext?.currentDocumentId || "(none)"}${runtimeContext?.currentDocumentName ? ` (${runtimeContext.currentDocumentName})` : ""}`,
    `cwd: ${runtimeContext?.cwd || "(none)"}`,
    `book_agent_config: ${runtimeContext?.bookAgentConfigPath || "(none)"}`,
    `resolved_output_dir: ${runtimeContext?.resolvedOutputDir || "(none)"}`,
  ].join("\n");
}

function loadSelectedModel() {
  const persistedDefault = bootstrapPayload?.global?.chat?.defaultModel;
  if (typeof persistedDefault === "string" && persistedDefault.trim()) {
    selectedModelId = persistedDefault;
  } else {
    const stored = window.localStorage.getItem("chat:modelId");
    if (stored) {
      selectedModelId = stored;
    }
  }
  const hasOption = Array.from(modelSelect.options).some((option) => option.value === selectedModelId);
  modelSelect.value = hasOption ? selectedModelId : "default";
  selectedModelId = modelSelect.value;
}

function setSelectedModel(modelId) {
  selectedModelId = modelId || "default";
  window.localStorage.setItem("chat:modelId", selectedModelId);
  saveGlobalStateDebounced();
}

function formatModelName(modelId) {
  if (modelId === "default") return "Default";
  
  const parts = modelId.split("-");
  const formatted = [];
  let i = 0;
  
  while (i < parts.length) {
    const part = parts[i];
    
    if (/^\d+(\.\d+)?$/.test(part)) {
      formatted.push(part);
    } else if (part.toLowerCase() === "gpt" || part.toLowerCase() === "grok") {
      formatted.push(part.toUpperCase());
    } else if (part.toLowerCase() === "claude" || part.toLowerCase() === "gemini") {
      formatted.push(part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
    } else if (part.toLowerCase() === "opus" || part.toLowerCase() === "sonnet" || 
               part.toLowerCase() === "haiku" || part.toLowerCase() === "flash" || 
               part.toLowerCase() === "pro" || part.toLowerCase() === "mini" ||
               part.toLowerCase() === "nano" || part.toLowerCase() === "spark" ||
               part.toLowerCase() === "codex" || part.toLowerCase() === "max" ||
               part.toLowerCase() === "composer" || part.toLowerCase() === "fast") {
      formatted.push(part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
    } else {
      formatted.push(part);
    }
    i++;
  }
  
  return formatted.join(" ").replace(/\s+(\d)/g, " $1");
}

function setModelOptions(models) {
  const unique = Array.from(new Set(models.filter(Boolean)));
  if (!unique.includes("default")) {
    unique.unshift("default");
  }
  modelSelect.innerHTML = "";
  for (const modelId of unique) {
    const option = document.createElement("option");
    option.value = modelId;
    option.textContent = formatModelName(modelId);
    modelSelect.appendChild(option);
  }
}

async function loadModelOptions() {
  try {
    const payload = await apiRequest("/api/models");
    const models = Array.isArray(payload.models) ? payload.models : ["default"];
    setModelOptions(models);
  } catch (error) {
    // Keep default option when model list cannot be fetched.
    setModelOptions(["default"]);
    console.warn("Could not load models from SDK:", error);
  }
  loadSelectedModel();
}

// API Helpers
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

async function loadBootstrapState() {
  bootstrapPayload = await apiRequest("/api/state/bootstrap");
  return bootstrapPayload;
}

async function persistGlobalState() {
  const lastRoot = workspaceRootInput.value.trim() || null;
  const recentRoots = [lastRoot, ...(bootstrapPayload?.global?.recentRoots ?? []).filter((root) => root && root !== lastRoot)].filter(Boolean).slice(0, 12);
  bootstrapPayload = bootstrapPayload ?? {};
  bootstrapPayload.global = await apiRequest("/api/state/global", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat: { defaultModel: selectedModelId || "default" },
      lastRoot,
      recentRoots,
    }),
  });
}

function getCurrentChatPanelWidth() {
  const columns = mainContent.style.gridTemplateColumns;
  const match = columns.match(/(\d+)px$/);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 10);
}

async function persistWorkspaceSessionState() {
  if (!currentWorkspace || isHydrating) {
    return;
  }
  const payload = {
    activeDocumentId: currentWorkspace.currentDocumentId ?? null,
    openTabs: openTabs.map((tab) => ({
      id: tab.id,
      docId: tab.docId ?? null,
      name: tab.name,
      path: tab.path,
      isExternal: Boolean(tab.isExternal),
    })),
    activeTabId,
    layout: {
      chatPanelWidth: getCurrentChatPanelWidth(),
      expandedDirs: Array.from(expandedDirs),
      hideImages: hideImagesCheckbox?.checked ?? true,
      hideHidden: hideHiddenCheckbox?.checked ?? true,
    },
    reader: {
      viewMode: markdownViewButton.classList.contains("active") ? "markdown" : "pdf",
    },
    chat: {
      context: {
        workspaceId: currentWorkspace.id,
        documentId: currentWorkspace.currentDocumentId ?? null,
        modelId: selectedModelId || null,
        sessionShortId: currentSessionContext?.sessionShortId ?? null,
      },
    },
  };
  await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/session-state`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function renderConversationMessages(messages) {
  chatMessages.innerHTML = "";
  history.length = 0;
  for (const message of messages) {
    appendMessage(message.role, message.content);
    history.push({ role: message.role, content: message.content });
  }
}

async function createConversationAndActivate(title = "New chat") {
  if (!currentWorkspace) return null;
  const normalizedTitle = typeof title === "string" && title.trim() ? title.trim() : "New chat";
  const payload = await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: normalizedTitle, setActive: true }),
  });
  activeConversationId = payload.activeConversationId ?? payload.conversation?.id ?? null;
  history.length = 0;
  chatMessages.innerHTML = "";
  await loadConversationSummaries();
  return payload.conversation ?? null;
}

async function appendConversationMessages(messages) {
  if (!currentWorkspace || !activeConversationId || !Array.isArray(messages) || messages.length === 0) {
    return;
  }
  await apiRequest(
    `/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/conversations/${encodeURIComponent(activeConversationId)}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        context: {
          workspaceId: currentWorkspace.id,
          documentId: currentWorkspace.currentDocumentId ?? null,
          modelId: selectedModelId || null,
          sessionShortId: currentSessionContext?.sessionShortId ?? null,
        },
      }),
    },
  );
}

async function loadConversationSummaries() {
  if (!currentWorkspace) {
    conversationSummaries = [];
    return [];
  }
  const payload = await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/conversations`);
  conversationSummaries = Array.isArray(payload.conversations) ? payload.conversations : [];
  if (typeof payload.activeConversationId === "string" && payload.activeConversationId) {
    activeConversationId = payload.activeConversationId;
  }
  return conversationSummaries;
}

function renderConversationList() {
  if (!chatListContainer) return;
  chatListContainer.innerHTML = "";
  if (!Array.isArray(conversationSummaries) || conversationSummaries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "No chats yet. Create one to get started.";
    chatListContainer.appendChild(empty);
    return;
  }
  for (const summary of conversationSummaries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chat-list-item";
    if (summary.id === activeConversationId) {
      button.classList.add("active");
    }
    const preview = summary.lastMessagePreview || "No messages yet";
    const when = formatChatTimestamp(summary.lastMessageAt || summary.updatedAt);
    const titleEl = document.createElement("div");
    titleEl.className = "chat-list-title";
    titleEl.textContent = summary.title || "Untitled chat";
    const metaEl = document.createElement("div");
    metaEl.className = "chat-list-meta";
    metaEl.textContent = `${summary.messageCount ?? 0} messages · ${when}`;
    const previewEl = document.createElement("div");
    previewEl.className = "chat-list-meta";
    previewEl.textContent = preview;
    button.appendChild(titleEl);
    button.appendChild(metaEl);
    button.appendChild(previewEl);
    button.addEventListener("click", () => {
      setActiveConversation(summary.id).catch(handleError);
    });
    chatListContainer.appendChild(button);
  }
}

function openChatListModal() {
  if (!currentWorkspace) {
    updateStatus("Open a workspace first.", "error");
    return;
  }
  loadConversationSummaries()
    .then(() => renderConversationList())
    .then(() => {
      chatListModal.classList.remove("hidden");
    })
    .catch(handleError);
}

function closeChatListModal() {
  chatListModal.classList.add("hidden");
}

async function setActiveConversation(conversationId) {
  if (!currentWorkspace || !conversationId) return;
  await apiRequest(
    `/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setActive: true }),
    },
  );
  activeConversationId = conversationId;
  await loadConversationById(conversationId);
  await refreshChatSession();
  saveSessionStateDebounced();
  closeChatListModal();
}

async function maybeAutoRenameActiveConversation(userText, assistantText = "") {
  if (!currentWorkspace || !activeConversationId) {
    return;
  }
  const summary = conversationSummaries.find((entry) => entry.id === activeConversationId) ?? null;
  if (!summary || !shouldAutoRenameConversation(summary.title)) {
    return;
  }
  let nextTitle = "";
  if (sessionId) {
    try {
      const titlePayload = await apiRequest(`/api/sessions/${encodeURIComponent(sessionId)}/title-suggestion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "user", content: userText },
            { role: "assistant", content: assistantText },
          ],
        }),
      });
      if (typeof titlePayload.title === "string" && titlePayload.title.trim()) {
        nextTitle = titlePayload.title.trim();
      }
    } catch (error) {
      console.warn("AI title suggestion failed, falling back to local title:", error);
    }
  }
  if (!nextTitle) {
    nextTitle = buildAutoConversationTitle(userText);
  }
  if (!nextTitle || !shouldAutoRenameConversation(summary.title) && nextTitle === summary.title) {
    return;
  }
  await apiRequest(
    `/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/conversations/${encodeURIComponent(activeConversationId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle }),
    },
  );
  await loadConversationSummaries();
}

async function loadConversationById(conversationId) {
  if (!currentWorkspace || !conversationId) {
    return null;
  }
  try {
    const payload = await apiRequest(
      `/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/conversations/${encodeURIComponent(conversationId)}`,
    );
    activeConversationId = payload.activeConversationId ?? payload.conversation?.id ?? conversationId;
    renderConversationMessages(payload.messages ?? []);
    return payload;
  } catch (error) {
    console.warn("Failed to load conversation payload:", error);
    return null;
  }
}

function hydrateWorkspaceSessionState(sessionState, activeConversationPayload = null) {
  if (!sessionState || !currentWorkspace) {
    return;
  }
  isHydrating = true;
  try {
    openTabs = Array.isArray(sessionState.openTabs)
      ? sessionState.openTabs.map((tab) => ({
          id: tab.id,
          docId: tab.docId ?? null,
          name: tab.name,
          path: tab.path,
          content: null,
          isExternal: Boolean(tab.isExternal),
        }))
      : [];
    activeTabId = sessionState.activeTabId ?? null;

    expandedDirs.clear();
    for (const dirPath of sessionState.layout?.expandedDirs ?? []) {
      expandedDirs.add(dirPath);
    }
    if (hideImagesCheckbox) hideImagesCheckbox.checked = sessionState.layout?.hideImages ?? true;
    if (hideHiddenCheckbox) hideHiddenCheckbox.checked = sessionState.layout?.hideHidden ?? true;
    if (typeof sessionState.layout?.chatPanelWidth === "number" && sessionState.layout.chatPanelWidth > 240) {
      mainContent.style.gridTemplateColumns = `1fr auto ${sessionState.layout.chatPanelWidth}px`;
    }

    const activeConversation = activeConversationPayload?.conversation ?? null;
    activeConversationId = activeConversation?.id ?? sessionState.chat?.activeConversationId ?? null;
    if (Array.isArray(activeConversationPayload?.messages)) {
      renderConversationMessages(activeConversationPayload.messages);
    } else {
      history.length = 0;
      chatMessages.innerHTML = "";
    }

    renderTabs();
    updateContextChips();
    if (activeTabId) {
      const activeTab = openTabs.find((tab) => tab.id === activeTabId);
      if (activeTab) {
        loadTabContent(activeTab);
      }
    }
  } finally {
    isHydrating = false;
  }
}

// Markdown Rendering
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

// Tab Management
function generateTabId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createTab(doc) {
  const tabId = generateTabId();
  const tab = {
    id: tabId,
    docId: doc.id,
    name: doc.name,
    path: doc.mdPath ?? doc.sourcePath,
    content: null,
    isExternal: false,
  };
  openTabs.push(tab);
  renderTabs();
  saveSessionStateDebounced();
  return tabId;
}

function renderTabs() {
  tabs.innerHTML = "";
  for (const tab of openTabs) {
    const tabEl = document.createElement("button");
    tabEl.type = "button";
    tabEl.className = `tab${tab.id === activeTabId ? " active" : ""}${tab.isExternal ? " external" : ""}`;
    tabEl.dataset.tabId = tab.id;
    
    const nameSpan = document.createElement("span");
    nameSpan.textContent = tab.name;
    tabEl.appendChild(nameSpan);

    if (tab.isExternal && tab.id === activeTabId) {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "tab-add";
      addBtn.title = "Add to Workspace";
      addBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2v8M2 6h8"/></svg>`;
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        addExternalFileToWorkspace(tab).catch(handleError);
      });
      tabEl.appendChild(addBtn);
    }

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "tab-close";
    closeBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 3l6 6M9 3l-6 6"/></svg>`;
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });
    tabEl.appendChild(closeBtn);

    tabEl.addEventListener("click", () => activateTab(tab.id));
    tabs.appendChild(tabEl);
  }
}

function activateTab(tabId) {
  const tab = openTabs.find(t => t.id === tabId);
  if (!tab) return;
  
  activeTabId = tabId;
  renderTabs();
  updateContextChips();
  saveSessionStateDebounced();

  if (tab.content !== null) {
    showMarkdownContent(tab.content, tab.path);
  } else {
    loadTabContent(tab);
  }
}

function closeTab(tabId) {
  const idx = openTabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;
  
  openTabs.splice(idx, 1);
  
  if (activeTabId === tabId) {
    if (openTabs.length > 0) {
      const newActiveIdx = Math.min(idx, openTabs.length - 1);
      activateTab(openTabs[newActiveIdx].id);
    } else {
      activeTabId = null;
      showPlaceholder();
    }
  }
  
  renderTabs();
  updateContextChips();
  saveSessionStateDebounced();
}

async function loadTabContent(tab) {
  if (!currentWorkspace) return;
  
  try {
    if (tab.isExternal || !tab.docId) {
      const payload = await apiRequest(`/api/fs/read?path=${encodeURIComponent(tab.path)}`);
      tab.content = payload.content;
      tab.path = payload.path;
    } else {
      const payload = await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/documents/${encodeURIComponent(tab.docId)}/content`);
      tab.content = payload.content;
      tab.path = payload.document.mdPath ?? payload.document.sourcePath;
    }
    
    if (activeTabId === tab.id) {
      showMarkdownContent(tab.content, tab.path);
    }
  } catch (error) {
    updateStatus(`Error loading file: ${error.message}`, "error");
  }
}

function showPlaceholder() {
  viewerPlaceholder.classList.remove("hidden");
  markdownViewer.classList.add("hidden");
  pdfViewer.classList.add("hidden");
  updateContextChips();
}

function showMarkdownContent(content, filePath) {
  viewerPlaceholder.classList.add("hidden");
  pdfViewer.classList.add("hidden");
  markdownViewer.classList.remove("hidden");
  markdownViewer.innerHTML = renderMarkdownToHtml(content);
  rewriteRelativeAssets(markdownViewer, filePath);
  
  markdownViewButton.classList.add("active");
  pdfViewButton.classList.remove("active");
  saveSessionStateDebounced();
}

// Open document (creates tab if needed)
function openDocument(doc) {
  const existingTab = openTabs.find(t => t.docId === doc.id);
  if (existingTab) {
    activateTab(existingTab.id);
  } else {
    const tabId = createTab(doc);
    activateTab(tabId);
  }
}

// Folder Modal
function openModal(mode, title, startPath = "") {
  modalMode = mode;
  folderModalTitle.textContent = title;
  folderModal.classList.remove("hidden");
  
  const isFilePicker = mode === "pick-document-file";
  folderModalSelectButton.style.display = isFilePicker ? "none" : "";
  folderModalNewButton.style.display = isFilePicker ? "none" : "";
  
  renderFolderModal(startPath).catch(handleError);
}

function closeFolderModal() {
  folderModal.classList.add("hidden");
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
    empty.className = "empty-hint";
    empty.style.padding = "var(--space-4)";
    empty.textContent = includeFiles ? "No folders or markdown files here." : "No subfolders here.";
    folderList.appendChild(empty);
    return;
  }

  for (const directory of directories) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "folder-item";
    button.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4h4l1.5 2H14v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/></svg> ${directory.name}`;
    button.addEventListener("click", () => renderFolderModal(directory.path).catch(handleError));
    folderList.appendChild(button);
  }
  
  if (includeFiles) {
    for (const file of files) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "folder-item file-item";
      button.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 2h6l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M10 2v4h4"/></svg> ${file.name}`;
      button.addEventListener("click", () => handleDocumentPicked(file.path).catch(handleError));
      folderList.appendChild(button);
    }
  }
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
      .then(() => updateStatus(`Workspace root set: ${modalCurrentPath}`))
      .catch(handleError);
  }
  closeFolderModal();
}

// Workspace Management
async function loadWorkspaceRoot() {
  const payload = await apiRequest("/api/workspaces/root");
  workspaceLibraryRoot = payload.workspaceRoot;
  workspaceRootInput.value = workspaceLibraryRoot;
}

async function saveWorkspaceRoot() {
  const rootPath = workspaceRootInput.value.trim();
  if (!rootPath) {
    updateStatus("Workspace root path is required.", "error");
    return;
  }
  await apiRequest("/api/workspaces/root", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceRoot: rootPath }),
  });
  updateStatus(`Workspace root set: ${rootPath}`);
  await loadBootstrapState();
  
  // Clear UI when workspace root changes
  currentWorkspace = null;
  openTabs = [];
  activeTabId = null;
  workspaceFileTree = [];
  clearChatSessionState("Open a workspace to start");
  renderTabs();
  showPlaceholder();
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

function renderWorkspaceOptions() {
  workspaceSelect.innerHTML = "";
  if (workspaces.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No workspaces yet";
    workspaceSelect.appendChild(option);
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
}

function renderDocumentList() {
  documentList.innerHTML = "";
  
  const documents = currentWorkspace?.documents ?? [];
  
  if (!currentWorkspace || documents.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = currentWorkspace ? "No documents added yet" : "Open a workspace to see documents";
    documentList.appendChild(empty);
    addDocumentButton.disabled = !currentWorkspace;
    return;
  }
  
  addDocumentButton.disabled = false;
  
  for (const doc of documents) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "document-item";
    if (currentWorkspace.currentDocumentId === doc.id) {
      item.classList.add("active");
    }
    
    item.innerHTML = `
      <svg class="document-item-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M4 2h6l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/>
        <path d="M10 2v4h4"/>
      </svg>
      <span class="document-item-name">${doc.name}</span>
    `;
    
    item.addEventListener("click", () => {
      setCurrentAndOpenDocument(doc).catch(handleError);
    });
    
    documentList.appendChild(item);
  }
}

async function setCurrentAndOpenDocument(doc) {
  if (!currentWorkspace) return;
  
  currentWorkspace = await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/current-document`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId: doc.id }),
  });
  
  renderDocumentList();
  openDocument(doc);
  await refreshChatSession();
  saveSessionStateDebounced();
}

// File Tree Functions
async function loadWorkspaceFiles() {
  if (!currentWorkspace) {
    workspaceFileTree = [];
    renderFileTree();
    return;
  }

  try {
    const hideImages = hideImagesCheckbox?.checked ?? true;
    const hideHidden = hideHiddenCheckbox?.checked ?? true;
    const params = new URLSearchParams();
    params.set("hideImages", hideImages.toString());
    params.set("hideHidden", hideHidden.toString());

    const payload = await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/files?${params.toString()}`);
    workspaceFileTree = payload.tree ?? [];
    renderFileTree();
  } catch (error) {
    console.warn("Failed to load workspace files:", error);
    workspaceFileTree = [];
    renderFileTree();
  }
}

function renderFileTree() {
  fileTree.innerHTML = "";

  if (!currentWorkspace) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "Open a workspace to see files";
    fileTree.appendChild(empty);
    return;
  }

  if (workspaceFileTree.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = "No files in workspace";
    fileTree.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const node of workspaceFileTree) {
    fragment.appendChild(renderTreeNode(node, 0));
  }
  fileTree.appendChild(fragment);
}

function renderTreeNode(node, depth) {
  const container = document.createElement("div");
  container.className = "tree-node";
  container.style.paddingLeft = `${depth * 12}px`;

  const item = document.createElement("button");
  item.type = "button";
  item.className = `tree-item ${node.type}`;
  
  if (node.type === "file" && node.extension === ".md") {
    item.classList.add("md");
  }

  const isExpanded = expandedDirs.has(node.path);
  if (node.type === "directory" && isExpanded) {
    item.classList.add("expanded");
  }

  let iconSvg;
  if (node.type === "directory") {
    iconSvg = `<svg class="tree-item-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M2 4h4l1.5 2H14v7a1 1 0 01-1 1H3a1 1 0 01-1-1V4z"/>
    </svg>`;
  } else if (node.extension === ".md") {
    iconSvg = `<svg class="tree-item-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M4 2h6l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/>
      <path d="M10 2v4h4"/>
    </svg>`;
  } else {
    iconSvg = `<svg class="tree-item-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M4 2h8a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/>
    </svg>`;
  }

  const chevronSvg = node.type === "directory" 
    ? `<svg class="tree-item-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M4 2l4 4-4 4"/>
      </svg>`
    : "";

  item.innerHTML = `${chevronSvg}${iconSvg}<span class="tree-item-name">${node.name}</span>`;

  if (node.type === "directory") {
    item.addEventListener("click", () => toggleDirectory(node.path));
  } else if (node.type === "file") {
    item.addEventListener("click", () => openFileFromTree(node));
  }

  container.appendChild(item);

  if (node.type === "directory" && node.children && node.children.length > 0) {
    const childrenContainer = document.createElement("div");
    childrenContainer.className = `tree-children${isExpanded ? "" : " collapsed"}`;
    for (const child of node.children) {
      childrenContainer.appendChild(renderTreeNode(child, depth + 1));
    }
    container.appendChild(childrenContainer);
  }

  return container;
}

function toggleDirectory(dirPath) {
  if (expandedDirs.has(dirPath)) {
    expandedDirs.delete(dirPath);
  } else {
    expandedDirs.add(dirPath);
  }
  renderFileTree();
  saveSessionStateDebounced();
}

async function openFileFromTree(node) {
  if (!currentWorkspace || node.type !== "file") return;
  
  const existingTab = openTabs.find(t => t.path?.endsWith(node.path) || t.name === node.name);
  if (existingTab) {
    activateTab(existingTab.id);
    return;
  }

  const tabId = generateTabId();
  const tab = {
    id: tabId,
    docId: null,
    name: node.name,
    path: `${currentWorkspace.path}/${node.path}`,
    content: null,
    isExternal: true,
  };
  openTabs.push(tab);
  renderTabs();
  activateTab(tabId);
  saveSessionStateDebounced();
  
  try {
    const absolutePath = `${currentWorkspace.path}/${node.path}`;
    const payload = await apiRequest(`/api/fs/read?path=${encodeURIComponent(absolutePath)}`);
    tab.content = payload.content;
    tab.path = payload.path;
    
    if (activeTabId === tabId) {
      showMarkdownContent(tab.content, tab.path);
    }
  } catch (error) {
    updateStatus(`Error loading file: ${error.message}`, "error");
  }
}

async function addExternalFileToWorkspace(tab) {
  if (!currentWorkspace || !tab.isExternal || !tab.path) return;
  
  try {
    const updated = await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/documents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourcePath: tab.path, mode: "copy" }),
    });
    
    currentWorkspace = updated;
    renderDocumentList();
    loadWorkspaceFiles();
    
    const newDoc = currentWorkspace.documents?.find(d => d.sourcePath === tab.path || d.name === tab.name);
    if (newDoc) {
      tab.docId = newDoc.id;
      tab.isExternal = false;
      renderTabs();
    }
    
    updateStatus(`Added "${tab.name}" to workspace`);
    saveSessionStateDebounced();
  } catch (error) {
    updateStatus(`Error adding to workspace: ${error.message}`, "error");
  }
}

function toggleFilterControls() {
  filterControls.classList.toggle("hidden");
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
  if (!currentWorkspace) {
    clearChatSessionState("Open a workspace to start");
  }
  
  renderWorkspaceOptions();
  renderDocumentList();
  renderFileTree();
  updateContextChips();
}

// Create Workspace Modal
function openCreateWorkspaceModal() {
  newWorkspaceNameInput.value = "";
  createWorkspaceModal.classList.remove("hidden");
  newWorkspaceNameInput.focus();
}

function closeCreateWorkspaceModalFn() {
  createWorkspaceModal.classList.add("hidden");
}

async function createWorkspace() {
  await ensureWorkspaceRootApplied();
  const name = newWorkspaceNameInput.value.trim();
  if (!name) {
    updateStatus("Enter a workspace name.", "error");
    return;
  }
  
  const workspace = await apiRequest("/api/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  
  currentWorkspace = workspace;
  
  // Clear tabs for new workspace
  openTabs = [];
  activeTabId = null;
  renderTabs();
  showPlaceholder();
  
  closeCreateWorkspaceModalFn();
  updateStatus(`Created workspace: ${workspace.name}`);
  await refreshWorkspaceList();
  await loadWorkspaceFiles();
  await loadBootstrapState();
  hydrateWorkspaceSessionState(bootstrapPayload?.workspaceSession, bootstrapPayload?.activeConversation);
  await loadConversationSummaries();
  if (activeConversationId) {
    await loadConversationById(activeConversationId);
  }
  await refreshChatSession();
  saveSessionStateDebounced();
}

async function openSelectedWorkspace() {
  await ensureWorkspaceRootApplied();
  const workspaceId = workspaceSelect.value;
  if (!workspaceId) {
    updateStatus("Select a workspace first.", "error");
    return;
  }
  
  const previousWorkspaceId = currentWorkspace?.id;
  
  currentWorkspace = await apiRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}/select`, {
    method: "POST",
  });
  
  // Clear tabs if switching to a different workspace
  if (previousWorkspaceId !== currentWorkspace.id) {
    openTabs = [];
    activeTabId = null;
    renderTabs();
    showPlaceholder();
  }
  
  renderDocumentList();
  await loadWorkspaceFiles();
  await loadBootstrapState();
  const shouldHydratePersistedState = bootstrapPayload?.merged?.workspaceId === currentWorkspace.id;
  if (shouldHydratePersistedState) {
    hydrateWorkspaceSessionState(bootstrapPayload.workspaceSession, bootstrapPayload?.activeConversation);
  }
  await loadConversationSummaries();
  updateContextChips();
  updateStatus(`Opened workspace: ${currentWorkspace.name}`);
  const shouldRefreshSession = previousWorkspaceId !== currentWorkspace.id || !sessionId;
  if (shouldRefreshSession) {
    await refreshChatSession();
  }
  
  if (!activeTabId && currentWorkspace.currentDocumentId && currentWorkspace.documents) {
    const doc = currentWorkspace.documents.find(d => d.id === currentWorkspace.currentDocumentId);
    if (doc) {
      openDocument(doc);
    }
  }
  if (activeConversationId) {
    await loadConversationById(activeConversationId);
  }
  saveSessionStateDebounced();
}

async function handleDocumentPicked(absolutePath) {
  if (!currentWorkspace) {
    updateStatus("Open a workspace first.", "error");
    return;
  }
  
  const updated = await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourcePath: absolutePath, mode: "copy" }),
  });
  
  currentWorkspace = updated;
  closeFolderModal();
  await refreshWorkspaceList();
  updateStatus(`Added document: ${basename(absolutePath)}`);
  
  const newDoc = currentWorkspace.documents.find(d => d.sourcePath === absolutePath || d.mdPath?.endsWith(basename(absolutePath)));
  if (newDoc) {
    openDocument(newDoc);
  }
}

// Chat
function appendMessage(role, text) {
  const node = document.createElement("article");
  node.className = `msg ${role}`;
  node.textContent = text;
  chatMessages.appendChild(node);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return node;
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
        chatMessages.scrollTop = chatMessages.scrollHeight;
      } else if (parsed.type === "error") {
        throw new Error(parsed.message ?? "Unknown stream error");
      }
    }
  }
  
  return fullReply;
}

async function initializeChat() {
  clearChatSessionState("Open a workspace to start");
  newSessionButton.disabled = true;
}

async function refreshChatSession() {
  if (!currentWorkspace) {
    clearChatSessionState("Open a workspace to start");
    return;
  }
  
  sessionStatus.textContent = "Creating session...";
  newSessionButton.disabled = true;
  
  try {
    const result = await apiRequest("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cwd: currentWorkspace.path,
        bookAgentConfigPath: `${workspaceRootInput.value.trim()}/.book_agent.json`,
        modelId: selectedModelId,
      }),
    });
    
    sessionId = result.sessionId;
    currentSessionContext = result.runtimeContext ?? null;
    const activeModel = result.modelId || selectedModelId;
    renderSessionStatus(activeModel, currentSessionContext);
    sendButton.disabled = false;
    messageInput.disabled = false;
    newSessionButton.disabled = false;
    saveSessionStateDebounced();
  } catch (error) {
    clearChatSessionState("Session error");
    handleError(error);
  }
}

// Resize Handle
function attachResizeBehavior() {
  let isDragging = false;
  
  resizeHandle.addEventListener("mousedown", () => {
    isDragging = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  });
  
  document.addEventListener("mousemove", (event) => {
    if (!isDragging) return;
    const rect = mainContent.getBoundingClientRect();
    const chatWidth = rect.right - event.clientX;
    const minChat = 280;
    const maxChat = rect.width * 0.5;
    
    if (chatWidth >= minChat && chatWidth <= maxChat) {
      mainContent.style.gridTemplateColumns = `1fr auto ${chatWidth}px`;
    }
  });
  
  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    saveSessionStateDebounced();
  });
}

// Error handling
function handleError(error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  updateStatus(`Error: ${message}`, "error");
  console.error(error);
}

// Keyboard shortcuts
function attachKeyboardShortcuts() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (!createWorkspaceModal.classList.contains("hidden")) {
        closeCreateWorkspaceModalFn();
      } else if (!chatListModal.classList.contains("hidden")) {
        closeChatListModal();
      } else if (!folderModal.classList.contains("hidden")) {
        closeFolderModal();
      }
    }
  });
}

// Initialize
async function initializeApp() {
  await loadBootstrapState();
  await loadModelOptions();
  await loadWorkspaceRoot();
  const preferredRoot = bootstrapPayload?.global?.lastRoot;
  if (typeof preferredRoot === "string" && preferredRoot && preferredRoot !== workspaceRootInput.value.trim()) {
    workspaceRootInput.value = preferredRoot;
    await saveWorkspaceRoot();
  }
  await refreshWorkspaceList();
  updateStatus("Ready");
  
  if (currentWorkspace?.id) {
    await openSelectedWorkspace();
  }
}

// Event Listeners
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
    if (!activeConversationId) {
      await createConversationAndActivate("New chat");
    }
    const assistantReply = await streamAssistantReply(userText);
    history.push({ role: "assistant", content: assistantReply });
    await appendConversationMessages([
      { role: "user", content: userText },
      { role: "assistant", content: assistantReply },
    ]);
    await maybeAutoRenameActiveConversation(userText, assistantReply);
    saveSessionStateDebounced();
  } catch (error) {
    appendMessage("system", `Error: ${error instanceof Error ? error.message : "Unknown error"}`);
  } finally {
    sendButton.disabled = false;
    messageInput.disabled = false;
    messageInput.focus();
  }
});

// Sidebar events
pickWorkspaceRootButton.addEventListener("click", () => openModal("pick-workspace-root", "Select Workspace Root", workspaceRootInput.value));
createWorkspaceButton.addEventListener("click", openCreateWorkspaceModal);
openWorkspaceButton.addEventListener("click", () => openSelectedWorkspace().catch(handleError));
workspaceSelect.addEventListener("change", () => {
  if (workspaceSelect.value) {
    openSelectedWorkspace().catch(handleError);
  }
});
addDocumentButton.addEventListener("click", () => {
  ensureWorkspaceRootApplied()
    .then(() => openModal("pick-document-file", "Add Document", currentWorkspace ? currentWorkspace.path : workspaceRootInput.value))
    .catch(handleError);
});

// File tree events
toggleFiltersButton.addEventListener("click", toggleFilterControls);
refreshFilesButton.addEventListener("click", () => loadWorkspaceFiles().catch(handleError));
hideImagesCheckbox.addEventListener("change", () => loadWorkspaceFiles().catch(handleError));
hideImagesCheckbox.addEventListener("change", () => saveSessionStateDebounced());
hideHiddenCheckbox.addEventListener("change", () => loadWorkspaceFiles().catch(handleError));
hideHiddenCheckbox.addEventListener("change", () => saveSessionStateDebounced());

// Create workspace modal events
closeCreateWorkspaceModal.addEventListener("click", closeCreateWorkspaceModalFn);
cancelCreateWorkspace.addEventListener("click", closeCreateWorkspaceModalFn);
confirmCreateWorkspace.addEventListener("click", () => createWorkspace().catch(handleError));
newWorkspaceNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    createWorkspace().catch(handleError);
  }
});

// Folder modal events
folderModalUpButton.addEventListener("click", () => {
  if (modalParentPath) {
    renderFolderModal(modalParentPath).catch(handleError);
  }
});
folderModalSelectButton.addEventListener("click", applyModalSelection);
folderModalNewButton.addEventListener("click", () => createFolderFromModal().catch(handleError));
closeFolderModalButton.addEventListener("click", closeFolderModal);
folderModalCancelButton.addEventListener("click", closeFolderModal);
folderModal.addEventListener("click", (event) => {
  if (event.target === folderModal) closeFolderModal();
});
createWorkspaceModal.addEventListener("click", (event) => {
  if (event.target === createWorkspaceModal) closeCreateWorkspaceModalFn();
});
closeChatListModalButton.addEventListener("click", closeChatListModal);
cancelChatListButton.addEventListener("click", closeChatListModal);
newChatFromListButton.addEventListener("click", () => {
  createConversationAndActivate("New chat")
    .then(() => refreshChatSession())
    .then(() => loadConversationSummaries())
    .then(() => renderConversationList())
    .then(() => closeChatListModal())
    .then(() => saveSessionStateDebounced())
    .catch(handleError);
});
chatListModal.addEventListener("click", (event) => {
  if (event.target === chatListModal) closeChatListModal();
});

// View mode events
markdownViewButton.addEventListener("click", () => {
  const activeTab = openTabs.find(t => t.id === activeTabId);
  if (activeTab?.content) {
    showMarkdownContent(activeTab.content, activeTab.path);
  }
});

modelSelect.addEventListener("change", () => {
  setSelectedModel(modelSelect.value);
  if (currentWorkspace) {
    refreshChatSession().catch(handleError);
  }
});

newSessionButton.addEventListener("click", () => {
  openChatListModal();
});

// Initialize
attachResizeBehavior();
attachKeyboardShortcuts();
initializeChat();
initializeApp().catch(handleError);
