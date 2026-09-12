// Thin client for the accounts/conversations FastAPI service (../../database).
// Every fetch() call against that API should go through here so token storage
// and error handling stay in one place.

const AUTH_TOKEN_KEY = "reellife_token";

const tokenStore = {
  get: () => localStorage.getItem(AUTH_TOKEN_KEY),
  set(token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  },
  clear() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  },
};

class ApiError extends Error {
  constructor(status, detail) {
    super(typeof detail === "string" ? detail : JSON.stringify(detail));
    this.status = status;
    this.detail = detail;
  }
}

async function parseErrorDetail(response) {
  try {
    const body = await response.json();
    return body.detail ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

// Core fetch wrapper. Adds the bearer token (if present) and normalizes
// errors into ApiError. There's no refresh token in this API -- a 401 just
// means the session is gone, so callers should clear it and send the user
// back to login.html.
async function apiFetch(path, { method = "GET", body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = tokenStore.get();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    if (response.status === 401 && auth) tokenStore.clear();
    throw new ApiError(response.status, await parseErrorDetail(response));
  }

  return response.json();
}

const storageApi = {
  // ---- Auth ----

  signup({ username, email, password }) {
    return apiFetch("/signup", { method: "POST", auth: false, body: { username, email, password } });
  },

  async login({ email, password }) {
    const data = await apiFetch("/login", { method: "POST", auth: false, body: { email, password } });
    tokenStore.set(data.token);
    return data;
  },

  async logout() {
    try {
      await apiFetch("/logout", { method: "POST" });
    } catch {
      // Best-effort; clear the local token either way.
    } finally {
      tokenStore.clear();
    }
  },

  whoami() {
    return apiFetch("/whoami");
  },

  isLoggedIn() {
    return Boolean(tokenStore.get());
  },

  // ---- Conversations ----

  createConversation() {
    return apiFetch("/conversations", { method: "POST" });
  },

  listConversations() {
    return apiFetch("/conversations");
  },

  getConversation(conversationId) {
    return apiFetch(`/conversations/${conversationId}`);
  },

  getPrompts(conversationId) {
    return apiFetch(`/conversations/${conversationId}/prompts`);
  },

  addPrompt(conversationId, { content, inputMediaFilename, inputMediaBase64 } = {}) {
    return apiFetch(`/conversations/${conversationId}/prompts`, {
      method: "POST",
      body: {
        content,
        input_media_filename: inputMediaFilename || null,
        input_media_base64: inputMediaBase64 || null,
      },
    });
  },

  addResponse(promptId, { response, outputMediaFilename, outputMediaBase64, cost } = {}) {
    return apiFetch(`/prompts/${promptId}/response`, {
      method: "POST",
      body: {
        response,
        output_media_filename: outputMediaFilename || null,
        output_media_base64: outputMediaBase64 || null,
        cost: cost ?? 0,
      },
    });
  },

  // ---- Family tree ----
  // Both return the caller's own tree: { rows: [ { members: [ { name, photo } ] } ] }.

  getFamily() {
    return apiFetch("/family");
  },

  saveFamily(tree) {
    return apiFetch("/family", { method: "PUT", body: tree });
  },
};
