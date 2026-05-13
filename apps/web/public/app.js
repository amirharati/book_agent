import { marked } from "/web_modules/marked/lib/marked.esm.js";
import DOMPurify from "/web_modules/dompurify/dist/purify.es.mjs";

if (typeof window.markedKatex === "function") {
  marked.use(window.markedKatex({ throwOnError: false, nonStandard: true }));
} else {
  console.warn("marked-katex-extension not available; math rendering extension disabled.");
}
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
const deleteWorkspaceButton = document.querySelector("#deleteWorkspaceButton");
const openTrashButton = document.querySelector("#openTrashButton");
const openWorkspaceButton = document.querySelector("#openWorkspaceButton");
const addDocumentButton = document.querySelector("#addDocumentButton");
const deleteDocumentButton = document.querySelector("#deleteDocumentButton");
const openDocumentTrashButton = document.querySelector("#openDocumentTrashButton");
const documentList = document.querySelector("#documentList");
const artifactList = document.querySelector("#artifactList");
const documentsTabInputs = document.querySelector("#documentsTabInputs");
const documentsTabArtifacts = document.querySelector("#documentsTabArtifacts");
const documentsInputsPanel = document.querySelector("#documentsInputsPanel");
const documentsArtifactsPanel = document.querySelector("#documentsArtifactsPanel");
const setupStatus = document.querySelector("#setupStatus");
const workspaceChip = document.querySelector("#workspaceChip");
const documentChip = document.querySelector("#documentChip");
const openSettingsButton = document.querySelector("#openSettingsButton");
const jobsList = document.querySelector("#jobsList");
const jobsSection = document.querySelector("#jobsSection");
const pendingJobsButton = document.querySelector("#pendingJobsButton");
const pendingJobsLabel = document.querySelector("#pendingJobsLabel");
const toggleSetupSection = document.querySelector("#toggleSetupSection");
const setupContent = document.querySelector("#setupContent");

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
const settingsModal = document.querySelector("#settingsModal");
const closeSettingsModalButton = document.querySelector("#closeSettingsModalButton");
const cancelSettingsButton = document.querySelector("#cancelSettingsButton");
const saveSettingsButton = document.querySelector("#saveSettingsButton");
const markerServerUrlInput = document.querySelector("#markerServerUrlInput");
const markerTimeoutSecInput = document.querySelector("#markerTimeoutSecInput");
const markerPollIntervalMsInput = document.querySelector("#markerPollIntervalMsInput");
const conversionModal = document.querySelector("#conversionModal");
const closeConversionModalButton = document.querySelector("#closeConversionModalButton");
const cancelConversionModalButton = document.querySelector("#cancelConversionModalButton");
const confirmConversionModalButton = document.querySelector("#confirmConversionModalButton");
const conversionModalDocName = document.querySelector("#conversionModalDocName");
const conversionModeSelect = document.querySelector("#conversionModeSelect");
const conversionPageRangeInput = document.querySelector("#conversionPageRangeInput");
const conversionStartNowCheckbox = document.querySelector("#conversionStartNowCheckbox");
const toggleConversionAdvancedButton = document.querySelector("#toggleConversionAdvancedButton");
const conversionAdvancedFields = document.querySelector("#conversionAdvancedFields");
const convUseLlmCheckbox = document.querySelector("#convUseLlmCheckbox");
const convLlmServiceInput = document.querySelector("#convLlmServiceInput");
const convGeminiModelInput = document.querySelector("#convGeminiModelInput");
const convPaginateOutputCheckbox = document.querySelector("#convPaginateOutputCheckbox");
const convLowresImageDpiInput = document.querySelector("#convLowresImageDpiInput");
const convExtractImagesCheckbox = document.querySelector("#convExtractImagesCheckbox");
const convDisableImageExtractionCheckbox = document.querySelector("#convDisableImageExtractionCheckbox");
const convForceOcrCheckbox = document.querySelector("#convForceOcrCheckbox");
const convStripExistingOcrCheckbox = document.querySelector("#convStripExistingOcrCheckbox");
const convDisableOcrCheckbox = document.querySelector("#convDisableOcrCheckbox");
const convHtmlTablesCheckbox = document.querySelector("#convHtmlTablesCheckbox");
const convKeepPageHeaderCheckbox = document.querySelector("#convKeepPageHeaderCheckbox");
const convKeepPageFooterCheckbox = document.querySelector("#convKeepPageFooterCheckbox");
const convAddBlockIdsCheckbox = document.querySelector("#convAddBlockIdsCheckbox");
const convKatexCompatibleCheckbox = document.querySelector("#convKatexCompatibleCheckbox");
const convNormalizeEquationTagsCheckbox = document.querySelector("#convNormalizeEquationTagsCheckbox");
const convRedoInlineMathCheckbox = document.querySelector("#convRedoInlineMathCheckbox");
const convDebugCheckbox = document.querySelector("#convDebugCheckbox");
const pendingJobsModal = document.querySelector("#pendingJobsModal");
const closePendingJobsModalButton = document.querySelector("#closePendingJobsModalButton");
const closePendingJobsFooterButton = document.querySelector("#closePendingJobsFooterButton");
const pendingJobsList = document.querySelector("#pendingJobsList");
const jobDetailsModal = document.querySelector("#jobDetailsModal");
const closeJobDetailsModalButton = document.querySelector("#closeJobDetailsModalButton");
const closeJobDetailsFooterButton = document.querySelector("#closeJobDetailsFooterButton");
const jobDetailsBody = document.querySelector("#jobDetailsBody");
const trashModal = document.querySelector("#trashModal");
const workspaceTrashList = document.querySelector("#workspaceTrashList");
const documentTrashList = document.querySelector("#documentTrashList");
const closeTrashModalButton = document.querySelector("#closeTrashModalButton");
const closeTrashModalFooterButton = document.querySelector("#closeTrashModalFooterButton");
const deleteConfirmModal = document.querySelector("#deleteConfirmModal");
const deleteConfirmTitle = document.querySelector("#deleteConfirmTitle");
const deleteConfirmMessage = document.querySelector("#deleteConfirmMessage");
const closeDeleteConfirmModalButton = document.querySelector("#closeDeleteConfirmModalButton");
const deleteConfirmCancelButton = document.querySelector("#deleteConfirmCancelButton");
const deleteConfirmSoftButton = document.querySelector("#deleteConfirmSoftButton");
const deleteConfirmHardButton = document.querySelector("#deleteConfirmHardButton");

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
let conversionSettings = null;
let jobsPollTimer = null;
let workspaceJobs = [];
let conversionTargetDocument = null;
let jobsPollFailureCount = 0;
let deleteConfirmAction = null;
let documentsPanelTab = "inputs";
let workspaceSyncTimer = null;
let workspaceSyncInFlight = false;
let workspaceSyncTick = 0;

const WORKSPACE_SYNC_INTERVAL_MS = 5000;
const WORKSPACE_LIST_SYNC_EVERY_TICKS = 6;

const DEFAULT_MARKER_OPTIONS = {
  output_format: "markdown",
  use_llm: true,
  llm_service: "marker.services.gemini.GoogleGeminiService",
  gemini_model_name: "gemini-3.1-flash-lite",
  paginate_output: true,
  lowres_image_dpi: 150,
  extract_images: true,
  disable_image_extraction: false,
  force_ocr: false,
  strip_existing_ocr: false,
  disable_ocr: false,
  html_tables_in_markdown: false,
  keep_pageheader_in_output: false,
  keep_pagefooter_in_output: false,
  add_block_ids: false,
  katex_compatible: true,
  normalize_equation_tags: true,
  redo_inline_math: false,
  debug: false,
};

// Tab state
let openTabs = [];
let activeTabId = null;

// File tree state
let workspaceFileTree = [];
let workspaceArtifacts = [];
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

function getImportPickerStorageKey() {
  const workspaceId = currentWorkspace?.id ?? "global";
  return `bookAgent:lastImportPath:${workspaceId}`;
}

function readLastImportPath() {
  try {
    return window.localStorage.getItem(getImportPickerStorageKey()) ?? "";
  } catch {
    return "";
  }
}

function saveLastImportPath(pathValue) {
  if (!pathValue) return;
  try {
    window.localStorage.setItem(getImportPickerStorageKey(), pathValue);
  } catch {
    // Ignore storage errors (private mode / disabled storage).
  }
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
  if (includeFiles) params.set("includeFiles", "documents");
  return apiRequest(`/api/fs/list?${params.toString()}`);
}

async function loadBootstrapState() {
  bootstrapPayload = await apiRequest("/api/state/bootstrap");
  conversionSettings = bootstrapPayload?.conversionSettings ?? conversionSettings;
  return bootstrapPayload;
}

function renderSettingsForm() {
  const settings = conversionSettings ?? bootstrapPayload?.conversionSettings ?? {
    markerServerUrl: "http://127.0.0.1:8001",
    timeoutSec: 180,
    pollIntervalMs: 2000,
  };
  markerServerUrlInput.value = settings.markerServerUrl ?? "http://127.0.0.1:8001";
  markerTimeoutSecInput.value = String(settings.timeoutSec ?? 180);
  markerPollIntervalMsInput.value = String(settings.pollIntervalMs ?? 2000);
}

function openSettingsModal() {
  renderSettingsForm();
  settingsModal.classList.remove("hidden");
}

function closeSettingsModal() {
  settingsModal.classList.add("hidden");
}

