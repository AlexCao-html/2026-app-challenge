// "Tell Your Story" tab: an AI interview (ported from the ReelLife repo) on
// top of a conversation list like ai-chat-ui's sidebar. Pick an interview
// mode, start one, and the interviewer (../interview.js) asks a question;
// every answer -- typed, or dictated through voiceInput.js -- is saved and
// answered with the next question. "Skip question" swaps the latest question
// for another, and "Write my story" has the interviewer turn the answers into
// a draft for the publish dialog.
//
// Publishing a conversation as a story lives in stories.js, which owns the
// publish bar above the message list; this file just tells it which
// conversation is selected (refreshPublishStatus) and hands it the draft
// (openPublishModal).

const testState = {
    conversations: [],
    selectedConversationId: null,
    // True while waiting on the interviewer, so a second answer can't be sent
    // before the first one has its question.
    busy: false,
};

const newTestConversationBtn = document.querySelector("#newTestConversationBtn");
const interviewModeSelect = document.querySelector("#interviewModeSelect");
const testConversationList = document.querySelector("#testConversationList");
const testEmptyState = document.querySelector("#testEmptyState");
const testConversationPanel = document.querySelector("#testConversationPanel");
const testMessageList = document.querySelector("#testMessageList");
const testMessageForm = document.querySelector("#testMessageForm");
const testMessageInput = document.querySelector("#testMessageInput");
const testSendBtn = document.querySelector("#testSendBtn");
const micBtn = document.querySelector("#micBtn");
const liveCaption = document.querySelector("#liveCaption");
const skipQuestionBtn = document.querySelector("#skipQuestionBtn");
const writeStoryBtn = document.querySelector("#writeStoryBtn");

function errorText(err) {
    return err.detail || err.message || "Something went wrong";
}

function appendMessage(role, text) {
    const item = document.createElement("div");
    item.className = `message message-${role}`;
    item.textContent = text;
    testMessageList.appendChild(item);
    testMessageList.scrollTop = testMessageList.scrollHeight;
    return item;
}

function renderTestMessages(conversation, prompts) {
    testMessageList.innerHTML = "";
    if (conversation?.opening_question) appendMessage("assistant", conversation.opening_question);
    for (const prompt of prompts) {
        appendMessage("user", prompt.content);
        if (prompt.response) appendMessage("assistant", prompt.response);
    }
}

function selectedConversation() {
    return testState.conversations.find(
        (conversation) => conversation.conversation_id === testState.selectedConversationId
    );
}

function conversationLabel(conversation) {
    const when = new Date(conversation.creation_date).toLocaleString();
    const kind = conversation.interview_mode ? `${conversation.interview_mode} interview` : "Conversation";
    return `${kind} #${conversation.conversation_id} · ${when}`;
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
    dictation?.stop();
    testState.selectedConversationId = conversationId;
    renderConversationList();
    testEmptyState.classList.add("hidden");
    testConversationPanel.classList.remove("hidden");
    try {
        renderTestMessages(selectedConversation(), await storageApi.getPrompts(conversationId));
    } catch (err) {
        renderTestMessages(selectedConversation(), []);
    }
    refreshPublishStatus(conversationId);
}

function setBusy(busy) {
    testState.busy = busy;
    testSendBtn.disabled = busy;
    skipQuestionBtn.disabled = busy;
    writeStoryBtn.disabled = busy;
}

// Runs one call to the interviewer with a "..." bubble standing in for its
// reply. The reply only lands if the same conversation is still open.
async function withInterviewer(conversationId, call) {
    setBusy(true);
    const pending = appendMessage("assistant", "…");
    pending.classList.add("pending");
    try {
        return await call();
    } finally {
        pending.remove();
        setBusy(false);
    }
}

function stillSelected(conversationId) {
    return testState.selectedConversationId === conversationId;
}

