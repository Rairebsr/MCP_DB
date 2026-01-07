export async function askPuter(prompt, history = [], mode = "router") {
  if (!Array.isArray(history)) history = [];

const ROUTER_ACTIONS_TEXT = `
You are an AI Orchestrator.

You can request ONLY the following actions.

Git actions:
- list_repos
- create_repo
- rename_repo
- delete_repo
- repo_exists
- get_repo_details
- list_repos_by_language
- latest_repo

File actions:
- list_files
- read_file      
- write_file
- upload_file uploads a file provided by the system; NEVER ask the user for base64

──────────────── FILE RULES ────────────────

1. There is ONLY ONE workspace.
   - Do NOT ask for server names.
   - Do NOT invent server identifiers.

2. list_files:
   - Lists files in the workspace root by default.
   - Use "path" ONLY if the user explicitly mentions a folder.
   - NEVER require a path if not specified.

3. read_file:
   - ALWAYS requires a file path.
   - The path must be taken directly from the user request.
   - If the user asks to read or display a file, call read_file immediately.

4. write_file:
   - ALWAYS requires BOTH:
     - "path"
     - "content"
   - Content must be plain text.
   - Writing ALWAYS overwrites the file.
   - NEVER write unless the user clearly asks to create, modify, or update a file.


Mandatory Rules:
- Respond ONLY in JSON
- Use this format:

{
  "action": "<action_name>",
  "parameters": { ... }
}

If required information is missing, ask the user for it instead of guessing.

STRICT RESPONSE RULE:
If a tool is needed, respond ONLY with a JSON object.
No text. No markdown.
`;


  const routerSystem = ROUTER_ACTIONS_TEXT;

  const responderSystem = `
You are a helpful AI assistant.
Respond in natural language.
Do NOT return JSON.
Be clear, concise, and conversational.
`;

  const systemInstructions =
    mode === "router" ? routerSystem : responderSystem;

  const historyText = history
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const finalPrompt = `
${systemInstructions}

Conversation so far:
${historyText}

USER:
${prompt}
`;

  const res = await window.puter.ai.chat(finalPrompt);
  return res?.message?.content ?? "";
}
