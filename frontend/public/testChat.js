// "Test" tab: a conversation list (like ai-chat-ui's sidebar) backed by the
// same storage_api.js used elsewhere, but the chat itself only accepts user
// input -- each message gets a canned assistant reply generated locally (no
// real AI is wired up), and both sides of the exchange are persisted as one
// prompt via storageApi.addPrompt / storageApi.addResponse.

const testState = {
    conversations: [],
    selectedConversationId: null,
};

const newTestConversationBtn = document.querySelector("#newTestConversationBtn");
const testConversationList = document.querySelector("#testConversationList");
const testEmptyState = document.querySelector("#testEmptyState");
const testConversationPanel = document.querySelector("#testConversationPanel");
const testMessageList = document.querySelector("#testMessageList");
const testMessageForm = document.querySelector("#testMessageForm");
const testMessageInput = document.querySelector("#testMessageInput");

const CANNED_RESPONSES = [
    "That's a great memory -- what happened next?",
    "I'd love to hear more about that. Who else was there?",
    "Thanks for sharing! How did that make you feel at the time?",
    "Interesting -- can you describe the place a bit more?",
    "What do you remember most vividly about that moment?",
];

function generateAssistantReply() {
    return CANNED_RESPONSES[Math.floor(Math.random() * CANNED_RESPONSES.length)];
}

function appendMessage(role, text) {
    const item = document.createElement("div");
    item.className = `message message-${role}`;
    item.textContent = text;
    testMessageList.appendChild(item);
    testMessageList.scrollTop = testMessageList.scrollHeight;
}

function renderTestMessages(prompts) {
    testMessageList.innerHTML = "";
    for (const prompt of prompts) {
        appendMessage("user", prompt.content);
        if (prompt.response) appendMessage("assistant", prompt.response);
    }
}

function conversationLabel(conversation) {
    const when = new Date(conversation.creation_date).toLocaleString();
    return `Conversation #${conversation.conversation_id} · ${when}`;
}

function renderConversationList() {
    testConversationList.innerHTML = "";
    for (const conversation of testState.conversations) {
        const item = document.createElement("li");
        item.className = "testConversationItem";
        item.classList.toggle("selected", conversation.conversation_id === testState.selectedConversationId);
        item.textContent = conversationLabel(conversation);
        item.addEventListener("click", () => selectTestConversation(conversation.conversation_id));
        testConversationList.appendChild(item);
    }
}

async function refreshTestConversations() {
    try {
        testState.conversations = await storageApi.listConversations();
    } catch (err) {
        testState.conversations = [];
    }
    renderConversationList();
}

async function selectTestConversation(conversationId) {
    testState.selectedConversationId = conversationId;
    renderConversationList();
    testEmptyState.classList.add("hidden");
    testConversationPanel.classList.remove("hidden");
    try {
        renderTestMessages(await storageApi.getPrompts(conversationId));
    } catch (err) {
        renderTestMessages([]);
    }
}

newTestConversationBtn.addEventListener("click", async () => {
    try {
        const conversation = await storageApi.createConversation();
        await refreshTestConversations();
        await selectTestConversation(conversation.conversation_id);
    } catch (err) {
        alert(err.detail || "Failed to create conversation");
    }
});

testMessageForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!testState.selectedConversationId) return;
    const content = testMessageInput.value.trim();
    if (!content) return;
    testMessageInput.value = "";

    try {
        const { prompt_id } = await storageApi.addPrompt(testState.selectedConversationId, { content });
        appendMessage("user", content);

        const reply = generateAssistantReply();
        await storageApi.addResponse(prompt_id, { response: reply });
        appendMessage("assistant", reply);
    } catch (err) {
        appendMessage("assistant", `(failed to send: ${err.detail || err.message})`);
    }
});

refreshTestConversations();
