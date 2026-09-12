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
const addFamilyRowBtn = document.querySelector("#addRow");
const removeFamilyRowBtn = document.querySelector("#removeRow");

let familyTree = { rows: [] };

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

// Every mutating function below ends in a save, so this is the only place that
// writes. Returns false when storage is unavailable (private mode, quota) --
// the in-memory tree still updates, it just will not outlive the page.
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
    return removed;
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

// The per-row "Add" button: asks for a name and stores a new member in that row.
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

if (familyTreeEl) {
    familyTree = loadFamilyTree();
    renderFamilyTree();

    addFamilyRowBtn?.addEventListener("click", () => addFamilyRow());
    removeFamilyRowBtn?.addEventListener("click", () => removeFamilyRow());
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
    removeRow: removeFamilyRow,
    reset: resetFamilyTree,
};
