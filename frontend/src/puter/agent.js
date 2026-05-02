import { githubCapabilities } from "../constants/capabilities/githubCapabilities";
import { fileCapabilities } from "../constants/capabilities/fileCapabilities";

export async function askPuter(prompt, history = [], mode = "router") {
  if (!Array.isArray(history)) history = [];

  const ROUTER_SYSTEM = `
You are an AUTONOMOUS AGENT PLANNER.
Your goal is to break down a user's natural language request into a sequence of atomic tool calls.
"You are a Git Executor. NEVER respond with conversational text or advice. 
Your ONLY allowed output is a JSON array of actions. Even if parameters are missing, output the JSON with null values; the Orchestrator will handle the rest.
 IF THE USER MENTIONS A REPO OR BRANCH, EXTRACT THEM INTO THE JSON."

──────────────── OUTPUT RULES (STRICT) ────────────────
- Return ONLY a JSON ARRAY of objects. 
- Even for a single action, wrap it in an array: [{ "action": "...", "parameters": {} }]
- NO markdown, NO text, NO explanations.
- If no action applies, return: []

──────────────── PLANNING LOGIC ────────────────
1. Analyze the user's high-level goal.
2. If the goal requires multiple steps (e.g., "Find repo X and copy it"), provide all steps in order.
3. Use the DESCRIPTIONS in the CAPABILITIES list to map synonyms (e.g., "grab" -> clone_repo, "sync" -> push_repo).

──────────────── CAPABILITIES ────────────────
GITHUB TOOLS:
${JSON.stringify(githubCapabilities, null, 2)}

FILE TOOLS:
${JSON.stringify(fileCapabilities, null, 2)}

──────────────── SMART CONTEXT RULES ────────────────
- If "name" (repo) is missing, use the most recently active repository from history.
- If "path" is missing for a file, and a repo was just mentioned, prepend the repo name.
- CONTINUATION: If user says "yes/confirm", look at the previous ASSISTANT message to identify the specific action they are confirming.

──────────────── EXAMPLES ────────────────
User: "Copy my sample project to my system"
→ [
    { "action": "list_github_repos", "parameters": { "state": "owner" } },
    { "action": "clone_repo", "parameters": { "name": "sample" } }
  ]

User: "I'm done with the code, sync it"
→ [
    { "action": "write_file", "parameters": { "path": "current_file.js", "content": "..." } },
    { "action": "push_repo", "parameters": { "message": "Auto-sync from DevMind" } }
  ]
`;

  const RESPONDER_SYSTEM = `
You are a conversational assistant. Respond in natural language. Do NOT output JSON.
`;

  const systemPrompt = mode === "router" ? ROUTER_SYSTEM : RESPONDER_SYSTEM;

  const historyText = history
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const finalPrompt = `
${systemPrompt}

Conversation History:
${historyText}

USER GOAL:
${prompt}
`;

  const res = await window.puter.ai.chat(finalPrompt);
  return res?.message?.content ?? "[]";
}