newTestConversationBtn.addEventListener("click", async () => {
    let conversationId;
    try {
        ({ conversation_id: conversationId } = await storageApi.createConversation());
    } catch (err) {
        alert(errorText(err) || "Failed to create conversation");
        return;
    }
    await refreshTestConversations();
    await selectTestConversation(conversationId);

    try {
        const { question } = await withInterviewer(conversationId, () =>
            storageApi.startInterview(conversationId, interviewModeSelect.value)
        );
        // The mode and opening question now live on the conversation.
        await refreshTestConversations();
        if (stillSelected(conversationId)) appendMessage("assistant", question);
    } catch (err) {
        if (stillSelected(conversationId)) {
            appendMessage("error", `${errorText(err)} You can still start by telling your story below.`);
        }
    }
});

async function sendAnswer() {
    const conversationId = testState.selectedConversationId;
    if (!conversationId || testState.busy) return;
    const content = testMessageInput.value.trim();
    if (!content) return;

    dictation?.stop();
    testMessageInput.value = "";
    appendMessage("user", content);

    try {
        const { question } = await withInterviewer(conversationId, () =>
            storageApi.answerInterview(conversationId, content)
        );
        if (stillSelected(conversationId)) appendMessage("assistant", question);
    } catch (err) {
        if (!stillSelected(conversationId)) return;
        // A 4xx means the answer itself was refused; otherwise it was saved
        // and only the next question is missing.
        if (!err.status) {
            appendMessage("error", "Couldn't reach the server, so your answer may not have been saved.");
            testMessageInput.value = content;
        } else if (err.status < 500) {
            appendMessage("error", `Not sent: ${errorText(err)}`);
            testMessageInput.value = content;
        } else {
            appendMessage("error", `${errorText(err)} Your answer was saved -- press "Skip question" to get a question.`);
        }
    }
}

testMessageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendAnswer();
});

// Enter sends, Shift+Enter starts a new line.
testMessageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendAnswer();
    }
});

// Redraws from the server rather than patching the list, since the question
// being replaced may be the opening one or the one after the latest answer.
skipQuestionBtn.addEventListener("click", async () => {
    const conversationId = testState.selectedConversationId;
    if (!conversationId || testState.busy) return;
    try {
        await withInterviewer(conversationId, () => storageApi.skipInterviewQuestion(conversationId));
        await refreshTestConversations();
        if (stillSelected(conversationId)) await selectTestConversation(conversationId);
    } catch (err) {
        if (stillSelected(conversationId)) appendMessage("error", errorText(err));
    }
});

writeStoryBtn.addEventListener("click", async () => {
    const conversationId = testState.selectedConversationId;
    if (!conversationId || testState.busy) return;

    const label = writeStoryBtn.textContent;
    writeStoryBtn.textContent = "Writing…";
    setBusy(true);
    try {
        const { story } = await storageApi.draftInterviewStory(conversationId);
        if (stillSelected(conversationId)) await openPublishModal(conversationId, { draft: story });
    } catch (err) {
        if (stillSelected(conversationId)) appendMessage("error", errorText(err));
    } finally {
        writeStoryBtn.textContent = label;
        setBusy(false);
    }
});

// ---- Answering out loud ----

// Finished phrases go into the answer box (so they can be fixed before
// sending); the phrase still being heard shows as a caption underneath.
const dictation = createDictation({
    onFinalText(text) {
        if (!text) return;
        const current = testMessageInput.value.trimEnd();
        testMessageInput.value = current ? `${current} ${text}` : text;
        testMessageInput.scrollTop = testMessageInput.scrollHeight;
    },
    onInterimText(text) {
        liveCaption.textContent = text;
        liveCaption.classList.toggle("hidden", !text);
    },
    onListeningChange(listening) {
        micBtn.classList.toggle("listening", listening);
        micBtn.title = listening ? "Stop listening" : "Answer out loud";
        micBtn.setAttribute("aria-pressed", String(listening));
        testMessageInput.placeholder = listening ? "Listening… your words will appear here" : "Tell your story...";
    },
    onError(message) {
        appendMessage("error", message);
    },
});

if (dictation) {
    micBtn.addEventListener("click", () => (dictation.listening ? dictation.stop() : dictation.start()));
} else {
    micBtn.classList.add("hidden");
}

refreshTestConversations();
