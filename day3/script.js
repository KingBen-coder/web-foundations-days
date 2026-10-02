let notes = [
  { id: 1, text: "Buy milk and bread", category: "personal" },
  { id: 2, text: "Finish the Day 3 assignment", category: "study" },
  { id: 3, text: "Email the project report to Grace", category: "work" },
  { id: 4, text: "Revise JavaScript arrays", category: "study" },
  { id: 5, text: "Call mum", category: "personal" },
];

function searchNotes(word) {
  const searchTerm = word.toLowerCase();
  return notes.filter((note) => note.text.toLowerCase().includes(searchTerm));
}

function longestNote() {
  if (notes.length === 0) {
    return null;
  }

  let longest = notes[0];

  for (let i = 1; i < notes.length; i++) {
    if (notes[i].text.length > longest.text.length) {
      longest = notes[i];
    }
  }

  return longest;
}

function countByCategory() {
  const counts = {};

  for (const note of notes) {
    if (counts[note.category]) {
      counts[note.category]++;
    } else {
      counts[note.category] = 1;
    }
  }

  return counts;
}

function getSummary() {
  const counts = countByCategory();
  const noteWord = notes.length === 1 ? "note" : "notes";

  return `${notes.length} ${noteWord}: ${counts.personal || 0} personal, ${counts.work || 0} work, ${counts.study || 0} study.`;
}

function isDuplicate(text) {
  const normalizedText = text.trim().toLowerCase();

  return notes.some((note) => note.text.trim().toLowerCase() === normalizedText);
}

function addNote(text, category) {
  const trimmedText = text.trim();
  const validCategories = ["personal", "work", "study"];

  if (trimmedText.length < 1 || trimmedText.length > 200) {
    console.log("Note not added: text must be 1–200 characters.");
    return false;
  }

  if (isDuplicate(trimmedText)) {
    console.log("Note not added: duplicate note.");
    return false;
  }

  if (!validCategories.includes(category)) {
    console.log("Note not added: category must be personal, work, or study.");
    return false;
  }

  const newId = notes.length === 0 ? 1 : Math.max(...notes.map((note) => note.id)) + 1;

  notes.push({
    id: newId,
    text: trimmedText,
    category,
  });

  console.log("Note added successfully.");
  return true;
}

// searchNotes tests
console.log(searchNotes("DAY"));
// Expected: [{ id: 2, text: "Finish the Day 3 assignment", category: "study" }]
console.log(searchNotes("pizza"));
// Expected: []

// longestNote tests
console.log(longestNote());
// Expected: { id: 3, text: "Email the project report to Grace", category: "work" }
const savedNotesForLongestTest = notes;
notes = [];
console.log(longestNote());
// Expected: null
notes = savedNotesForLongestTest;

// countByCategory tests
console.log(countByCategory());
// Expected: { personal: 2, study: 2, work: 1 }
const savedNotesForCountTest = notes;
notes = [{ id: 6, text: "One personal note", category: "personal" }];
console.log(countByCategory());
// Expected: { personal: 1 }
notes = savedNotesForCountTest;

// getSummary tests
console.log(getSummary());
// Expected: "5 notes: 2 personal, 1 work, 2 study."
const savedNotesForSummaryTest = notes;
notes = [{ id: 6, text: "One personal note", category: "personal" }];
console.log(getSummary());
// Expected: "1 note: 1 personal, 0 work, 0 study."
notes = savedNotesForSummaryTest;

// isDuplicate tests
console.log(isDuplicate("  BUY MILK AND BREAD  "));
// Expected: true
console.log(isDuplicate("Read a new book"));
// Expected: false

// addNote tests
console.log(addNote("Plan weekend study time", "study"));
// Expected: true
console.log(addNote("  BUY MILK AND BREAD  ", "personal"));
// Expected: false
console.log(addNote("A valid note", "shopping"));
// Expected: false
console.log(addNote("", "personal"));
// Expected: false
