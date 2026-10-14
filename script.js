
"use strict";

// Tanvir Kapre — Certificate Portfolio
// Files are stored in this browser using IndexedDB.
// No external library or backend is required.

const DB_NAME = "TanvirCertificatePortfolio";
const DB_VERSION = 1;
const STORE_NAME = "items";
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_BACKUP_SIZE = 100 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
];

const ALLOWED_CATEGORIES = [
  "Programming",
  "AI/ML",
  "Cloud",
  "Electronics",
  "Professional Development",
  "Other"
];

const $ = (selector) => document.querySelector(selector);

const certificateForm = $("#certificateForm");
const certificateMessage = $("#certificateMessage");
const certificateGrid = $("#certificateGrid");
const certificateCount = $("#certificateCount");
const searchInput = $("#searchInput");
const categoryFilter = $("#categoryFilter");
const emptyState = $("#emptyState");

const resumeForm = $("#resumeForm");
const resumeFileInput = $("#resumeFile");
const resumeStatus = $("#resumeStatus");
const resumeCurrent = $("#resumeCurrent");
const resumeMessage = $("#resumeMessage");

const backupMessage = $("#backupMessage");

const dialog = $("#previewDialog");
const dialogTitle = $("#dialogTitle");
const dialogContent = $("#dialogContent");
const dialogDownload = $("#dialogDownload");

let db;
let objectUrls = [];
let currentPreviewUrl = null;

// ---------- IndexedDB setup ----------

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getItem(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function getAllItems() {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

function saveItem(item) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");

    transaction.objectStore(STORE_NAME).put(item);

    transaction.oncomplete = () => resolve(item);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error("Save was cancelled."));
  });
}

function deleteItem(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");

    transaction.objectStore(STORE_NAME).delete(id);

    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}

// ---------- Helpers ----------

function showMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();

  return "item-" + Date.now() + "-" +
    Math.random().toString(36).slice(2);
}

function formatDate(dateString) {
  if (!dateString) return "Date not provided";

  const date = new Date(dateString + "T00:00:00");

  if (Number.isNaN(date.getTime())) return dateString;

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function safeHttpUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(value);

    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.href;
    }
  } catch {
    // Leave invalid URLs unused.
  }

  return "";
}

