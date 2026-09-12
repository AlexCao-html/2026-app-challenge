// "Family" tab: the family tree in index.html is rendered from -- and saved
// back to -- the logged-in user's tree on the server (GET/PUT /family, see
// ../family.js), so it follows the account rather than the browser and two
// people on the same device never see each other's family.
//
// Shape of the model:
//   { rows: [ { members: [ { name, photo } ] } ] }
// Row 1 is the top of the tree (grandparents), each later row a generation
// below it, matching the .familyTreeRow order in the markup.
//
// A user who has never opened this tab gets an empty tree back; the markup in
// index.html is then used as their starting layout and saved to the server.

const DEFAULT_MEMBER_PHOTO = "profile.jpg";
const DEFAULT_MEMBER_NAME = "Unnamed";

const familyTreeEl = document.querySelector(".familyTree");
const addFamilyRowBtn = document.querySelector("#addRow");
const removeFamilyRowBtn = document.querySelector("#removeRow");

let familyTree = { rows: [] };

// ---- Storage ----

// Reads whatever family members are in the markup. Used as the starting tree
// for a new account (and by resetFamilyTree()).
function readFamilyTreeFromDom() {
    const rowEls = familyTreeEl ? familyTreeEl.querySelectorAll(".familyTreeRow") : [];
    return {
        rows: [...rowEls].map((rowEl) => ({
            members: [...rowEl.children].map((memberEl) => {
                const heading = memberEl.querySelector("h3");
                const img = memberEl.querySelector("img");
                return {
                    // The name is the text before the <img>, e.g. "Grandma (moms side)".
                    name: heading?.firstChild?.textContent.trim() || DEFAULT_MEMBER_NAME,
                    photo: img?.getAttribute("src") || DEFAULT_MEMBER_PHOTO,
                };
            }),
        })),
    };
}

// The starting layout, captured now because the first render replaces the
// markup it reads. normalizeFamilyTree() copies it, so callers can't scribble
// on the original.
const MARKUP_TREE = readFamilyTreeFromDom();

function startingTree() {
    return normalizeFamilyTree(MARKUP_TREE);
}

// Drops anything unexpected from a response so a surprising payload can't
// break rendering.
function normalizeFamilyTree(raw) {
    const rows = Array.isArray(raw?.rows) ? raw.rows : [];
    return {
        rows: rows.map((row) => ({
            members: (Array.isArray(row?.members) ? row.members : []).map((member) => ({
                name: String(member?.name ?? "").trim() || DEFAULT_MEMBER_NAME,
                photo: String(member?.photo ?? "").trim() || DEFAULT_MEMBER_PHOTO,
            })),
        })),
    };
}

// Fetches this user's tree. A brand new account comes back with no rows, so
// the markup's layout is saved as their starting point.
async function loadFamilyTree() {
    const stored = normalizeFamilyTree(await storageApi.getFamily());
    if (stored.rows.length > 0) return stored;

    return normalizeFamilyTree(await storageApi.saveFamily(startingTree()));
}

// Pulls the server's copy in and draws it.
async function refreshFamilyTree() {
    familyTree = await loadFamilyTree();
    renderFamilyTree();
    return familyTree;
}

// The only place that writes. Returns the server's copy of the tree.
function saveFamilyTree() {
    return storageApi.saveFamily(familyTree);
}

function getFamilyTree() {
    return familyTree;
}

function handleFamilyError(err, action) {
    if (err?.status === 401) {
        window.location.href = "login.html";
        return;
    }
    alert(`Could not ${action}: ${err?.detail || err?.message || "unknown error"}`);
}

// Renders the change straight away, then saves it. If the save fails the
// server's copy is pulled back in, so the page never keeps an edit the
// account didn't actually get.
async function persistFamilyTree(action) {
    renderFamilyTree();
    try {
        familyTree = normalizeFamilyTree(await saveFamilyTree());
    } catch (err) {
        handleFamilyError(err, action);
        try {
            familyTree = normalizeFamilyTree(await storageApi.getFamily());
        } catch (refetchErr) {
            return;
        }
    }
    renderFamilyTree();
}

// ---- Mutations (what the buttons and name fields call) ----

async function addFamilyMember(rowIndex, name, photo = DEFAULT_MEMBER_PHOTO) {
    const row = familyTree.rows[rowIndex];
    if (!row) return null;

    const member = { name: String(name ?? "").trim() || DEFAULT_MEMBER_NAME, photo };
    row.members.push(member);
    await persistFamilyTree("add that family member");
    return member;
}

