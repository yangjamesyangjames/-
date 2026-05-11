const STORAGE_KEY = "design-review-assistant-v1";

const state = {
  rules: [],
  history: [],
  draftImages: [],
  ruleImages: [],
};

const views = {
  reviewView: "设计稿审核",
  knowledgeView: "知识库",
  historyView: "审核历史",
  settingsView: "数据管理",
};

function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const sampleRules = [
  {
    id: createId(),
    leader: "市场 VP",
    content: "活动类设计稿第一屏要先看到用户利益点，标题、价格、行动按钮之间需要有明确层级，不能让装饰元素抢走注意力。",
    images: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: createId(),
    leader: "品牌总监",
    content: "品牌资产需要在视觉中心区域形成记忆点，Logo、品牌色和核心产品图至少有两个元素被明确识别。",
    images: [],
    createdAt: new Date().toISOString(),
  },
  {
    id: createId(),
    leader: "法务与客户方",
    content: "绝对化表达、功效承诺、价格对比和数据结论都要有依据。没有证明材料时应改成更稳妥的描述。",
    images: [],
    createdAt: new Date().toISOString(),
  },
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function saveState() {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ rules: state.rules, history: state.history }),
    );
  } catch {
    // Some in-app browsers restrict localStorage on file:// pages. Keep the UI usable.
  }
}

function loadState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    state.rules = Array.isArray(saved.rules) ? saved.rules : [];
    state.history = Array.isArray(saved.history) ? saved.history : [];
  } catch {
    state.rules = [];
    state.history = [];
  }
}