function isValidCertificateFile(file) {
  const validType =
    ALLOWED_IMAGE_TYPES.includes(file.type) ||
    file.type === "application/pdf" ||
    /\.(jpe?g|png|webp|gif|pdf)$/i.test(file.name);

  if (!validType) {
    throw new Error("Choose a JPG, PNG, WEBP, GIF, or PDF file.");
  }

  if (file.size === 0) {
    throw new Error("This file is empty.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("File exceeds the 15 MB limit.");
  }
}

function isValidPdf(file) {
  if (file.type !== "application/pdf" &&
      !/\.pdf$/i.test(file.name)) {
    throw new Error("Please select a PDF file.");
  }

  if (file.size === 0) {
    throw new Error("The selected PDF is empty.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("Resume exceeds the 15 MB limit.");
  }
}

function makeElement(tag, className, text) {
  const element = document.createElement(tag);

  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;

  return element;
}

function makeButton(text, className, onClick) {
  const button = makeElement("button", className, text);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

function createObjectUrl(blob) {
  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  return url;
}

function clearObjectUrls() {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
  objectUrls = [];
}

function downloadBlob(blob, filename) {
  const url = createObjectUrl(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Keep the URL alive briefly so the download can start.
  setTimeout(() => {
    URL.revokeObjectURL(url);
    objectUrls = objectUrls.filter((item) => item !== url);
  }, 30000);
}

// ---------- Add a certificate ----------

certificateForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = certificateForm.querySelector(
    'button[type="submit"]'
  );

  submitButton.disabled = true;
  showMessage(certificateMessage, "Saving certificate...");

  try {
    const formData = new FormData(certificateForm);
    const file = formData.get("file");

    if (!(file instanceof File) || !file.name) {
      throw new Error("Choose a certificate image or PDF.");
    }

    isValidCertificateFile(file);

    const title = String(formData.get("title") || "").trim();
    const organization =
      String(formData.get("organization") || "").trim();
    const category = String(formData.get("category") || "");

    if (!title || !organization) {
      throw new Error("Title and issuing organization are required.");
    }

    if (!ALLOWED_CATEGORIES.includes(category)) {
      throw new Error("Choose a valid category.");
    }

    const date = String(formData.get("date") || "");
    const verify = String(formData.get("verify") || "").trim();

    if (verify && !safeHttpUrl(verify)) {
      throw new Error("Enter a valid HTTP or HTTPS verification URL.");
    }

    const certificate = {
      id: makeId(),
      type: "certificate",
      title,
      organization,
      date,
      category,
      credential: String(formData.get("credential") || "").trim(),
      verify: verify ? safeHttpUrl(verify) : "",
      description: String(formData.get("description") || "").trim(),
      filename: file.name,
      mimeType: file.type || (
        /\.pdf$/i.test(file.name) ? "application/pdf" : "image/jpeg"
      ),
      blob: file,
      createdAt: new Date().toISOString()
    };

    await saveItem(certificate);

    certificateForm.reset();
    showMessage(certificateMessage, "Certificate saved successfully.");
    await renderCertificates();

    $("#addCertificatePanel").open = false;
  } catch (error) {
    showMessage(
      certificateMessage,
      error.message || "Could not save the certificate.",
      true
    );
  } finally {
    submitButton.disabled = false;
  }
});

// ---------- Certificate cards ----------

function createFileVisual(item) {
  const button = makeElement("button", "certificate-visual");
  button.type = "button";
  button.setAttribute("aria-label", "Preview " + item.title);

  const isPdf =
    item.mimeType === "application/pdf" ||
    /\.pdf$/i.test(item.filename || "");

  if (isPdf) {
    const placeholder = makeElement("div", "pdf-placeholder");
    placeholder.append(
      makeElement("span", "pdf-symbol", "PDF"),
      makeElement("strong", "", item.filename || "Certificate PDF"),
      makeElement("small", "", "Select to preview")
    );
    button.appendChild(placeholder);
  } else {
    const image = document.createElement("img");
    image.alt = "Certificate: " + item.title;
    image.loading = "lazy";
    image.src = createObjectUrl(item.blob);

    image.addEventListener("error", () => {
      image.remove();

      const placeholder = makeElement("div", "pdf-placeholder");
      placeholder.append(
        makeElement("span", "pdf-symbol", "FILE"),
        makeElement("strong", "", "Preview unavailable"),
        makeElement("small", "", "Try downloading the original file")
      );

      button.prepend(placeholder);
    }, { once: true });

    button.appendChild(image);
  }

  button.addEventListener("click", () => openPreview(item));
  return button;
}

function createCertificateCard(item) {
  const card = makeElement("article", "certificate-card");
  const visual = createFileVisual(item);
  const content = makeElement("div", "card-content");
  const meta = makeElement("div", "card-meta");

  meta.append(
    makeElement("span", "tag", item.category),
    makeElement("span", "card-date", formatDate(item.date))
  );

  content.append(
    meta,
    makeElement("h3", "", item.title),
    makeElement("p", "issuer", item.organization)
  );

  if (item.description) {
    content.append(makeElement("p", "description", item.description));
  }

  if (item.credential) {
    content.append(
      makeElement("p", "credential", "Credential ID: " + item.credential)
    );
  }

  const actions = makeElement("div", "card-actions");

  actions.appendChild(
    makeButton("View certificate ↗", "text-button", () => openPreview(item))
  );

  const verificationURL = safeHttpUrl(item.verify);

  if (verificationURL) {
    const verify = makeElement("a", "verify-link", "Verify ↗");
    verify.href = verificationURL;
    verify.target = "_blank";
    verify.rel = "noopener noreferrer";
    actions.appendChild(verify);
  }

  actions.appendChild(
    makeButton("Download ↓", "text-button", () => {
      downloadBlob(item.blob, item.filename || "certificate");
    })
  );

  actions.appendChild(
    makeButton("Delete", "text-button delete-button", async () => {
      const confirmed = confirm(
        `Delete "${item.title}"? This cannot be undone unless you have a backup.`
      );

      if (!confirmed) return;

      try {
        await deleteItem(item.id);
        await renderCertificates();
      } catch {
        alert("Could not delete the certificate.");
      }
    })
  );

  content.appendChild(actions);
  card.append(visual, content);

  return card;
}

async function renderCertificates() {
  clearObjectUrls();

  const allItems = await getAllItems();
  const certificates = allItems
    .filter((item) => item.type === "certificate" && item.blob instanceof Blob)
    .sort((a, b) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
    );

  const query = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;

  const filtered = certificates.filter((item) => {
    const searchText = [
      item.title,
      item.organization,
      item.category,
      item.date,
      item.credential,
      item.description
    ].join(" ").toLowerCase();

    return searchText.includes(query) &&
      (category === "all" || item.category === category);
  });

  certificateGrid.replaceChildren();

  filtered.forEach((item) => {
    certificateGrid.appendChild(createCertificateCard(item));
  });

  certificateCount.textContent =
    `${filtered.length} of ${certificates.length} certificate(s)`;

  emptyState.hidden = filtered.length !== 0;
  certificateGrid.hidden = filtered.length === 0;
}

searchInput.addEventListener("input", () => {
  renderCertificates().catch(console.error);
});

categoryFilter.addEventListener("change", () => {
  renderCertificates().catch(console.error);
});

$("#resetSearch").addEventListener("click", () => {
  searchInput.value = "";
  categoryFilter.value = "all";
  renderCertificates().catch(console.error);
});

// ---------- Preview and download ----------

function openPreview(item) {
  if (currentPreviewUrl) {
    URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = null;
  }

  dialogTitle.textContent = item.title;
  dialogContent.replaceChildren();

  currentPreviewUrl = URL.createObjectURL(item.blob);

  const isPdf =
    item.mimeType === "application/pdf" ||
    /\.pdf$/i.test(item.filename || "");

  if (isPdf) {
    const frame = document.createElement("iframe");
    frame.src = currentPreviewUrl;
    frame.title = item.title + " PDF preview";
    dialogContent.appendChild(frame);
  } else {
    const image = document.createElement("img");
    image.src = currentPreviewUrl;
    image.alt = "Full certificate: " + item.title;

    image.addEventListener("error", () => {
      image.replaceWith(
        makeElement("p", "muted", "This image could not be previewed.")
      );
    }, { once: true });

    dialogContent.appendChild(image);
  }

  dialogDownload.href = currentPreviewUrl;
  dialogDownload.download = item.filename || "certificate";

  if (!dialog.open) dialog.showModal();
}

function closePreview() {
  if (dialog.open) dialog.close();

  dialogContent.replaceChildren();
  dialogDownload.removeAttribute("href");

  if (currentPreviewUrl) {
    URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = null;
  }
}

$("#closeDialog").addEventListener("click", closePreview);

dialog.addEventListener("click", (event) => {
  if (event.target === dialog) closePreview();
});

dialog.addEventListener("close", () => {
  dialogContent.replaceChildren();

  if (currentPreviewUrl) {
    URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = null;
  }
});

// ---------- Resume upload ----------

async function renderResume() {
  const resume = await getItem("resume");

  resumeCurrent.replaceChildren();
  resumeCurrent.hidden = true;

  if (!resume || !(resume.blob instanceof Blob)) {
    resumeStatus.textContent = "No resume uploaded yet.";
    return;
  }

  resumeStatus.textContent = "Saved resume: " + resume.filename;

  const previewButton = makeButton(
    "View resume ↗",
    "button secondary",
    () => openPreview(resume)
  );

  const downloadButton = makeButton(
    "Download resume ↓",
    "button primary",
    () => downloadBlob(resume.blob, resume.filename || "resume.pdf")
  );

  const deleteButton = makeButton(
    "Delete resume",
    "text-button delete-button",
    async () => {
      if (!confirm("Delete your saved resume?")) return;

      try {
        await deleteItem("resume");
        await renderResume();
        showMessage(resumeMessage, "Resume deleted.");
      } catch {
        showMessage(resumeMessage, "Could not delete the resume.", true);
      }
    }
  );

  resumeCurrent.append(previewButton, downloadButton, deleteButton);
  resumeCurrent.hidden = false;
}

resumeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const button = resumeForm.querySelector('button[type="submit"]');
  button.disabled = true;

  showMessage(resumeMessage, "Saving resume...");

  try {
    const file = resumeFileInput.files[0];

    if (!file) throw new Error("Choose your resume PDF.");
    isValidPdf(file);

    await saveItem({
      id: "resume",
      type: "resume",
      title: "Tanvir Kapre Resume",
      filename: file.name,
      mimeType: "application/pdf",
      blob: file,
      createdAt: new Date().toISOString()
    });

    resumeForm.reset();
    await renderResume();
    showMessage(resumeMessage, "Resume saved successfully.");
  } catch (error) {
    showMessage(
      resumeMessage,
      error.message || "Could not save the resume.",
      true
    );
  } finally {
    button.disabled = false;
  }
});