async function renameFamilyMember(rowIndex, memberIndex, name) {
    const member = familyTree.rows[rowIndex]?.members[memberIndex];
    if (!member) return null;

    const trimmed = String(name ?? "").trim() || DEFAULT_MEMBER_NAME;
    if (trimmed === member.name) return member;

    member.name = trimmed;
    await persistFamilyTree("save that name");
    return member;
}

async function removeFamilyMember(rowIndex, memberIndex) {
    const row = familyTree.rows[rowIndex];
    if (!row || !row.members[memberIndex]) return null;

    const [removed] = row.members.splice(memberIndex, 1);
    await persistFamilyTree("remove that family member");
    return removed;
}

async function addFamilyRow(members = [{ name: DEFAULT_MEMBER_NAME, photo: DEFAULT_MEMBER_PHOTO }]) {
    const row = normalizeFamilyTree({ rows: [{ members }] }).rows[0];
    familyTree.rows.push(row);
    await persistFamilyTree("add that row");
    return row;
}

// Removes the bottom row, like the old #removeRow handler did.
async function removeFamilyRow() {
    if (familyTree.rows.length === 0) return null;

    const removed = familyTree.rows.pop();
    await persistFamilyTree("remove that row");
    return removed;
}

// Throws away the saved tree and goes back to the markup's starting layout.
async function resetFamilyTree() {
    familyTree = startingTree();
    await persistFamilyTree("reset the family tree");
    return familyTree;
}

// ---- Rendering ----

// One family member. The name is an editable field: typing in it and then
// clicking away (or pressing Enter) saves the new name.
function createFamilyMemberEl(rowIndex, memberIndex, member) {
    const cell = document.createElement("div");
    cell.className = `r${rowIndex + 1} c${memberIndex + 1}`;

    const heading = document.createElement("h3");

    const nameField = document.createElement("span");
    nameField.className = "familyMemberName";
    nameField.contentEditable = "true";
    nameField.spellcheck = false;
    nameField.textContent = member.name;
    nameField.addEventListener("blur", () => {
        renameFamilyMember(rowIndex, memberIndex, nameField.textContent);
    });
    nameField.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            nameField.blur();
        }
    });

    const photo = document.createElement("img");
    photo.src = member.photo || DEFAULT_MEMBER_PHOTO;
    photo.alt = "profile";

    heading.append(nameField, photo);
    cell.append(heading);
    return cell;
}

// The per-row "Add" button: asks for a name and saves a new member in that row.
function createRowAddButton(rowIndex) {
    const button = document.createElement("button");
    button.className = `familyTreeRowAddBtn AR${rowIndex + 1}`;
    button.type = "button";
    button.textContent = "Add";
    button.addEventListener("click", () => {
        const name = prompt("Who would you like to add to this row?");
        if (name === null) return;
        addFamilyMember(rowIndex, name);
    });
    return button;
}

// Rebuilds the whole tree from the model. Cheap at this size, and it keeps the
// row/column classes and the row-then-add-button ordering the CSS relies on.
function renderFamilyTree() {
    if (!familyTreeEl) return;

    familyTreeEl.innerHTML = "";
    familyTree.rows.forEach((row, rowIndex) => {
        const rowEl = document.createElement("div");
        rowEl.className = `familyTreeRow R${rowIndex + 1}`;
        row.members.forEach((member, memberIndex) => {
            rowEl.append(createFamilyMemberEl(rowIndex, memberIndex, member));
        });
        familyTreeEl.append(rowEl, createRowAddButton(rowIndex));
    });
}

// ---- Wiring ----

// Until this resolves the page shows the static markup from index.html, which
// is the same layout a new account starts with.
async function initFamilyTree() {
    if (!familyTreeEl || !storageApi.isLoggedIn()) return;

    try {
        await refreshFamilyTree();
    } catch (err) {
        handleFamilyError(err, "load your family tree");
        return;
    }

    // Wired only once the tree is loaded, so an early click can't save over it.
    addFamilyRowBtn?.addEventListener("click", () => addFamilyRow());
    removeFamilyRowBtn?.addEventListener("click", () => removeFamilyRow());
}

initFamilyTree();

// Grouped for anything else that wants to read or change the tree (the story
// tabs later on, or the console while debugging).
const familyStore = {
    get: getFamilyTree,
    refresh: refreshFamilyTree,
    save: saveFamilyTree,
    render: renderFamilyTree,
    addMember: addFamilyMember,
    renameMember: renameFamilyMember,
    removeMember: removeFamilyMember,
    addRow: addFamilyRow,
    removeRow: removeFamilyRow,
    reset: resetFamilyTree,
};