async function saveConversionSettings() {
  const payload = {
    markerServerUrl: markerServerUrlInput.value.trim() || "http://127.0.0.1:8001",
    timeoutSec: Number.parseInt(markerTimeoutSecInput.value, 10) || 180,
    pollIntervalMs: Number.parseInt(markerPollIntervalMsInput.value, 10) || 2000,
  };
  conversionSettings = await apiRequest("/api/settings/conversion", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  bootstrapPayload = bootstrapPayload ?? {};
  bootstrapPayload.conversionSettings = conversionSettings;
  updateStatus("Conversion settings saved");
  closeSettingsModal();
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
      mdPath: tab.mdPath ?? null,
      pdfPath: tab.pdfPath ?? null,
      viewType: tab.viewType ?? "markdown",
      isExternal: Boolean(tab.isExternal),
      scrollTop: tab.scrollTop ?? 0,
      pdfPage: tab.pdfPage ?? 1,
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
          mdPath: tab.mdPath ?? null,
          pdfPath: tab.pdfPath ?? null,
          viewType: tab.viewType ?? "markdown",
          content: null,
          renderedHtml: null,
          windowHtml: null,
          chunkState: null,
          renderToken: 0,
          loadFailed: false,
          isExternal: Boolean(tab.isExternal),
          scrollTop: tab.scrollTop ?? 0,
          pdfPage: tab.pdfPage ?? 1,
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
const CHUNK_THRESHOLD_LINES = 500;
const CHUNK_SIZE_LINES = 200;
const ACTIVE_WINDOW_RADIUS = 2;
const INACTIVE_WINDOW_RADIUS = 1;
const BACKGROUND_CHUNKS_PER_TICK = 2;

function renderMarkdownToHtml(markdownSource) {
  try {
    const rawHtml = marked.parse(markdownSource);
    return DOMPurify.sanitize(rawHtml, SANITIZE_CONFIG);
  } catch (error) {
    console.error("Markdown render failed:", error);
    return `<pre>${markdownSource.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c])}</pre>`;
  }
}

function splitMarkdownIntoChunks(markdownSource) {
  const lines = markdownSource.split("\n");
  if (lines.length < CHUNK_THRESHOLD_LINES) {
    return [{ start: 0, end: lines.length, content: markdownSource }];
  }
  
  const chunks = [];
  let currentStart = 0;
  
  while (currentStart < lines.length) {
    let end = Math.min(currentStart + CHUNK_SIZE_LINES, lines.length);
    
    if (end < lines.length) {
      for (let i = end; i < Math.min(end + 50, lines.length); i++) {
        if (/^#{1,3}\s/.test(lines[i])) {
          end = i;
          break;
        }
      }
    }
    
    chunks.push({
      start: currentStart,
      end,
      content: lines.slice(currentStart, end).join("\n"),
    });
    currentStart = end;
  }
  
  return chunks;
}

function estimateChunkForScroll(chunks, scrollTop, totalHeight) {
  if (chunks.length <= 1 || totalHeight <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, scrollTop / totalHeight));
  return Math.floor(ratio * chunks.length);
}

function cancelTabBackgroundRender(tab) {
  tab.renderToken = (tab.renderToken ?? 0) + 1;
}

function invalidateTabRenderCache(tab) {
  cancelTabBackgroundRender(tab);
  tab.renderedHtml = null;
  tab.windowHtml = null;
  tab.chunkState = null;
}

function ensureChunkState(tab) {
  if (!tab?.content) return null;
  if (tab.chunkState?.source === tab.content) {
    return tab.chunkState;
  }
  const chunks = splitMarkdownIntoChunks(tab.content);
  tab.chunkState = {
    source: tab.content,
    chunks,
    htmlChunks: new Array(chunks.length).fill(null),
  };
  return tab.chunkState;
}

function estimateChunkIndexForTab(tab, state) {
  if (!state || state.chunks.length <= 1) return 0;
  const estimatedTotalHeight = state.chunks.length * 700;
  return estimateChunkForScroll(state.chunks, tab.scrollTop ?? 0, estimatedTotalHeight);
}

function chunkPriorityOrder(total, centerIdx) {
  const order = [centerIdx];
  for (let i = 1; i < total; i++) {
    if (centerIdx - i >= 0) order.push(centerIdx - i);
    if (centerIdx + i < total) order.push(centerIdx + i);
  }
  return order;
}

function renderChunkHtml(state, idx) {
  if (state.htmlChunks[idx] !== null) {
    return state.htmlChunks[idx];
  }
  const html = renderMarkdownToHtml(state.chunks[idx].content);
  state.htmlChunks[idx] = html;
  return html;
}

function buildWindowHtml(tab, filePath, radius) {
  const state = ensureChunkState(tab);
  if (!state) return { html: "", centerIdx: 0 };
  const centerIdx = estimateChunkIndexForTab(tab, state);
  const start = Math.max(0, centerIdx - radius);
  const end = Math.min(state.chunks.length - 1, centerIdx + radius);
  const parts = [];
  for (let idx = start; idx <= end; idx++) {
    parts.push(`<section data-chunk-idx="${idx}">${renderChunkHtml(state, idx)}</section>`);
  }
  return { html: parts.join(""), centerIdx };
}

function pruneTabToWindow(tab, radius = INACTIVE_WINDOW_RADIUS) {
  if (!tab?.content || tab.viewType === "pdf" || tab.loadFailed) return;
  const state = ensureChunkState(tab);
  if (!state) return;
  const centerIdx = estimateChunkIndexForTab(tab, state);
  const start = Math.max(0, centerIdx - radius);
  const end = Math.min(state.chunks.length - 1, centerIdx + radius);
  for (let idx = 0; idx < state.htmlChunks.length; idx++) {
    if (idx < start || idx > end) {
      state.htmlChunks[idx] = null;
    }
  }
  tab.renderedHtml = null;
  tab.windowHtml = buildWindowHtml(tab, tab.path, radius).html;
  cancelTabBackgroundRender(tab);
}

function startBackgroundRender(tab, filePath, centerIdx) {
  const state = ensureChunkState(tab);
  if (!state) return;
  const token = (tab.renderToken ?? 0) + 1;
  tab.renderToken = token;
  const order = chunkPriorityOrder(state.chunks.length, centerIdx);
  let pointer = 0;

  const step = () => {
    if ((tab.renderToken ?? 0) !== token) return;
    let renderedThisTick = 0;
    while (pointer < order.length && renderedThisTick < BACKGROUND_CHUNKS_PER_TICK) {
      const idx = order[pointer++];
      if (state.htmlChunks[idx] === null) {
        renderChunkHtml(state, idx);
        renderedThisTick += 1;
      }
    }
    if (pointer < order.length) {
      window.setTimeout(step, 0);
      return;
    }

    if (activeTabId === tab.id && tab.viewType !== "pdf") {
      const currentScroll = markdownViewer.scrollTop ?? 0;
      markdownViewer.innerHTML = state.htmlChunks
        .map((chunkHtml, idx) => `<section data-chunk-idx="${idx}">${chunkHtml ?? ""}</section>`)
        .join("");
      rewriteRelativeAssets(markdownViewer, filePath);
      tab.renderedHtml = markdownViewer.innerHTML;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          markdownViewer.scrollTop = currentScroll;
        });
      });
      for (const otherTab of openTabs) {
        if (otherTab.id !== tab.id) {
          pruneTabToWindow(otherTab, INACTIVE_WINDOW_RADIUS);
        }
      }
    }
  };

  window.setTimeout(step, 0);
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
    img.addEventListener("error", handleImageError, { once: true });
  }
}

function handleImageError(event) {
  const img = event.target;
  img.style.display = "none";
  const placeholder = document.createElement("span");
  placeholder.className = "image-error";
  placeholder.textContent = "[Image not found]";
  placeholder.title = img.getAttribute("src") || "Missing image";
  img.parentNode?.insertBefore(placeholder, img);
}

