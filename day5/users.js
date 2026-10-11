// Select the elements
const loadButton = document.getElementById("load-users");
const filterInput = document.getElementById("filter-input");
const statusMessage = document.getElementById("status");
const usersList = document.getElementById("users-list");

// To test the error path, temporarily change this URL (e.g. add "xyz" to "users")
const API_URL = "https://jsonplaceholder.typicode.com/users";

// All loaded users are stored here so filtering needs no new request
let allUsers = [];

function setStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = type || "";
}

// Draw any array of users into the list
function renderUsers(list) {
  usersList.textContent = "";

  if (list.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No users match your filter.";
    usersList.appendChild(empty);
    return;
  }

  for (const user of list) {
    const item = document.createElement("li");

    const name = document.createElement("h3");
    name.className = "user-name";
    name.textContent = user.name;

    const email = document.createElement("p");
    email.className = "user-detail";
    email.textContent = `Email: ${user.email}`;

    const city = document.createElement("p");
    city.className = "user-detail";
    city.textContent = `City: ${user.address.city}`;

    const company = document.createElement("p");
    company.className = "user-detail";
    company.textContent = `Company: ${user.company.name}`;

    item.append(name, email, city, company);
    usersList.appendChild(item);
  }
}

// Return users whose name includes the typed text (not case-sensitive)
function filterUsers() {
  const term = filterInput.value.trim().toLowerCase();
  return allUsers.filter((user) => user.name.toLowerCase().includes(term));
}

async function loadUsers() {
  loadButton.disabled = true;
  setStatus("Loading users...", "loading");

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    allUsers = await response.json();

    // Respect any text already typed in the filter box
    renderUsers(filterUsers());
    setStatus(`Loaded ${allUsers.length} users.`, "success");
  } catch (error) {
    console.error(error);
    setStatus(`Could not load users: ${error.message}`, "error");
  } finally {
    loadButton.disabled = false;
  }
}

loadButton.addEventListener("click", loadUsers);

// Filter the stored array on every keystroke, with no new request
filterInput.addEventListener("input", () => {
  if (allUsers.length === 0) {
    return;
  }
  renderUsers(filterUsers());
});
