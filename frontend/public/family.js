// "Family" tab: the family tree in index.html is rendered from -- and saved
// back to -- a small data model in localStorage, so edits survive a reload.
// The markup that ships in index.html is only a seed: it is read once on the
// first visit and from then on the stored model is the source of truth.
//
// Shape of the model:
//   { rows: [ { members: [ { name, photo } ] } ] }
// Row 1 is the top of the tree (grandparents), each later row a generation
// below it, matching the .familyTreeRow order in the markup.

const FAMILY_STORAGE_KEY = "reellife_family";
const DEFAULT_MEMBER_PHOTO = "profile.jpg";
const DEFAULT_MEMBER_NAME = "Unnamed";

const familyTreeEl = document.querySelector(".familyTree");
<<<<<<< Updated upstream
const addFamilyRowBtn = document.querySelector("#addRow");
const removeFamilyRowBtn = document.querySelector("#removeRow");
=======
const resetFamilyTreeBtn = document.querySelector("#resetTree");
>>>>>>> Stashed changes

let familyTree = { rows: [] };

// The last tree the server confirmed. An edit is drawn before it's saved, so
// this is what the page falls back to when a save can't be completed.
let lastSavedTree = { rows: [] };

// ---- Storage ----

// Reads whatever family members are already in the markup. Used as the seed
// the first time this browser opens the app (and by resetFamilyTree()).
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

// Drops anything unexpected from a stored payload so a hand-edited or
// out-of-date entry cannot break rendering.
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

function loadFamilyTree() {
    try {
        const saved = localStorage.getItem(FAMILY_STORAGE_KEY);
        if (saved) return normalizeFamilyTree(JSON.parse(saved));
    } catch (err) {
        // Corrupt JSON or storage turned off -- fall back to the markup.
    }
    return readFamilyTreeFromDom();
}

<<<<<<< Updated upstream
// Every mutating function below ends in a save, so this is the only place that
// writes. Returns false when storage is unavailable (private mode, quota) --
// the in-memory tree still updates, it just will not outlive the page.
=======
// Pulls the server's copy in and draws it.
async function refreshFamilyTree() {
    familyTree = await loadFamilyTree();
    lastSavedTree = normalizeFamilyTree(familyTree);
    renderFamilyTree();
    return familyTree;
}

// The only place that writes. Returns the server's copy of the tree.
>>>>>>> Stashed changes
function saveFamilyTree() {
    try {
        localStorage.setItem(FAMILY_STORAGE_KEY, JSON.stringify(familyTree));
        return true;
    } catch (err) {
        return false;
    }
}

function getFamilyTree() {
    return familyTree;
}

<<<<<<< Updated upstream
=======
function handleFamilyError(err, action) {
    if (err?.status === 401) {
        window.location.href = "login.html";
        return;
    }

    // fetch() rejects with a TypeError when it never reached the server at all
    // -- "Failed to fetch" on its own doesn't say that, so spell it out.
    const reason =
        err instanceof TypeError
            ? "the server isn't responding. Check that it's still running, then try again"
            : err?.detail || err?.message || "unknown error";
    alert(`Could not ${action}: ${reason}.`);
}

// Renders the change straight away, then saves it. If the save fails the page
// is put back to what the server actually holds, so a change that wasn't
// saved never sits on screen looking like it was.
async function persistFamilyTree(action) {
    renderFamilyTree();
    try {
        familyTree = normalizeFamilyTree(await saveFamilyTree());
    } catch (err) {
        handleFamilyError(err, action);
        try {
            familyTree = normalizeFamilyTree(await storageApi.getFamily());
        } catch (refetchErr) {
            // Can't reach the server to ask, so undo the change instead.
            familyTree = normalizeFamilyTree(lastSavedTree);
        }
    }
    lastSavedTree = normalizeFamilyTree(familyTree);
    renderFamilyTree();
}

>>>>>>> Stashed changes
// ---- Mutations (what the buttons and name fields call) ----

function addFamilyMember(rowIndex, name, photo = DEFAULT_MEMBER_PHOTO) {
    const row = familyTree.rows[rowIndex];
    if (!row) return null;

    const member = { name: String(name ?? "").trim() || DEFAULT_MEMBER_NAME, photo };
    row.members.push(member);
    saveFamilyTree();
    renderFamilyTree();
    return member;
}