// Tab Management
function generateTabId() {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createTab(doc) {
  const hasMarkdown = Boolean(doc.mdPath);
  const hasPdf = Boolean(doc.pdfPath);
  const sourceKind = doc.sourceKind ?? (hasMarkdown ? "markdown" : "pdf");
  const preferPdf = sourceKind === "pdf" && !hasMarkdown && hasPdf;
  const tabId = generateTabId();
  const tab = {
    id: tabId,
    docId: doc.id,
    name: doc.name,
    path: hasMarkdown ? doc.mdPath : (doc.pdfPath ?? doc.sourcePath),
    mdPath: doc.mdPath ?? null,
    pdfPath: doc.pdfPath ?? null,
    viewType: preferPdf ? "pdf" : (hasMarkdown ? "markdown" : (hasPdf ? "pdf" : "markdown")),
    content: null,
    renderedHtml: null,
    windowHtml: null,
    chunkState: null,
    renderToken: 0,
    loadFailed: false,
    isExternal: false,
    scrollTop: 0,
    pdfPage: 1,
  };
  openTabs.push(tab);
  renderTabs();
  saveSessionStateDebounced();
  return tabId;
}

let lastRenderedTabIds = "";

function renderTabs() {
  const currentTabIds = openTabs.map(t => t.id).join(",");
  const tabsChanged = currentTabIds !== lastRenderedTabIds;
  
  if (!tabsChanged) {
    for (const tabEl of tabs.querySelectorAll(".tab")) {
      const isActive = tabEl.dataset.tabId === activeTabId;
      tabEl.classList.toggle("active", isActive);
      const tab = openTabs.find(t => t.id === tabEl.dataset.tabId);
      const addBtn = tabEl.querySelector(".tab-add");
      if (tab?.isExternal && isActive && !addBtn) {
        const newAddBtn = document.createElement("button");
        newAddBtn.type = "button";
        newAddBtn.className = "tab-add";
        newAddBtn.title = "Add to Workspace";
        newAddBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2v8M2 6h8"/></svg>`;
        newAddBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          addExternalFileToWorkspace(tab).catch(handleError);
        });
        tabEl.insertBefore(newAddBtn, tabEl.querySelector(".tab-close"));
      } else if (addBtn && (!tab?.isExternal || !isActive)) {
        addBtn.remove();
      }
    }
    return;
  }
  
  lastRenderedTabIds = currentTabIds;
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

  const previousActiveTabId = activeTabId;
  saveCurrentTabPosition();
  if (previousActiveTabId && previousActiveTabId !== tabId) {
    const previousTab = openTabs.find((entry) => entry.id === previousActiveTabId);
    if (previousTab) {
      pruneTabToWindow(previousTab, INACTIVE_WINDOW_RADIUS);
    }
  }
  
  activeTabId = tabId;
  renderTabs();
  updateContextChips();
  saveSessionStateDebounced();

  if ((tab.viewType === "pdf" || tab.loadFailed) && tab.pdfPath) {
    showPdfContent(tab.pdfPath, tab.pdfPage);
    return;
  }
  
  if (tab.renderedHtml) {
    showCachedHtml(tab.renderedHtml, tab.scrollTop, tab.path);
    return;
  }

  if (tab.windowHtml) {
    showCachedHtml(tab.windowHtml, tab.scrollTop, tab.path);
    if (tab.content !== null) {
      const state = ensureChunkState(tab);
      const centerIdx = estimateChunkIndexForTab(tab, state);
      startBackgroundRender(tab, tab.path, centerIdx);
    }
    return;
  }

  if (tab.content !== null) {
    showMarkdownContent(tab.content, tab.path, tab);
    return;
  }
  
  showLoadingState();
  loadTabContent(tab).catch(handleError);
}

function saveCurrentTabPosition() {
  const currentTab = openTabs.find(t => t.id === activeTabId);
  if (!currentTab) return;
  
  if (currentTab.viewType === "pdf" || currentTab.loadFailed) {
    // PDF page tracking is harder - we'll rely on persisted pdfPage for now
  } else {
    currentTab.scrollTop = markdownViewer.scrollTop ?? 0;
  }
}

function showLoadingState() {
  viewerPlaceholder.classList.add("hidden");
  pdfViewer.classList.add("hidden");
  markdownViewer.classList.remove("hidden");
  markdownViewer.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><span>Loading document...</span></div>';
}

function closeTab(tabId) {
  const idx = openTabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;

  cancelTabBackgroundRender(openTabs[idx]);
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

  if (tab.viewType === "pdf" && tab.pdfPath) {
    showPdfContent(tab.pdfPath, tab.pdfPage);
    preloadOtherTabs(tab.id);
    return;
  }

  if (!tab.mdPath && tab.pdfPath) {
    tab.viewType = "pdf";
    showPdfContent(tab.pdfPath, tab.pdfPage);
    showPdfStatusForTab(tab);
    preloadOtherTabs(tab.id);
    return;
  }

  try {
    if (tab.isExternal || !tab.docId) {
      const payload = await apiRequest(`/api/fs/read?path=${encodeURIComponent(tab.path)}`);
      tab.content = payload.content;
      tab.path = payload.path;
    } else {
      const payload = await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/documents/${encodeURIComponent(tab.docId)}/content`);
      tab.content = payload.content;
      tab.path = payload.document.mdPath ?? payload.document.sourcePath;
      tab.mdPath = payload.document.mdPath ?? tab.mdPath;
      tab.pdfPath = payload.document.pdfPath ?? tab.pdfPath;
      tab.viewType = "markdown";
    }

    if (activeTabId === tab.id) {
      showMarkdownContent(tab.content, tab.path, tab);
    }
    preloadOtherTabs(tab.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const missingMarkdown = message.includes("does not have markdown content yet");

    if (missingMarkdown && tab.docId) {
      await tryFallbackToPdf(tab);
      return;
    }
    if (activeTabId === tab.id) {
      updateStatus(`Error loading file: ${message}`, "error");
    }
  }
}

let preloadingInProgress = false;
async function preloadOtherTabs(excludeTabId) {
  if (preloadingInProgress) return;
  preloadingInProgress = true;
  
  try {
    const tabsToPreload = openTabs.filter(t => 
      t.id !== excludeTabId && 
      t.content === null && 
      !t.loadFailed && 
      t.viewType !== "pdf"
    );
    
    for (const tab of tabsToPreload) {
      if (!currentWorkspace) break;
      try {
        if (tab.isExternal || !tab.docId) {
          const payload = await apiRequest(`/api/fs/read?path=${encodeURIComponent(tab.path)}`);
          tab.content = payload.content;
          tab.path = payload.path;
        } else if (tab.mdPath) {
          const payload = await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/documents/${encodeURIComponent(tab.docId)}/content`);
          tab.content = payload.content;
          tab.path = payload.document.mdPath ?? payload.document.sourcePath;
          tab.mdPath = payload.document.mdPath ?? tab.mdPath;
          tab.pdfPath = payload.document.pdfPath ?? tab.pdfPath;
        }
      } catch {
        tab.loadFailed = true;
      }
    }
  } finally {
    preloadingInProgress = false;
  }
}

async function tryFallbackToPdf(tab) {
  tab.loadFailed = true;
  let pdfPath = tab.pdfPath;
  
  if (!pdfPath && tab.docId && currentWorkspace) {
    try {
      const detail = await apiRequest(
        `/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/documents/${encodeURIComponent(tab.docId)}`,
      );
      pdfPath = detail?.pdfPath;
      tab.pdfPath = pdfPath ?? tab.pdfPath;
    } catch {
      // Ignore fetch errors
    }
  }
  
  if (pdfPath && activeTabId === tab.id) {
    tab.viewType = "pdf";
    showPdfContent(pdfPath, tab.pdfPage);
    showPdfStatusForTab(tab);
  } else if (activeTabId === tab.id) {
    updateStatus(`No PDF available for ${tab.name}. Run conversion first.`, "error");
  }
}

function showPdfStatusForTab(tab) {
  const latestJob = workspaceJobs.find((job) => job.documentId === tab.docId);
  if (latestJob?.status === "failed") {
    updateStatus(`Markdown conversion failed for ${tab.name}. Use Retry in Jobs.`, "error");
  } else if (latestJob?.status === "running" || latestJob?.status === "pending") {
    updateStatus(`Conversion in progress for ${tab.name}...`, "info");
  } else {
    updateStatus(`Showing PDF - markdown not ready for ${tab.name}.`, "info");
  }
}

function showPlaceholder() {
  viewerPlaceholder.classList.remove("hidden");
  markdownViewer.classList.add("hidden");
  pdfViewer.classList.add("hidden");
  updateContextChips();
}

function showMarkdownContent(content, filePath, tabToCache = null) {
  viewerPlaceholder.classList.add("hidden");
  pdfViewer.classList.add("hidden");
  markdownViewer.classList.remove("hidden");

  if (!tabToCache) {
    const html = renderMarkdownToHtml(content);
    markdownViewer.innerHTML = html;
    rewriteRelativeAssets(markdownViewer, filePath);
  } else {
    tabToCache.content = content;
    const { html, centerIdx } = buildWindowHtml(tabToCache, filePath, ACTIVE_WINDOW_RADIUS);
    markdownViewer.innerHTML = html;
    rewriteRelativeAssets(markdownViewer, filePath);
    tabToCache.windowHtml = markdownViewer.innerHTML;
    tabToCache.renderedHtml = null;
    startBackgroundRender(tabToCache, filePath, centerIdx);
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (tabToCache) {
        markdownViewer.scrollTop = tabToCache.scrollTop ?? 0;
      }
    });
  });

  markdownViewButton.classList.add("active");
  pdfViewButton.classList.remove("active");
  saveSessionStateDebounced();
}

let activeChunkedTabId = null;

function renderChunkedMarkdown(chunks, filePath, tabToCache = null) {
  const targetScroll = tabToCache?.scrollTop ?? 0;
  const currentTabId = activeTabId;
  activeChunkedTabId = currentTabId;
  
  const estimatedTotalHeight = chunks.length * 800;
  const startChunkIdx = estimateChunkForScroll(chunks, targetScroll, estimatedTotalHeight);
  
  const priorityOrder = [startChunkIdx];
  for (let i = 1; i < chunks.length; i++) {
    if (startChunkIdx - i >= 0) priorityOrder.push(startChunkIdx - i);
    if (startChunkIdx + i < chunks.length) priorityOrder.push(startChunkIdx + i);
  }
  
  const chunkElements = chunks.map((_, idx) => {
    const placeholder = document.createElement("div");
    placeholder.className = "chunk-placeholder";
    placeholder.dataset.chunkIdx = idx;
    placeholder.style.minHeight = "200px";
    return placeholder;
  });
  
  markdownViewer.innerHTML = "";
  for (const el of chunkElements) {
    markdownViewer.appendChild(el);
  }
  
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      markdownViewer.scrollTop = targetScroll;
    });
  });
  
  let renderedCount = 0;
  const renderNextChunk = () => {
    if (activeChunkedTabId !== currentTabId) {
      return;
    }
    
    if (renderedCount >= priorityOrder.length) {
      if (tabToCache) {
        tabToCache.renderedHtml = markdownViewer.innerHTML;
      }
      activeChunkedTabId = null;
      return;
    }
    
    const idx = priorityOrder[renderedCount];
    const chunk = chunks[idx];
    const placeholder = chunkElements[idx];
    
    const html = renderMarkdownToHtml(chunk.content);
    const wrapper = document.createElement("div");
    wrapper.className = "chunk-rendered";
    wrapper.innerHTML = html;
    rewriteRelativeAssets(wrapper, filePath);
    
    placeholder.replaceWith(wrapper);
    chunkElements[idx] = wrapper;
    
    renderedCount++;
    
    if (tabToCache && renderedCount === 1) {
      tabToCache.renderedHtml = markdownViewer.innerHTML;
    }
    
    if (renderedCount < priorityOrder.length) {
      requestAnimationFrame(renderNextChunk);
    } else if (tabToCache) {
      tabToCache.renderedHtml = markdownViewer.innerHTML;
      activeChunkedTabId = null;
    }
  };
  
  requestAnimationFrame(renderNextChunk);
}