function switchView(viewId) {
  $$(".view").forEach((view) => view.classList.toggle("is-visible", view.id === viewId));
  $$(".nav-item").forEach((item) => item.classList.toggle("is-active", item.dataset.view === viewId));
  $("#pageTitle").textContent = views[viewId];
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function readImages(fileList) {
  const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
  return Promise.all(files.map(fileToDataUrl));
}

function renderImages(container, images) {
  container.innerHTML = "";
  images.forEach((src) => {
    const node = $("#imageTemplate").content.cloneNode(true);
    node.querySelector("img").src = src;
    container.appendChild(node);
  });
}

function getRuleLeader(rule) {
  return rule.leader || rule.source || "未填写领导";
}

function getRuleContent(rule) {
  return rule.content || rule.title || "";
}

function extractKeywords(content) {
  return tokenize(content).filter((token) => token.length > 1);
}

function tokenize(text) {
  return text
    .toLowerCase()
    .split(/[\s,，。！？!?:：;；、/\\|()[\]{}"'“”‘’.-]+/)
    .map((word) => word.trim())
    .filter(Boolean);
}

function calculateMatches({ projectName, brief }) {
  const text = `${projectName} ${brief}`.toLowerCase();
  const tokens = tokenize(text);

  return state.rules
    .map((rule) => {
      const ruleContent = getRuleContent(rule);
      const keywordHits = extractKeywords(ruleContent).filter((keyword) => text.includes(keyword.toLowerCase()));
      const contentTokens = tokenize(ruleContent);
      const semanticHits = contentTokens.filter((token) => tokens.includes(token));
      const score = keywordHits.length * 8 + semanticHits.length * 2;
      return { rule, keywordHits, semanticHits, score };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function buildReport(formData) {
  const matches = calculateMatches(formData);
  const penalty = matches.length * 16;
  const score = Math.max(35, Math.min(96, 92 - penalty + Math.min(matches.length * 3, 12)));
  const result = matches.length > 0 || score < 82 ? "adjust" : "pass";

  const findings = matches.length
    ? matches.map((item) => {
        const hitText = item.keywordHits.length ? `命中关键词：${item.keywordHits.join("、")}` : "根据项目描述匹配";
        return `【${getRuleLeader(item.rule)}】${hitText}。建议核对：${getRuleContent(item.rule)}`;
      })
    : [
        "没有明显命中历史意见。建议仍按品牌露出、信息层级、合规表述、交付尺寸四类做人工复核。",
      ];

  const suggestions = [
    "1. 先处理命中历史知识库的审核意见，后续可按领导或意见类型增加优先级。",
    "2. 对照参考知识逐条检查当前稿件，修改时保留前后对比图，方便后续继续沉淀。",
    "3. 如果本次审核发现新判断标准，把结论补充进知识库，下一次审核会自动复用。",
  ];

  return { matches, score, result, findings, suggestions: suggestions.join("\n") };
}

function renderReport(report) {
  $("#scoreText").textContent = `${report.score}%`;
  $("#scoreBar").value = report.score;
  const riskLevel = $("#riskLevel");
  riskLevel.className = `status-pill ${report.result}`;
  riskLevel.textContent = report.result === "pass" ? "通过" : "需调整";

  $("#priorityFindings").innerHTML = report.findings.map((finding) => `<li>${escapeHtml(finding)}</li>`).join("");
  $("#referenceList").innerHTML = report.matches.length
    ? report.matches
        .map(
          ({ rule }) => `
            <article class="reference-card">
              <h5>${escapeHtml(getRuleLeader(rule))}</h5>
              <div class="rule-meta">
                <span class="tag">领导姓名</span>
              </div>
              <p>${escapeHtml(getRuleContent(rule))}</p>
            </article>
          `,
        )
        .join("")
    : `<p class="empty">没有匹配到具体知识条目。</p>`;
  $("#suggestionBox").textContent = report.suggestions;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseBulkRule(row) {
  const separators = ["：", ":", "\t", "，", ","];
  for (const separator of separators) {
    const index = row.indexOf(separator);
    if (index > 0) {
      return {
        leader: row.slice(0, index).trim(),
        content: row.slice(index + separator.length).trim(),
      };
    }
  }
  return { leader: "未填写领导", content: row.trim() };
}

function renderRules() {
  $("#ruleList").innerHTML = state.rules.length
    ? state.rules.map(renderRuleCard).join("")
    : `<p class="empty">暂无知识条目。可以先载入示例或新增一条意见。</p>`;
}

function renderRuleCard(rule) {
  const images = (rule.images || [])
    .slice(0, 4)
    .map((src) => `<figure class="thumb"><img src="${src}" alt="参考图片" /></figure>`)
    .join("");

  return `
    <article class="rule-card">
      <h4>${escapeHtml(getRuleLeader(rule))}</h4>
      <div class="rule-meta">
        <span class="tag">领导姓名</span>
      </div>
      <p>${escapeHtml(getRuleContent(rule))}</p>
      <div class="image-strip">${images}</div>
      <footer>
        <span class="empty">${new Date(rule.createdAt).toLocaleString("zh-CN")}</span>
        <button class="danger-button" data-delete-rule="${rule.id}">删除</button>
      </footer>
    </article>
  `;
}

function renderHistory() {
  $("#historyList").innerHTML = state.history.length
    ? state.history
        .map(
          (item) => `
            <article class="history-card">
              <h4>${escapeHtml(item.projectName)}</h4>
              <div class="rule-meta">
                <span class="tag">${escapeHtml(item.result === "pass" ? "通过" : "需调整")}</span>
                <span class="tag">审核得分：${item.score}%</span>
                <span class="tag">匹配知识：${item.matchCount} 条</span>
              </div>
              <p>${escapeHtml(item.brief || "未填写项目说明")}</p>
              <footer>
                <span class="empty">${new Date(item.createdAt).toLocaleString("zh-CN")}</span>
              </footer>
            </article>
          `,
        )
        .join("")
    : `<p class="empty">还没有审核历史。</p>`;
}

function resetRuleForm() {
  $("#ruleForm").reset();
  state.ruleImages = [];
  renderImages($("#rulePreview"), state.ruleImages);
}

function refresh() {
  renderStats();
  renderRules();
  renderHistory();
}

function renderStats() {
  $("#ruleCount").textContent = state.rules.length;
  $("#reviewCount").textContent = state.history.length;
  $("#topRuleCount").textContent = state.rules.length;
  $("#topReviewCount").textContent = state.history.length;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function setCopyButtonText(text) {
  const button = $("#copySuggestionBtn");
  button.textContent = text;
  window.setTimeout(() => {
    button.textContent = "复制文案";
  }, 1400);
}

function bindEvents() {
  $$(".nav-item").forEach((item) => item.addEventListener("click", () => switchView(item.dataset.view)));
  $$("[data-view-target]").forEach((button) =>
    button.addEventListener("click", () => switchView(button.dataset.viewTarget)),
  );

  $("#draftImages").addEventListener("change", async (event) => {
    state.draftImages = await readImages(event.target.files);
    renderImages($("#draftPreview"), state.draftImages);
  });

  $("#ruleImages").addEventListener("change", async (event) => {
    state.ruleImages = await readImages(event.target.files);
    renderImages($("#rulePreview"), state.ruleImages);
  });

  $("#ruleForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const rule = {
      id: createId(),
      leader: $("#ruleLeader").value.trim(),
      content: $("#ruleContent").value.trim(),
      images: state.ruleImages,
      createdAt: new Date().toISOString(),
    };
    state.rules.unshift(rule);
    saveState();
    resetRuleForm();
    refresh();
  });

  $("#bulkImportBtn").addEventListener("click", () => {
    const rows = $("#bulkRules").value
      .split(/\n+/)
      .map((row) => row.trim())
      .filter(Boolean);
    const rules = rows
      .map(parseBulkRule)
      .filter((rule) => rule.leader && rule.content)
      .map((rule) => ({
        id: createId(),
        leader: rule.leader,
        content: rule.content,
        images: [],
        createdAt: new Date().toISOString(),
      }));

    if (!rules.length) {
      alert("没有识别到可保存的批量意见。请按“领导姓名：意见内容”的格式每行录入一条。");
      return;
    }

    state.rules = [...rules, ...state.rules];
    $("#bulkRules").value = "";
    saveState();
    refresh();
  });

  $("#reviewForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = {
      projectName: $("#projectName").value.trim(),
      brief: $("#brief").value.trim(),
    };
    const report = buildReport(formData);
    renderReport(report);
    state.history.unshift({
      ...formData,
      score: report.score,
      result: report.result,
      matchCount: report.matches.length,
      createdAt: new Date().toISOString(),
    });
    state.history = state.history.slice(0, 30);
    saveState();
    renderHistory();
  });

  $("#ruleList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-rule]");
    if (!button) return;
    state.rules = state.rules.filter((rule) => rule.id !== button.dataset.deleteRule);
    saveState();
    refresh();
  });

  $("#loadSampleBtn").addEventListener("click", () => {
    const existingContents = new Set(state.rules.map((rule) => getRuleContent(rule)));
    const nextRules = sampleRules.filter((rule) => !existingContents.has(rule.content));
    state.rules = [...nextRules, ...state.rules];
    saveState();
    refresh();
  });

  $("#clearHistoryBtn").addEventListener("click", () => {
    state.history = [];
    saveState();
    renderHistory();
  });

  $("#copySuggestionBtn").addEventListener("click", async () => {
    const text = $("#suggestionBox").textContent.trim();
    if (!text || text === "暂无报告。") {
      setCopyButtonText("暂无内容");
      return;
    }
    try {
      await copyText(text);
      setCopyButtonText("已复制");
    } catch {
      setCopyButtonText("复制失败");
    }
  });

  $("#exportBtn").addEventListener("click", () => {
    const content = JSON.stringify({ rules: state.rules, history: state.history }, null, 2);
    download(`设计稿审核知识库-${new Date().toISOString().slice(0, 10)}.json`, content, "application/json");
  });

  $("#importFile").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result);
        state.rules = Array.isArray(imported.rules) ? imported.rules : [];
        state.history = Array.isArray(imported.history) ? imported.history : [];
        saveState();
        refresh();
      } catch {
        alert("导入失败：文件不是有效的 JSON。");
      }
    };
    reader.readAsText(file);
  });
}

bindEvents();
loadState();
refresh();