function renameFamilyMember(rowIndex, memberIndex, name) {
    const member = familyTree.rows[rowIndex]?.members[memberIndex];
    if (!member) return null;

    const trimmed = String(name ?? "").trim() || DEFAULT_MEMBER_NAME;
    if (trimmed === member.name) return member;

    member.name = trimmed;
    saveFamilyTree();
    renderFamilyTree();
    return member;
}

function removeFamilyMember(rowIndex, memberIndex) {
    const row = familyTree.rows[rowIndex];
    if (!row || !row.members[memberIndex]) return null;

    const [removed] = row.members.splice(memberIndex, 1);
    saveFamilyTree();
    renderFamilyTree();
    return removed;
}

<<<<<<< Updated upstream
function addFamilyRow(members = [{ name: DEFAULT_MEMBER_NAME, photo: DEFAULT_MEMBER_PHOTO }]) {
    const row = normalizeFamilyTree({ rows: [{ members }] }).rows[0];
    familyTree.rows.push(row);
    saveFamilyTree();
    renderFamilyTree();
    return row;
}

// Removes the bottom row, like the old #removeRow handler did.
function removeFamilyRow() {
    if (familyTree.rows.length === 0) return null;

    const removed = familyTree.rows.pop();
    saveFamilyTree();
    renderFamilyTree();
=======
// Inserts a row at `index`, pushing the rows below it down. Index 0 puts it at
// the top of the tree, familyTree.rows.length appends it at the bottom.
async function insertFamilyRow(index, members = [{ name: DEFAULT_MEMBER_NAME, photo: DEFAULT_MEMBER_PHOTO }]) {
    const position = Math.max(0, Math.min(index, familyTree.rows.length));
    const row = normalizeFamilyTree({ rows: [{ members }] }).rows[0];
    familyTree.rows.splice(position, 0, row);
    await persistFamilyTree("add that row");
    return row;
}

async function removeFamilyRowAt(index) {
    const row = familyTree.rows[index];
    if (!row) return null;

    const [removed] = familyTree.rows.splice(index, 1);
    await persistFamilyTree("remove that row");
>>>>>>> Stashed changes
    return removed;
}

// Appends at the bottom / removes the bottom row -- kept so familyStore has the
// whole-tree shortcuts, now that the buttons work a row at a time.
function addFamilyRow(members) {
    return insertFamilyRow(familyTree.rows.length, members);
}

function removeFamilyRow() {
    return removeFamilyRowAt(familyTree.rows.length - 1);
}

// Throws away the saved tree and goes back to the markup's starting layout.
function resetFamilyTree() {
    try {
        localStorage.removeItem(FAMILY_STORAGE_KEY);
    } catch (err) {
        // Nothing stored to clear.
    }
    familyTree = readFamilyTreeFromDom();
    renderFamilyTree();
    return familyTree;
}

// ---- Rendering ----

// One family member. The name is an editable field: typing in it and then
// clicking away (or pressing Enter) stores the new name.
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

<<<<<<< Updated upstream
// The per-row "Add" button: asks for a name and stores a new member in that row.
function createRowAddButton(rowIndex) {
=======
function createControlButton(className, label, description, onClick) {
>>>>>>> Stashed changes
    const button = document.createElement("button");
    button.className = className;
    button.type = "button";
    button.textContent = label;
    button.title = description;
    button.setAttribute("aria-label", description);
    button.addEventListener("click", onClick);
    return button;
}

<<<<<<< Updated upstream
// The per-row "Add" button: asks for a name and stores a new member in that row.
function createRowDeleteButton(rowIndex) {
    const button = document.createElement("button");
    button.className = `familyTreeRowRemoveBtn DR${rowIndex + 1}`;
    button.type = "button";
    button.textContent = "Delete Row";
    button.addEventListener("click", () => {
        deleteFamilyRow(rowIndex);
    });
    return button;
=======
// Asks before dropping a whole row of people. An empty row goes without a
// question; a row holding you says so explicitly.
function confirmRowRemoval(row, rowIndex) {
    if (row.members.some((member) => member.is_self)) {
        return confirm(`Row ${rowIndex + 1} includes you. Remove it anyway?`);
    }
    if (row.members.length > 0) {
        const count = row.members.length;
        return confirm(`Remove row ${rowIndex + 1} and the ${count} ${count === 1 ? "person" : "people"} in it?`);
    }
    return true;
}

// The controls that sit beside each row: add a member to it, add a new row
// above or below it, or remove the row itself.
function createRowControls(rowIndex, row) {
    const controls = document.createElement("div");
    controls.className = `familyRowControls CR${rowIndex + 1}`;
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", `Row ${rowIndex + 1} controls`);

    controls.append(
        createControlButton(
            `familyTreeRowAddBtn AR${rowIndex + 1}`,
            "Add",
            `Add a family member to row ${rowIndex + 1}`,
            () => {
                const name = prompt("Who would you like to add to this row?");
                if (name === null) return;
                addFamilyMember(rowIndex, name);
            }
        ),
        createControlButton("familyRowAddAbove", "↑+", `Add a new row above row ${rowIndex + 1}`, () =>
            insertFamilyRow(rowIndex)
        ),
        createControlButton("familyRowAddBelow", "↓+", `Add a new row below row ${rowIndex + 1}`, () =>
            insertFamilyRow(rowIndex + 1)
        ),
        createControlButton("familyRowRemove", "×", `Remove row ${rowIndex + 1}`, () => {
            if (!confirmRowRemoval(row, rowIndex)) return;
            removeFamilyRowAt(rowIndex);
        })
    );

    return controls;
>>>>>>> Stashed changes
}

// Rebuilds the whole tree from the model. Cheap at this size, and it keeps the
// row/column classes and the row-then-add-button ordering the CSS relies on.
function renderFamilyTree() {
    if (!familyTreeEl) return;

    familyTreeEl.innerHTML = "";
<<<<<<< Updated upstream
=======

    // With the row controls living on the rows themselves, an empty tree has
    // nothing to click -- so it carries its own button to start the first row.
    if (familyTree.rows.length === 0) {
        const empty = document.createElement("p");
        empty.className = "familyTreeEmpty";
        empty.textContent = "Your family tree is empty.";

        const addFirst = createControlButton("familyTreeEmptyAdd", "Add a row", "Add the first row", () =>
            insertFamilyRow(0)
        );

        familyTreeEl.append(empty, addFirst);
        return;
    }

>>>>>>> Stashed changes
    familyTree.rows.forEach((row, rowIndex) => {
        const rowEl = document.createElement("div");
        rowEl.className = `familyTreeRow R${rowIndex + 1}`;
        row.members.forEach((member, memberIndex) => {
            rowEl.append(createFamilyMemberEl(rowIndex, memberIndex, member));
        });
<<<<<<< Updated upstream
        familyTreeEl.append(rowEl, createRowAddButton(rowIndex));
        familyTreeEl.append(rowEl, createRowDeleteButton(rowIndex));
=======
        familyTreeEl.append(rowEl, createRowControls(rowIndex, row));
>>>>>>> Stashed changes
    });
}

// ---- Wiring ----

if (familyTreeEl) {
    familyTree = loadFamilyTree();
    renderFamilyTree();

<<<<<<< Updated upstream
    addFamilyRowBtn?.addEventListener("click", () => addFamilyRow());
    removeFamilyRowBtn?.addEventListener("click", () => removeFamilyRow());
=======
    try {
        await refreshFamilyTree();
    } catch (err) {
        handleFamilyError(err, "load your family tree");
        return;
    }

    // Wired only once the tree is loaded, so an early click can't save over it.
    // The add/remove row buttons are per-row now, and are wired as they render.
    resetFamilyTreeBtn?.addEventListener("click", () => {
        // The only action that throws away a whole tree at once, so it asks.
        if (!confirm("Replace your family tree with the default one? Everything in it now will be lost.")) return;
        resetFamilyTree();
    });
>>>>>>> Stashed changes
}

// Grouped for anything else that wants to read or change the tree (the story
// tabs later on, or the console while debugging).
const familyStore = {
    get: getFamilyTree,
    load: loadFamilyTree,
    save: saveFamilyTree,
    render: renderFamilyTree,
    addMember: addFamilyMember,
    renameMember: renameFamilyMember,
    removeMember: removeFamilyMember,
    addRow: addFamilyRow,
    insertRow: insertFamilyRow,
    removeRow: removeFamilyRow,
    removeRowAt: removeFamilyRowAt,
    reset: resetFamilyTree,
};