function showCachedHtml(html, scrollTop = 0, filePath = null) {
  viewerPlaceholder.classList.add("hidden");
  pdfViewer.classList.add("hidden");
  markdownViewer.classList.remove("hidden");
  markdownViewer.innerHTML = html;
  if (filePath) {
    rewriteRelativeAssets(markdownViewer, filePath);
  }
  
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      markdownViewer.scrollTop = scrollTop;
    });
  });
  
  markdownViewButton.classList.add("active");
  pdfViewButton.classList.remove("active");
}

function showPdfContent(filePath, page = 1) {
  if (!filePath) {
    updateStatus("No PDF available for this document.", "error");
    return;
  }
  viewerPlaceholder.classList.add("hidden");
  markdownViewer.classList.add("hidden");
  pdfViewer.classList.remove("hidden");
  const pageParam = page > 1 ? `#page=${page}` : "";
  pdfViewer.src = `/api/fs/file?path=${encodeURIComponent(filePath)}${pageParam}`;
  markdownViewButton.classList.remove("active");
  pdfViewButton.classList.add("active");
  saveSessionStateDebounced();
}

// Open document (creates tab if needed)
function openDocument(doc) {
  const existingTab = openTabs.find(t => t.docId === doc.id);
  if (existingTab) {
    existingTab.name = doc.name;
    const previousMdPath = existingTab.mdPath;
    const nextMdPath = doc.mdPath ?? null;
    const nextPdfPath = doc.pdfPath ?? null;
    const mdPathChanged = previousMdPath !== nextMdPath;
    if (mdPathChanged) {
      existingTab.content = null;
      invalidateTabRenderCache(existingTab);
      existingTab.loadFailed = false;
    }
    existingTab.mdPath = nextMdPath;
    existingTab.pdfPath = nextPdfPath;
    if (existingTab.mdPath) {
      existingTab.path = existingTab.mdPath;
      if (!previousMdPath || existingTab.loadFailed) {
        existingTab.viewType = "markdown";
      }
    } else if (existingTab.pdfPath) {
      existingTab.path = existingTab.pdfPath;
      existingTab.viewType = "pdf";
    }
    activateTab(existingTab.id);
  } else {
    const tabId = createTab(doc);
    activateTab(tabId);
  }
}

function syncOpenTabsWithWorkspaceDocuments() {
  if (!currentWorkspace) return false;
  let activeTabNeedsReload = false;
  for (const tab of openTabs) {
    if (tab.isExternal || !tab.docId) continue;
    const doc = currentWorkspace.documents?.find(d => d.id === tab.docId);
    if (!doc) continue;
    const previousMdPath = tab.mdPath ?? null;
    const nextMdPath = doc.mdPath ?? null;
    const nextPdfPath = doc.pdfPath ?? null;
    const mdPathChanged = previousMdPath !== nextMdPath;
    const pdfPathChanged = (tab.pdfPath ?? null) !== nextPdfPath;
    if (!mdPathChanged && !pdfPathChanged && tab.name === doc.name) {
      continue;
    }
    tab.name = doc.name;
    tab.mdPath = nextMdPath;
    tab.pdfPath = nextPdfPath;
    if (mdPathChanged) {
      tab.content = null;
      invalidateTabRenderCache(tab);
      tab.loadFailed = false;
      if (tab.mdPath) {
        tab.path = tab.mdPath;
        if (!previousMdPath || tab.viewType === "pdf") {
          tab.viewType = "markdown";
        }
      } else if (tab.pdfPath) {
        tab.path = tab.pdfPath;
      }
      if (tab.id === activeTabId) {
        activeTabNeedsReload = true;
      }
    } else if (pdfPathChanged && !tab.mdPath && tab.pdfPath) {
      tab.path = tab.pdfPath;
      if (tab.id === activeTabId && tab.viewType === "pdf") {
        activeTabNeedsReload = true;
      }
    }
  }
  renderTabs();
  return activeTabNeedsReload;
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
    empty.textContent = includeFiles ? "No folders or markdown/pdf files here." : "No subfolders here.";
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
  renderJobs([]);
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
  const documents = currentWorkspace?.documents ?? [];
  const activeDocument = getCurrentWorkspaceDocument();

  addDocumentButton.disabled = !currentWorkspace;
  openDocumentTrashButton.disabled = !currentWorkspace;
  deleteDocumentButton.disabled = !activeDocument || documentsPanelTab !== "inputs";

  renderInputDocumentList(documents);
  renderArtifactList();
  renderDocumentsPanelState();
}

function renderInputDocumentList(documents) {
  documentList.innerHTML = "";
  if (!currentWorkspace || documents.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-hint";
    empty.textContent = currentWorkspace ? "No documents added yet" : "Open a workspace to see documents";
    documentList.appendChild(empty);
    return;
  }

  for (const doc of documents) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "document-item";
    if (currentWorkspace.currentDocumentId === doc.id) {
      item.classList.add("active");
    }
    
    const convertButton = (doc.pdfPath)
      ? `<button class="btn btn-ghost btn-icon btn-sm doc-convert-btn" title="Convert PDF to markdown">⚙</button>`
      : "";
    item.innerHTML = `
      <svg class="document-item-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M4 2h6l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/>
        <path d="M10 2v4h4"/>
      </svg>
      <span class="document-item-name">${doc.name}</span>
      ${convertButton}
    `;
    const convertBtn = item.querySelector(".doc-convert-btn");
    if (convertBtn) {
      convertBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openConversionModalForDocument(doc);
      });
    }
    item.addEventListener("click", () => {
      setCurrentAndOpenDocument(doc).catch(handleError);
    });
    
    documentList.appendChild(item);
  }
}

async function loadWorkspaceArtifacts({ reconcile = true } = {}) {
  if (!currentWorkspace) {
    workspaceArtifacts = [];
    renderArtifactList();
    return;
  }
  try {
    const query = new URLSearchParams();
    query.set("reconcile", reconcile ? "true" : "false");
    const payload = await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/artifacts?${query.toString()}`);
    workspaceArtifacts = Array.isArray(payload.artifacts) ? payload.artifacts : [];
  } catch (error) {
    console.warn("Failed to load workspace artifacts:", error);
    workspaceArtifacts = [];
  }
  renderArtifactList();
}

function renderArtifactList() {
  artifactList.innerHTML = "";
  if (!currentWorkspace) {
    artifactList.innerHTML = `<p class="empty-hint">Open a workspace to see artifacts</p>`;
    return;
  }

  if (!workspaceArtifacts.length) {
    artifactList.innerHTML = `<p class="empty-hint">No generated artifacts yet. Run a conversion and they will appear here.</p>`;
    return;
  }

  for (const artifact of workspaceArtifacts) {
    if (artifact?.status && artifact.status !== "active") continue;
    const relativePath = typeof artifact.relativePath === "string" ? artifact.relativePath : "";
    if (!relativePath) continue;
    const item = document.createElement("button");
    item.type = "button";
    item.className = "document-item artifact-item";
    const filePath = relativePath;
    const folder = dirname(filePath);
    const sourceLabel = artifact.inArtifactsRoot ? "artifacts" : (artifact.source || "indexed");
    item.innerHTML = `
      <span class="document-item-name">${artifact.name || basename(filePath)}</span>
      <span class="artifact-meta">${sourceLabel} · ${folder}</span>
    `;
    item.addEventListener("click", () => {
      openFileFromTree({
        type: "file",
        path: filePath,
        name: artifact.name || basename(filePath),
        extension: artifact.extension || "",
      }).catch(handleError);
    });
    artifactList.appendChild(item);
  }
}

function renderDocumentsPanelState() {
  const inputsActive = documentsPanelTab === "inputs";
  documentsTabInputs.classList.toggle("active", inputsActive);
  documentsTabArtifacts.classList.toggle("active", !inputsActive);
  documentsInputsPanel.classList.toggle("hidden", !inputsActive);
  documentsArtifactsPanel.classList.toggle("hidden", inputsActive);
}

function setDocumentsPanelTab(tab) {
  documentsPanelTab = tab === "artifacts" ? "artifacts" : "inputs";
  renderDocumentList();
  if (documentsPanelTab === "artifacts" && currentWorkspace) {
    loadWorkspaceArtifacts({ reconcile: true }).catch(handleError);
  }
}

function getCurrentWorkspaceDocument() {
  if (!currentWorkspace) return null;
  const documents = currentWorkspace.documents ?? [];
  if (!documents.length) return null;
  const activeId = currentWorkspace.currentDocumentId;
  if (activeId) {
    const match = documents.find((doc) => doc.id === activeId);
    if (match) return match;
  }
  return documents[0] ?? null;
}

function openDeleteConfirmModal(options) {
  deleteConfirmAction = options ?? null;
  deleteConfirmTitle.textContent = options?.title ?? "Delete";
  deleteConfirmMessage.textContent = options?.message ?? "Choose how you want to proceed.";
  if (options?.softLabel && typeof options.onSoft === "function") {
    deleteConfirmSoftButton.classList.remove("hidden");
    deleteConfirmSoftButton.textContent = options.softLabel;
  } else {
    deleteConfirmSoftButton.classList.add("hidden");
  }
  deleteConfirmHardButton.textContent = options?.hardLabel ?? "Delete Permanently";
  deleteConfirmModal.classList.remove("hidden");
}

function closeDeleteConfirmModal() {
  deleteConfirmModal.classList.add("hidden");
  deleteConfirmAction = null;
}

async function runDeleteAction(mode) {
  const action = deleteConfirmAction;
  const handler = mode === "soft" ? action?.onSoft : action?.onHard;
  if (typeof handler !== "function") return;
  try {
    await handler();
    closeDeleteConfirmModal();
  } catch (error) {
    handleError(error);
  }
}

async function deleteDocument(doc, mode) {
  if (!currentWorkspace || !doc?.id) return;
  await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/documents/${encodeURIComponent(doc.id)}?mode=${encodeURIComponent(mode)}`, {
    method: "DELETE",
  });
  if (mode === "soft") {
    updateStatus(`Moved document to trash: ${doc.name}`);
  } else {
    updateStatus(`Deleted document permanently: ${doc.name}`);
  }
  openTabs = openTabs.filter((tab) => tab.docId !== doc.id);
  if (activeTabId && !openTabs.some((tab) => tab.id === activeTabId)) {
    activeTabId = openTabs[0]?.id ?? null;
    if (activeTabId) {
      activateTab(activeTabId);
    } else {
      showPlaceholder();
    }
  }
  await refreshWorkspaceList();
  await loadWorkspaceFiles();
  await loadWorkspaceArtifacts({ reconcile: true });
  await loadWorkspaceJobs();
}