// ---------- Backup and restore ----------

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.substring(result.indexOf(",") + 1));
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}

$("#exportBackup").addEventListener("click", async () => {
  const button = $("#exportBackup");
  button.disabled = true;

  showMessage(backupMessage, "Preparing backup...");

  try {
    const items = await getAllItems();
    const backupItems = [];

    for (const item of items) {
      if (!(item.blob instanceof Blob)) continue;

      backupItems.push({
        ...item,
        blob: undefined,
        fileBase64: await blobToBase64(item.blob)
      });
    }

    const backup = {
      app: DB_NAME,
      version: 1,
      exportedAt: new Date().toISOString(),
      items: backupItems
    };

    const blob = new Blob(
      [JSON.stringify(backup)],
      { type: "application/json" }
    );

    downloadBlob(
      blob,
      `tanvir-portfolio-backup-${new Date().toISOString().slice(0, 10)}.json`
    );

    showMessage(backupMessage, "Backup exported. Keep it somewhere safe.");
  } catch (error) {
    showMessage(
      backupMessage,
      "Backup failed: " + (error.message || "unknown error"),
      true
    );
  } finally {
    button.disabled = false;
  }
});

$("#importBackup").addEventListener("change", async (event) => {
  const file = event.target.files[0];

  if (!file) return;

  showMessage(backupMessage, "Restoring backup...");

  try {
    if (file.size > MAX_BACKUP_SIZE) {
      throw new Error("Backup exceeds the 100 MB limit.");
    }

    const backup = JSON.parse(await file.text());

    if (backup.app !== DB_NAME || !Array.isArray(backup.items)) {
      throw new Error("This is not a valid portfolio backup.");
    }

    // Validate all entries before writing any of them.
    const restored = backup.items.map((item) => {
      if (
        !item ||
        typeof item.id !== "string" ||
        !["certificate", "resume"].includes(item.type) ||
        typeof item.fileBase64 !== "string"
      ) {
        throw new Error("Backup contains an invalid entry.");
      }

      if (item.type === "certificate") {
        if (
          typeof item.title !== "string" ||
          typeof item.organization !== "string" ||
          !ALLOWED_CATEGORIES.includes(item.category)
        ) {
          throw new Error("A certificate entry has invalid details.");
        }
      }

      if (item.type === "resume" && item.id !== "resume") {
        throw new Error("Resume entry is invalid.");
      }

      const decodedSize = Math.floor(item.fileBase64.length * 3 / 4);

      if (decodedSize > MAX_FILE_SIZE) {
        throw new Error("An individual file exceeds the 15 MB limit.");
      }

      const blob = base64ToBlob(item.fileBase64, item.mimeType);

      if (blob.size > MAX_FILE_SIZE) {
        throw new Error("An individual file exceeds the 15 MB limit.");
      }

      if (item.type === "resume" &&
          item.mimeType !== "application/pdf") {
        throw new Error("The backup resume is not a PDF.");
      }

      return {
        ...item,
        blob
      };
    });

    for (const item of restored) {
      delete item.fileBase64;
      await saveItem(item);
    }

    await renderCertificates();
    await renderResume();

    showMessage(
      backupMessage,
      `Restored ${restored.length} item(s). Existing items with matching IDs were updated.`
    );
  } catch (error) {
    showMessage(
      backupMessage,
      "Restore failed: " + (error.message || "invalid backup"),
      true
    );
  } finally {
    event.target.value = "";
  }
});

// ---------- Navigation and startup ----------

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".header nav a").forEach((navLink) => {
      navLink.classList.toggle(
        "active",
        navLink.getAttribute("href") === link.getAttribute("href")
      );
    });
  });
});

$("#year").textContent = new Date().getFullYear();

async function init() {
  if (!("indexedDB" in window)) {
    throw new Error("This browser does not support IndexedDB.");
  }

  db = await openDatabase();

  await renderCertificates();
  await renderResume();
}

init().catch((error) => {
  console.error(error);
  showMessage(
    certificateMessage,
    "Could not open browser storage. Try opening the website using VS Code Live Server or a local web server.",
    true
  );
});
