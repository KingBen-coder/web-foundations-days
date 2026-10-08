// Select all the elements
const noteText = document.getElementById("note-text");
const charCount = document.getElementById("char-count");
const wordCount = document.getElementById("word-count");
const clearBtn = document.getElementById("clear-btn");
const themeToggle = document.getElementById("theme-toggle");

const MAX_CHARS = 200;
const WARNING_AT = 180;
const DRAFT_KEY = "quicknotes-draft";
const THEME_KEY = "quicknotes-theme";

// Update both counters and the warning / over classes
function updateCounts() {
  const text = noteText.value;
  const chars = text.length;
  const trimmed = text.trim();
  const words = trimmed === "" ? 0 : trimmed.split(/\s+/).length;

  charCount.textContent = `${chars} / ${MAX_CHARS} characters`;
  wordCount.textContent = `${words} ${words === 1 ? "word" : "words"}`;

  charCount.classList.toggle("warning", chars > WARNING_AT && chars <= MAX_CHARS);
  charCount.classList.toggle("over", chars > MAX_CHARS);
}

// Save the draft (or remove it when the box is empty)
function saveDraft() {
  if (noteText.value === "") {
    localStorage.removeItem(DRAFT_KEY);
  } else {
    localStorage.setItem(DRAFT_KEY, noteText.value);
  }
}

// Empty the textarea, reset the counters and remove the draft
function clearNote() {
  noteText.value = "";
  localStorage.removeItem(DRAFT_KEY);
  updateCounts();
}

// Apply a theme and keep the button label in sync
function applyTheme(isDark) {
  document.body.classList.toggle("dark", isDark);
  themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
}

// Every keystroke: update counters and save the draft
noteText.addEventListener("input", () => {
  updateCounts();
  saveDraft();
});

// Escape inside the textarea clears everything
noteText.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    clearNote();
  }
});

clearBtn.addEventListener("click", clearNote);

themeToggle.addEventListener("click", () => {
  const isDark = !document.body.classList.contains("dark");
  applyTheme(isDark);
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
});

// On page load: restore draft and theme, then update the counters
const savedDraft = localStorage.getItem(DRAFT_KEY);
if (savedDraft !== null) {
  noteText.value = savedDraft;
}

applyTheme(localStorage.getItem(THEME_KEY) === "dark");
updateCounts();