function promptDeleteDocument(doc) {
  if (!doc) return;
  openDeleteConfirmModal({
    title: "Delete Document",
    message: `Choose delete mode for "${doc.name}". Move to Trash keeps it restorable. Permanent delete cannot be undone.`,
    softLabel: "Move to Trash",
    hardLabel: "Delete Permanently",
    onSoft: () => deleteDocument(doc, "soft"),
    onHard: () => deleteDocument(doc, "hard"),
  });
}

function promptDeleteCurrentDocument() {
  promptDeleteDocument(getCurrentWorkspaceDocument());
}

async function deleteCurrentWorkspace(mode) {
  if (!currentWorkspace) return;
  const workspaceName = currentWorkspace.name;
  await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}?mode=${encodeURIComponent(mode)}`, { method: "DELETE" });
  if (mode === "soft") {
    updateStatus(`Moved workspace to trash: ${workspaceName}`);
  } else {
    updateStatus(`Deleted workspace permanently: ${workspaceName}`);
  }
  currentWorkspace = null;
  openTabs = [];
  activeTabId = null;
  lastRenderedTabIds = "";
  renderTabs();
  showPlaceholder();
  await refreshWorkspaceList();
  await loadWorkspaceFiles();
  await loadWorkspaceArtifacts({ reconcile: true });
  renderJobs([]);
  clearChatSessionState("Open a workspace to start");
}

function promptDeleteCurrentWorkspace() {
  if (!currentWorkspace) return;
  const workspaceName = currentWorkspace.name;
  openDeleteConfirmModal({
    title: "Delete Workspace",
    message: `Choose delete mode for workspace "${workspaceName}". Move to Trash keeps it restorable. Permanent delete cannot be undone.`,
    softLabel: "Move to Trash",
    hardLabel: "Delete Permanently",
    onSoft: () => deleteCurrentWorkspace("soft"),
    onHard: () => deleteCurrentWorkspace("hard"),
  });
}

async function setCurrentAndOpenDocument(doc) {
  if (!currentWorkspace) return;
  
  currentWorkspace.currentDocumentId = doc.id;
  renderDocumentList();
  openDocument(doc);
  saveSessionStateDebounced();
  
  apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/current-document`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ documentId: doc.id }),
  }).catch((err) => console.warn("Background current-document update failed:", err));
}

function getRunningJob() {
  return workspaceJobs.find((job) => job.status === "running") ?? null;
}

function getPendingJobs() {
  return workspaceJobs.filter((job) => job.status === "pending");
}

function getLatestJobForDocument(documentId) {
  return workspaceJobs.find((job) => job.documentId === documentId) ?? null;
}

function openConversionModalForDocument(doc) {
  conversionTargetDocument = doc;
  conversionModalDocName.textContent = doc?.name ? `Document: ${doc.name}` : "Document";
  conversionModeSelect.value = doc?.mdPath ? "overwrite" : "default";
  conversionPageRangeInput.value = "";
  conversionStartNowCheckbox.checked = true;
  applyDefaultConversionAdvancedOptions();
  conversionAdvancedFields.classList.add("hidden");
  toggleConversionAdvancedButton.textContent = "Advanced options";
  conversionModal.classList.remove("hidden");
}

function closeConversionModal() {
  conversionModal.classList.add("hidden");
  conversionTargetDocument = null;
}

function applyDefaultConversionAdvancedOptions() {
  convUseLlmCheckbox.checked = DEFAULT_MARKER_OPTIONS.use_llm;
  convLlmServiceInput.value = DEFAULT_MARKER_OPTIONS.llm_service;
  convGeminiModelInput.value = DEFAULT_MARKER_OPTIONS.gemini_model_name;
  convPaginateOutputCheckbox.checked = DEFAULT_MARKER_OPTIONS.paginate_output;
  convLowresImageDpiInput.value = String(DEFAULT_MARKER_OPTIONS.lowres_image_dpi);
  convExtractImagesCheckbox.checked = DEFAULT_MARKER_OPTIONS.extract_images;
  convDisableImageExtractionCheckbox.checked = DEFAULT_MARKER_OPTIONS.disable_image_extraction;
  convForceOcrCheckbox.checked = DEFAULT_MARKER_OPTIONS.force_ocr;
  convStripExistingOcrCheckbox.checked = DEFAULT_MARKER_OPTIONS.strip_existing_ocr;
  convDisableOcrCheckbox.checked = DEFAULT_MARKER_OPTIONS.disable_ocr;
  convHtmlTablesCheckbox.checked = DEFAULT_MARKER_OPTIONS.html_tables_in_markdown;
  convKeepPageHeaderCheckbox.checked = DEFAULT_MARKER_OPTIONS.keep_pageheader_in_output;
  convKeepPageFooterCheckbox.checked = DEFAULT_MARKER_OPTIONS.keep_pagefooter_in_output;
  convAddBlockIdsCheckbox.checked = DEFAULT_MARKER_OPTIONS.add_block_ids;
  convKatexCompatibleCheckbox.checked = DEFAULT_MARKER_OPTIONS.katex_compatible;
  convNormalizeEquationTagsCheckbox.checked = DEFAULT_MARKER_OPTIONS.normalize_equation_tags;
  convRedoInlineMathCheckbox.checked = DEFAULT_MARKER_OPTIONS.redo_inline_math;
  convDebugCheckbox.checked = DEFAULT_MARKER_OPTIONS.debug;
}

function collectConversionAdvancedOptions() {
  return {
    output_format: "markdown",
    use_llm: Boolean(convUseLlmCheckbox.checked),
    llm_service: convLlmServiceInput.value.trim() || DEFAULT_MARKER_OPTIONS.llm_service,
    gemini_model_name: convGeminiModelInput.value.trim() || DEFAULT_MARKER_OPTIONS.gemini_model_name,
    paginate_output: Boolean(convPaginateOutputCheckbox.checked),
    lowres_image_dpi: Number.parseInt(convLowresImageDpiInput.value, 10) || DEFAULT_MARKER_OPTIONS.lowres_image_dpi,
    extract_images: Boolean(convExtractImagesCheckbox.checked),
    disable_image_extraction: Boolean(convDisableImageExtractionCheckbox.checked),
    force_ocr: Boolean(convForceOcrCheckbox.checked),
    strip_existing_ocr: Boolean(convStripExistingOcrCheckbox.checked),
    disable_ocr: Boolean(convDisableOcrCheckbox.checked),
    html_tables_in_markdown: Boolean(convHtmlTablesCheckbox.checked),
    keep_pageheader_in_output: Boolean(convKeepPageHeaderCheckbox.checked),
    keep_pagefooter_in_output: Boolean(convKeepPageFooterCheckbox.checked),
    add_block_ids: Boolean(convAddBlockIdsCheckbox.checked),
    katex_compatible: Boolean(convKatexCompatibleCheckbox.checked),
    normalize_equation_tags: Boolean(convNormalizeEquationTagsCheckbox.checked),
    redo_inline_math: Boolean(convRedoInlineMathCheckbox.checked),
    debug: Boolean(convDebugCheckbox.checked),
  };
}

async function createConversionJobFromModal() {
  if (!currentWorkspace || !conversionTargetDocument) {
    throw new Error("Select a PDF document first.");
  }
  const docName = conversionTargetDocument.name;
  const payload = {
    preset: "default_native_pdf",
    mode: conversionModeSelect.value,
    testPageRange: conversionPageRangeInput.value.trim() || null,
    startNow: Boolean(conversionStartNowCheckbox.checked),
    options: collectConversionAdvancedOptions(),
  };
  const response = await apiRequest(
    `/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/documents/${encodeURIComponent(conversionTargetDocument.id)}/conversions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  closeConversionModal();
  await loadWorkspaceJobs();
  startJobsPolling();
  updateStatus(`Created conversion job for ${docName}`);
  return response;
}

async function startQueuedJob(jobId) {
  if (!currentWorkspace) return;
  await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/jobs/${encodeURIComponent(jobId)}/start`, {
    method: "POST",
  });
  await loadWorkspaceJobs();
  startJobsPolling();
}

async function cancelQueuedJob(jobId) {
  if (!currentWorkspace) return;
  await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
  });
  await loadWorkspaceJobs();
}

async function retryDocumentConversion(documentId, displayName = "document") {
  if (!currentWorkspace) {
    throw new Error("Open a workspace first.");
  }
  const detail = await apiRequest(
    `/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/documents/${encodeURIComponent(documentId)}`,
  );
  openConversionModalForDocument({
    id: documentId,
    name: detail?.name ?? displayName,
    mdPath: detail?.mdPath ?? null,
  });
}

function formatPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function formatJobMeta(job) {
  const chunks = [];
  const progress = formatPercent(job?.progress);
  const taskProgress = formatPercent(job?.taskProgress);
  if (progress !== null) {
    chunks.push(`${progress}%`);
  }
  if (typeof job?.task === "string" && job.task.trim()) {
    if (taskProgress !== null) {
      chunks.push(`${job.task.trim()} ${taskProgress}%`);
    } else {
      chunks.push(job.task.trim());
    }
  }
  const pipelineIndex = Number(job?.pipelineIndex);
  const pipelineTotal = Number(job?.pipelineTotal);
  if (Number.isFinite(pipelineIndex) && Number.isFinite(pipelineTotal) && pipelineTotal > 0) {
    chunks.push(`step ${pipelineIndex}/${pipelineTotal}`);
  }
  const elapsedSec = Number(job?.elapsedSec);
  if (Number.isFinite(elapsedSec) && elapsedSec >= 0) {
    chunks.push(`${Math.round(elapsedSec)}s`);
  }
  return chunks.join(" · ");
}

function compactJobText(value, maxLen = 72) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}

function summarizeJobMessage(job) {
  const raw = job?.errorMessage || job?.message || "";
  const lower = raw.toLowerCase();
  if (lower.includes("marker server") && (lower.includes("failed") || lower.includes("fetch") || lower.includes("status"))) {
    return "Marker server unreachable. Check URL/server.";
  }
  if (lower.includes("fetch failed")) {
    return "Network error while contacting Marker server.";
  }
  return compactJobText(raw, 88);
}

function openJobDetailsModal(job) {
  if (!job) return;
  const details = {
    id: job.id,
    documentId: job.documentId,
    status: job.status,
    mode: job.mode,
    preset: job.preset,
    progress: job.progress,
    task: job.task,
    taskProgress: job.taskProgress,
    pipelineIndex: job.pipelineIndex,
    pipelineTotal: job.pipelineTotal,
    elapsedSec: job.elapsedSec,
    message: job.message,
    errorMessage: job.errorMessage,
    testPageRange: job.testPageRange,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    markerJobId: job.markerJobId,
    markerOptions: job.markerOptions ?? null,
  };
  jobDetailsBody.innerHTML = `<pre class="job-detail-json">${JSON.stringify(details, null, 2)}</pre>`;
  jobDetailsModal.classList.remove("hidden");
}

function closeJobDetailsModal() {
  jobDetailsModal.classList.add("hidden");
}

async function openTrashModal() {
  await renderTrashModal();
  trashModal.classList.remove("hidden");
}

function closeTrashModal() {
  trashModal.classList.add("hidden");
}

async function renderTrashModal() {
  const [workspaceTrashPayload, documentTrashPayload] = await Promise.all([
    apiRequest("/api/trash/workspaces").catch(() => ({ workspaces: [] })),
    currentWorkspace
      ? apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/trash/documents`).catch(() => ({ documents: [] }))
      : Promise.resolve({ documents: [] }),
  ]);
  const workspaceItems = Array.isArray(workspaceTrashPayload.workspaces) ? workspaceTrashPayload.workspaces : [];
  const documentItems = Array.isArray(documentTrashPayload.documents) ? documentTrashPayload.documents : [];

  workspaceTrashList.innerHTML = "";
  if (workspaceItems.length === 0) {
    workspaceTrashList.innerHTML = `<p class="empty-hint">No deleted workspaces.</p>`;
  } else {
    for (const item of workspaceItems) {
      const row = document.createElement("article");
      row.className = "chat-list-item";
      row.innerHTML = `
        <div class="chat-list-title">${item.workspaceId}</div>
        <div class="chat-list-meta">Deleted ${new Date(item.deletedAt).toLocaleString()}</div>
      `;
      const actions = document.createElement("div");
      actions.className = "job-item-actions";
      const restoreBtn = document.createElement("button");
      restoreBtn.type = "button";
      restoreBtn.className = "btn btn-primary btn-sm";
      restoreBtn.textContent = "Restore";
      restoreBtn.addEventListener("click", async () => {
        await apiRequest(`/api/trash/workspaces/${encodeURIComponent(item.id)}/restore`, { method: "POST" });
        await refreshWorkspaceList();
        await renderTrashModal();
      });
      const purgeBtn = document.createElement("button");
      purgeBtn.type = "button";
      purgeBtn.className = "btn btn-ghost btn-sm";
      purgeBtn.textContent = "Delete Permanently";
      purgeBtn.addEventListener("click", async () => {
        openDeleteConfirmModal({
          title: "Permanently Delete Workspace",
          message: `Delete "${item.workspaceId}" from trash permanently? This cannot be undone.`,
          hardLabel: "Delete Permanently",
          onHard: async () => {
            await apiRequest(`/api/trash/workspaces/${encodeURIComponent(item.id)}`, { method: "DELETE" });
            await renderTrashModal();
          },
        });
      });
      actions.appendChild(restoreBtn);
      actions.appendChild(purgeBtn);
      row.appendChild(actions);
      workspaceTrashList.appendChild(row);
    }
  }

  documentTrashList.innerHTML = "";
  if (documentItems.length === 0) {
    documentTrashList.innerHTML = `<p class="empty-hint">${currentWorkspace ? "No deleted documents." : "Open a workspace to view document trash."}</p>`;
  } else {
    for (const item of documentItems) {
      const row = document.createElement("article");
      row.className = "chat-list-item";
      row.innerHTML = `
        <div class="chat-list-title">${item.name}</div>
        <div class="chat-list-meta">Deleted ${new Date(item.deletedAt).toLocaleString()}</div>
      `;
      const actions = document.createElement("div");
      actions.className = "job-item-actions";
      const restoreBtn = document.createElement("button");
      restoreBtn.type = "button";
      restoreBtn.className = "btn btn-primary btn-sm";
      restoreBtn.textContent = "Restore";
      restoreBtn.addEventListener("click", async () => {
        if (!currentWorkspace) return;
        await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/trash/documents/${encodeURIComponent(item.id)}/restore`, {
          method: "POST",
        });
        await refreshWorkspaceList();
        await loadWorkspaceFiles();
        await renderTrashModal();
      });
      const purgeBtn = document.createElement("button");
      purgeBtn.type = "button";
      purgeBtn.className = "btn btn-ghost btn-sm";
      purgeBtn.textContent = "Delete Permanently";
      purgeBtn.addEventListener("click", async () => {
        if (!currentWorkspace) return;
        openDeleteConfirmModal({
          title: "Permanently Delete Document",
          message: `Delete "${item.name}" from trash permanently? This cannot be undone.`,
          hardLabel: "Delete Permanently",
          onHard: async () => {
            await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/trash/documents/${encodeURIComponent(item.id)}`, {
              method: "DELETE",
            });
            await renderTrashModal();
          },
        });
      });
      actions.appendChild(restoreBtn);
      actions.appendChild(purgeBtn);
      row.appendChild(actions);
      documentTrashList.appendChild(row);
    }
  }
}

function renderJobs(jobs) {
  workspaceJobs = Array.isArray(jobs) ? jobs : [];
  jobsList.innerHTML = "";
  
  const running = getRunningJob();
  const pending = getPendingJobs();
  const hasActivity = running || pending.length > 0;
  
  if (!hasActivity) {
    jobsSection.classList.add("hidden");
    pendingJobsButton.classList.add("hidden");
    return;
  }
  
  jobsSection.classList.remove("hidden");
  
  if (pending.length > 0) {
    pendingJobsButton.classList.remove("hidden");
    pendingJobsLabel.textContent = `${pending.length} pending`;
  } else {
    pendingJobsButton.classList.add("hidden");
  }

  const primary = running ?? pending[0];
  const strip = document.createElement("button");
  strip.type = "button";
  strip.className = `job-strip${jobsPollFailureCount > 0 ? " error" : ""}`;
  const label = running ? "Converting" : "Pending";
  const progressPct = formatPercent(primary.progress);
  const topMeta = running && progressPct !== null ? `${progressPct}%` : "";
  const statusText = jobsPollFailureCount > 0
    ? "Server may be down"
    : summarizeJobMessage(primary) || primary.documentId;
  strip.innerHTML = `
    <div class="job-strip-line">
      <span class="job-strip-title">${label}: ${statusText}</span>
      ${topMeta ? `<span>${topMeta}</span>` : ""}
    </div>
    ${running && progressPct !== null ? `<progress class="job-progress" max="100" value="${progressPct}"></progress>` : ""}
  `;
  strip.addEventListener("click", () => openJobDetailsModal(primary));
  jobsList.appendChild(strip);

  const actions = document.createElement("div");
  actions.className = "job-item-actions";
  if (running) {
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn-ghost btn-sm";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => cancelQueuedJob(primary.id).catch(handleError));
    actions.appendChild(cancelBtn);
  } else if (pending.length > 0) {
    const startBtn = document.createElement("button");
    startBtn.type = "button";
    startBtn.className = "btn btn-primary btn-sm";
    startBtn.textContent = "Start";
    startBtn.addEventListener("click", () => startQueuedJob(primary.id).catch(handleError));
    actions.appendChild(startBtn);
  }
  if (actions.children.length > 0) {
    jobsList.appendChild(actions);
  }
}

function renderPendingJobsModal() {
  const pending = getPendingJobs();
  pendingJobsList.innerHTML = "";
  if (pending.length === 0) {
    pendingJobsList.innerHTML = `<p class="empty-hint">No pending jobs.</p>`;
    return;
  }
  const hasRunning = Boolean(getRunningJob());
  for (const job of pending) {
    const entry = document.createElement("article");
    entry.className = "chat-list-item";
    entry.innerHTML = `
      <div class="chat-list-title">${job.documentId}</div>
      <div class="chat-list-meta">${job.message || "Pending"}</div>
      <div class="chat-list-meta">Mode: ${job.mode || "default"}${job.testPageRange ? ` · pages ${job.testPageRange}` : ""}</div>
    `;
    const actions = document.createElement("div");
    actions.className = "job-item-actions";
    const startBtn = document.createElement("button");
    startBtn.type = "button";
    startBtn.className = "btn btn-primary";
    startBtn.textContent = "Run";
    startBtn.disabled = hasRunning;
    startBtn.addEventListener("click", () => {
      startQueuedJob(job.id)
        .then(() => {
          renderPendingJobsModal();
        })
        .catch(handleError);
    });
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn-secondary";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => {
      cancelQueuedJob(job.id)
        .then(() => {
          renderPendingJobsModal();
        })
        .catch(handleError);
    });
    actions.appendChild(startBtn);
    actions.appendChild(cancelBtn);
    entry.appendChild(actions);
    pendingJobsList.appendChild(entry);
  }
}

function openPendingJobsModal() {
  renderPendingJobsModal();
  pendingJobsModal.classList.remove("hidden");
}

function closePendingJobsModal() {
  pendingJobsModal.classList.add("hidden");
}

async function loadWorkspaceJobs() {
  if (!currentWorkspace) {
    renderJobs([]);
    return [];
  }
  const payload = await apiRequest(`/api/workspaces/${encodeURIComponent(currentWorkspace.id)}/jobs`);
  jobsPollFailureCount = 0;
  const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
  renderJobs(jobs);
  if (jobs.some((job) => job.status === "running")) {
    startJobsPolling();
  }
  return jobs;
}

async function syncCurrentWorkspaceState({ includeWorkspaceList = false } = {}) {
  if (!currentWorkspace || workspaceSyncInFlight) return;
  const workspaceId = currentWorkspace.id;
  workspaceSyncInFlight = true;
  try {
    const [detailResult] = await Promise.allSettled([
      apiRequest(`/api/workspaces/${encodeURIComponent(workspaceId)}`),
      loadWorkspaceFiles(),
      loadWorkspaceJobs(),
      loadWorkspaceArtifacts({ reconcile: false }),
    ]);

    if (!currentWorkspace || currentWorkspace.id !== workspaceId) {
      return;
    }

    if (detailResult.status === "fulfilled" && detailResult.value) {
      currentWorkspace = detailResult.value;
      renderDocumentList();
      updateContextChips();
      const activeTabNeedsReload = syncOpenTabsWithWorkspaceDocuments();
      if (activeTabNeedsReload && activeTabId) {
        activateTab(activeTabId);
      }
    } else if (detailResult.status === "rejected") {
      const reasonText = detailResult.reason instanceof Error
        ? detailResult.reason.message
        : String(detailResult.reason ?? "");
      if (reasonText.includes("404") || reasonText.toLowerCase().includes("not found")) {
        await refreshWorkspaceList();
      }
    }

    if (includeWorkspaceList) {
      await refreshWorkspaceList();
    }
  } finally {
    workspaceSyncInFlight = false;
  }
}

function triggerWorkspaceSync(includeWorkspaceList = false) {
  if (!currentWorkspace) return;
  syncCurrentWorkspaceState({ includeWorkspaceList }).catch((error) => {
    console.warn("Workspace sync failed:", error);
  });
}

function startWorkspaceAutoSync() {
  if (workspaceSyncTimer) return;
  workspaceSyncTimer = window.setInterval(() => {
    if (document.hidden || !currentWorkspace) return;
    workspaceSyncTick += 1;
    const includeWorkspaceList = workspaceSyncTick % WORKSPACE_LIST_SYNC_EVERY_TICKS === 0;
    triggerWorkspaceSync(includeWorkspaceList);
  }, WORKSPACE_SYNC_INTERVAL_MS);
}

function startJobsPolling() {
  if (jobsPollTimer) return;
  jobsPollTimer = window.setInterval(async () => {
    try {
      const jobs = await loadWorkspaceJobs();
      if (jobs.every((job) => job.status !== "running")) {
        window.clearInterval(jobsPollTimer);
        jobsPollTimer = null;
        await syncCurrentWorkspaceState({ includeWorkspaceList: true });
      }
    } catch (error) {
      jobsPollFailureCount += 1;
      if (jobsPollFailureCount >= 2) {
        updateStatus("Cannot refresh job status. Marker/web server may be down.", "error");
        renderJobs(workspaceJobs);
      }
      console.warn("Job polling failed:", error);
    }
  }, 2000);
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
  container.style.paddingLeft = `${Math.min(depth * 8, 56)}px`;

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
  const isPdf = node.name.toLowerCase().endsWith(".pdf");
  const tab = {
    id: tabId,
    docId: null,
    name: node.name,
    path: `${currentWorkspace.path}/${node.path}`,
    mdPath: isPdf ? null : `${currentWorkspace.path}/${node.path}`,
    pdfPath: isPdf ? `${currentWorkspace.path}/${node.path}` : null,
    viewType: isPdf ? "pdf" : "markdown",
    content: null,
    renderedHtml: null,
    windowHtml: null,
    chunkState: null,
    renderToken: 0,
    loadFailed: false,
    isExternal: true,
    scrollTop: 0,
    pdfPage: 1,
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
      showMarkdownContent(tab.content, tab.path, tab);
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
    loadWorkspaceArtifacts({ reconcile: true });
    await loadWorkspaceJobs();
    
    const newDoc = currentWorkspace.documents?.find(d => d.sourcePath === tab.path || d.name === tab.name);
    if (newDoc) {
      tab.docId = newDoc.id;
      tab.isExternal = false;
      renderTabs();
      if (newDoc.pdfPath && !newDoc.mdPath) {
        openConversionModalForDocument(newDoc);
      }
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

  const preferredWorkspaceId = currentWorkspace?.id || serverCurrentWorkspaceId || "";
  if (preferredWorkspaceId) {
    const stillExists = workspaces.find((ws) => ws.id === preferredWorkspaceId);
    if (stillExists) {
      try {
        currentWorkspace = await apiRequest(`/api/workspaces/${encodeURIComponent(preferredWorkspaceId)}`);
      } catch (error) {
        console.warn("Failed to refresh full workspace details:", error);
        if (currentWorkspace?.id !== preferredWorkspaceId) {
          currentWorkspace = null;
        }
      }
    } else if (currentWorkspace?.id === preferredWorkspaceId) {
      currentWorkspace = null;
    }
  } else {
    currentWorkspace = null;
  }

  if (!currentWorkspace) {
    workspaceArtifacts = [];
    clearChatSessionState("Open a workspace to start");
  }
  
  renderWorkspaceOptions();
  renderDocumentList();
  const activeTabNeedsReload = syncOpenTabsWithWorkspaceDocuments();
  renderFileTree();
  updateContextChips();
  if (activeTabNeedsReload && activeTabId) {
    activateTab(activeTabId);
  }
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
  
  openTabs = [];
  activeTabId = null;
  lastRenderedTabIds = "";
  renderTabs();
  showPlaceholder();
  
  closeCreateWorkspaceModalFn();
  updateStatus(`Created workspace: ${workspace.name}`);
  
  await Promise.all([
    refreshWorkspaceList(),
    loadWorkspaceFiles(),
    loadWorkspaceArtifacts({ reconcile: true }),
    loadWorkspaceJobs(),
    loadBootstrapState(),
    loadConversationSummaries(),
  ]);
  
  hydrateWorkspaceSessionState(bootstrapPayload?.workspaceSession, bootstrapPayload?.activeConversation);
  
  if (activeConversationId) {
    loadConversationById(activeConversationId).catch(handleError);
  }
  
  refreshChatSession().catch(handleError);
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
  
  if (previousWorkspaceId !== currentWorkspace.id) {
    openTabs = [];
    activeTabId = null;
    lastRenderedTabIds = "";
    renderTabs();
    showPlaceholder();
  }
  
  renderDocumentList();
  updateContextChips();
  updateStatus(`Opened workspace: ${currentWorkspace.name}`);
  
  if (!activeTabId && currentWorkspace.currentDocumentId && currentWorkspace.documents) {
    const doc = currentWorkspace.documents.find(d => d.id === currentWorkspace.currentDocumentId);
    if (doc) {
      openDocument(doc);
    }
  }
  
  const startupLoads = await Promise.allSettled([
    loadBootstrapState(),
    loadWorkspaceFiles(),
    loadWorkspaceArtifacts({ reconcile: true }),
    loadWorkspaceJobs(),
    loadConversationSummaries(),
  ]);
  const bootstrapResult = startupLoads[0]?.status === "fulfilled" ? startupLoads[0].value : null;
  const failedLoadCount = startupLoads.filter((result) => result.status === "rejected").length;
  if (failedLoadCount > 0) {
    console.warn("Workspace opened with partial data due to load failures.", startupLoads);
    updateStatus("Workspace opened with partial data. Some panels may refresh shortly.", "error");
  }
  
  const shouldHydratePersistedState = bootstrapPayload?.merged?.workspaceId === currentWorkspace.id;
  if (shouldHydratePersistedState) {
    hydrateWorkspaceSessionState(bootstrapPayload.workspaceSession, bootstrapPayload?.activeConversation);
  }
  
  const shouldRefreshSession = previousWorkspaceId !== currentWorkspace.id || !sessionId;
  if (shouldRefreshSession) {
    refreshChatSession().catch(handleError);
  }
  
  if (activeConversationId) {
    loadConversationById(activeConversationId).catch(handleError);
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
  saveLastImportPath(dirname(absolutePath));
  await refreshWorkspaceList();
  await loadWorkspaceArtifacts({ reconcile: true });
  await loadWorkspaceJobs();
  updateStatus(`Added document: ${basename(absolutePath)}`);
  
  const newDoc = currentWorkspace.documents.find(d => d.sourcePath === absolutePath || d.mdPath?.endsWith(basename(absolutePath)));
  if (newDoc) {
    openDocument(newDoc);
    if (newDoc.pdfPath && !newDoc.mdPath) {
      openConversionModalForDocument(newDoc);
    }
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
      } else if (!pendingJobsModal.classList.contains("hidden")) {
        closePendingJobsModal();
      } else if (!conversionModal.classList.contains("hidden")) {
        closeConversionModal();
      } else if (!jobDetailsModal.classList.contains("hidden")) {
        closeJobDetailsModal();
      } else if (!folderModal.classList.contains("hidden")) {
        closeFolderModal();
      } else if (!settingsModal.classList.contains("hidden")) {
        closeSettingsModal();
      }
    }
  });
}

// Initialize
async function initializeApp() {
  try {
    await loadBootstrapState();
  } catch (error) {
    console.warn("Bootstrap preload failed; continuing app startup.", error);
  }
  await loadModelOptions();
  await loadWorkspaceRoot();
  const preferredRoot = bootstrapPayload?.global?.lastRoot;
  if (typeof preferredRoot === "string" && preferredRoot && preferredRoot !== workspaceRootInput.value.trim()) {
    workspaceRootInput.value = preferredRoot;
    await saveWorkspaceRoot();
  }
  await refreshWorkspaceList();
  startWorkspaceAutoSync();
  updateStatus("Ready");
  
  if (currentWorkspace?.id) {
    try {
      await openSelectedWorkspace();
    } catch (error) {
      console.warn("Initial workspace open failed, retrying once.", error);
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      await refreshWorkspaceList();
      if (currentWorkspace?.id) {
        await openSelectedWorkspace();
      }
    }
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
    if (currentWorkspace) {
      await Promise.allSettled([
        loadWorkspaceFiles(),
        loadWorkspaceArtifacts({ reconcile: true }),
      ]);
    }
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
deleteWorkspaceButton.addEventListener("click", promptDeleteCurrentWorkspace);
openTrashButton.addEventListener("click", () => openTrashModal().catch(handleError));
openDocumentTrashButton.addEventListener("click", () => openTrashModal().catch(handleError));
deleteDocumentButton.addEventListener("click", promptDeleteCurrentDocument);
documentsTabInputs.addEventListener("click", () => setDocumentsPanelTab("inputs"));
documentsTabArtifacts.addEventListener("click", () => setDocumentsPanelTab("artifacts"));

toggleSetupSection.addEventListener("click", () => {
  const expanded = toggleSetupSection.getAttribute("aria-expanded") === "true";
  toggleSetupSection.setAttribute("aria-expanded", !expanded);
  setupContent.classList.toggle("collapsed", expanded);
});
openWorkspaceButton.addEventListener("click", () => openSelectedWorkspace().catch(handleError));
workspaceSelect.addEventListener("change", () => {
  if (workspaceSelect.value) {
    openSelectedWorkspace().catch(handleError);
  }
});
addDocumentButton.addEventListener("click", () => {
  ensureWorkspaceRootApplied()
    .then(() => {
      const lastImportPath = readLastImportPath();
      const startPath = lastImportPath || (currentWorkspace ? currentWorkspace.path : workspaceRootInput.value);
      openModal("pick-document-file", "Add Document", startPath);
    })
    .catch(handleError);
});
openSettingsButton.addEventListener("click", openSettingsModal);
pendingJobsButton.addEventListener("click", () => {
  openPendingJobsModal();
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
closeSettingsModalButton.addEventListener("click", closeSettingsModal);
cancelSettingsButton.addEventListener("click", closeSettingsModal);
saveSettingsButton.addEventListener("click", () => saveConversionSettings().catch(handleError));
settingsModal.addEventListener("click", (event) => {
  if (event.target === settingsModal) closeSettingsModal();
});
closeConversionModalButton.addEventListener("click", closeConversionModal);
cancelConversionModalButton.addEventListener("click", closeConversionModal);
confirmConversionModalButton.addEventListener("click", () => createConversionJobFromModal().catch(handleError));
toggleConversionAdvancedButton.addEventListener("click", () => {
  conversionAdvancedFields.classList.toggle("hidden");
  const expanded = !conversionAdvancedFields.classList.contains("hidden");
  toggleConversionAdvancedButton.textContent = expanded ? "Hide advanced options" : "Advanced options";
});
conversionModal.addEventListener("click", (event) => {
  if (event.target === conversionModal) closeConversionModal();
});
closePendingJobsModalButton.addEventListener("click", closePendingJobsModal);
closePendingJobsFooterButton.addEventListener("click", closePendingJobsModal);
pendingJobsModal.addEventListener("click", (event) => {
  if (event.target === pendingJobsModal) closePendingJobsModal();
});
closeJobDetailsModalButton.addEventListener("click", closeJobDetailsModal);
closeJobDetailsFooterButton.addEventListener("click", closeJobDetailsModal);
jobDetailsModal.addEventListener("click", (event) => {
  if (event.target === jobDetailsModal) closeJobDetailsModal();
});
closeTrashModalButton.addEventListener("click", closeTrashModal);
closeTrashModalFooterButton.addEventListener("click", closeTrashModal);
trashModal.addEventListener("click", (event) => {
  if (event.target === trashModal) closeTrashModal();
});
closeDeleteConfirmModalButton.addEventListener("click", closeDeleteConfirmModal);
deleteConfirmCancelButton.addEventListener("click", closeDeleteConfirmModal);
deleteConfirmSoftButton.addEventListener("click", () => runDeleteAction("soft"));
deleteConfirmHardButton.addEventListener("click", () => runDeleteAction("hard"));
deleteConfirmModal.addEventListener("click", (event) => {
  if (event.target === deleteConfirmModal) closeDeleteConfirmModal();
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
  if (activeTab?.renderedHtml) {
    showCachedHtml(activeTab.renderedHtml, activeTab.scrollTop, activeTab.path);
  } else if (activeTab?.windowHtml) {
    showCachedHtml(activeTab.windowHtml, activeTab.scrollTop, activeTab.path);
    if (activeTab.content) {
      const state = ensureChunkState(activeTab);
      const centerIdx = estimateChunkIndexForTab(activeTab, state);
      startBackgroundRender(activeTab, activeTab.path, centerIdx);
    }
  } else if (activeTab?.content) {
    showMarkdownContent(activeTab.content, activeTab.path, activeTab);
  } else if (activeTab?.docId) {
    loadTabContent(activeTab).catch(handleError);
  }
});

pdfViewButton.addEventListener("click", () => {
  const activeTab = openTabs.find(t => t.id === activeTabId);
  if (activeTab?.pdfPath) {
    showPdfContent(activeTab.pdfPath, activeTab.pdfPage);
  } else {
    updateStatus("PDF is not available for this tab.", "error");
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

// Scroll tracking for markdown viewer
const trackScrollDebounced = debounce(() => {
  const activeTab = openTabs.find(t => t.id === activeTabId);
  if (activeTab && activeTab.viewType !== "pdf") {
    activeTab.scrollTop = markdownViewer.scrollTop ?? 0;
    saveSessionStateDebounced();
  }
}, 200);

markdownViewer.addEventListener("scroll", trackScrollDebounced);
window.addEventListener("focus", () => {
  workspaceSyncTick = 0;
  triggerWorkspaceSync(false);
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    workspaceSyncTick = 0;
    triggerWorkspaceSync(false);
  }
});

// Initialize
attachResizeBehavior();
attachKeyboardShortcuts();
initializeChat();
initializeApp().catch(handleError);
