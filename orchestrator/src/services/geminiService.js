import { GoogleGenAI } from "@google/genai";
import "dotenv/config"; // ✅ Added to ensure API key works

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateResponse({
  mode = "action",          // "clarification" | "action" | "file" | "error"
  userInput,
  action,
  toolResult,
  errorMessage,
  missing = []
}) {
  let prompt = "";

  // ✅ COMPLETE List of actions matching your Agent.js
  const ACTION_DESCRIPTIONS = {
    create_repo: "create a new GitHub repository",
    rename_repo: "rename an existing GitHub repository",
    delete_repo: "delete a GitHub repository",
    update_repo: "update repository settings (like visibility or README)",
    repo_exists: "check if a repository exists",
    list_github_repos: "list GitHub repositories",
    clone_repo: "clone a GitHub repository",
    push_repo: "push changes to GitHub",
    pull_repo: "pull changes from GitHub",
    create_branch: "create a new branch in a repository",
    switch_branch: "switch to a different branch in a repository",  
    read_file: "read a file from the workspace",
    write_file: "write content to a file or create a new file",
    upload_file: "upload a file to the workspace",
    delete_file: "delete a file from the workspace",
    list_files: "list files in the workspace",
    get_file_content: "get the content of a specific file",
    get_repo_info: "get information about a repository (like branches, commits, etc.)",
    create_pull_request: "create a new GitHub pull request",
    list_pull_requests: "list open pull requests for a repository",
    merge_pull_request: "merge a pull request into the target branch",
    get_pull_request_diff: "view the code changes in a pull request",
    list_branches: "list all local and remote branches",
    delete_branch: "delete a branch from the repository",
    list_commits: "view the commit history",
  };
  //list branch and commit 

  if ((action === "list_branches" || action === "list_commits") && mode === "action") {
    prompt = `
You are a helpful Git assistant for DevMind.
The system successfully retrieved ${action === "list_branches" ? "branches" : "commits"}.

Result Data:
${JSON.stringify(toolResult)}

Instructions for ${action}:
${action === 'list_branches' ? `
- Identify the "current" branch and clearly state it.
- Mention how many total branches were found.
- List a few other available branches.
- Example: "You have 5 branches. You're currently on 'main', but 'dev' and 'feature-ui' are also available."` 
: `
- Summarize the most recent 3-5 commits only.
- Use a "Timeline" style: [Message] by [Author] on [Date].
- Keep it concise and skip the technical hashes.`}

Rules:
- Be natural and friendly.
- Do NOT return raw JSON.
`;
  }
  // 🟣 PR LIST MODE (Specific for rendering summaries)
  if (action === "list_pull_requests" && mode === "action") {
    prompt = `
You are a development assistant for DevMind.
The user requested a list of pull requests.

Result Data:
${JSON.stringify(toolResult)}

Rules:
- Summarize how many PRs were found.
- Mention 1 or 2 titles of the most recent PRs.
- State that the full list is available in the interactive cards below.
- Keep it professional and helpful.
`;
  }

  // 🔴 Clarification
  if (mode === "clarification") {
    prompt = `
You are a helpful assistant in an ongoing conversation.

The user wants to ${ACTION_DESCRIPTIONS[action] || action}.

The following required information is missing:
${missing.join(", ")}

Instructions:
- Ask for the required information first.
- Then briefly mention that optional settings can be customized if the user wants.
- Do NOT force optional settings.
- Ask everything in ONE natural, friendly message.
- Do NOT mention internal parameters, tools, or system logic.

Examples:
"What would you like to name the repository?
If you want, you can also tell me whether it should be private, include a README, or add a description."
`;
  }

  // 🟢 File result mode
  // 🟢 File Result Mode (Revised to avoid clashing)
else if (mode === "file") {
  // 🔍 Check if it's a PR action
  if (action === "get_pull_request_diff" || action === "review_pull_request") {
    prompt = `
You are a coding assistant. 
The user is specifically reviewing code changes (diff) for a Pull Request.

Action: ${action}
Diff Data: ${JSON.stringify(toolResult)}

Rules:
1. Summarize the changes: which files were added, deleted, or modified?
2. Explain the technical impact: how do these changes affect the logic?
3. Mention any potential bugs or improvements if you see them.
4. Do NOT return JSON.
`;
  } 
  // 🔍 Standard File Actions (Keep your original logic here)
  else {
    prompt = `
You are a helpful assistant.
A file operation has completed successfully.

Action: ${action}
Result: ${JSON.stringify(toolResult)}

Rules:
- Explain what happened in simple language.
- If it's a list of files, present them neatly.
- If it's the content of a file, show it clearly.
`;
  }
}

  // 🟠 Merge Conflict Mode (Specific Error)
  // ❗ CRITICAL: This must be BEFORE the generic error block
  // 🟠 Merge Conflict Mode (Updated for Pull/Push)
  else if (mode === "error" && errorMessage && (errorMessage.includes("MERGE_CONFLICT") || errorMessage.includes("CONFLICT"))) {
    prompt = `
You are a coding assistant. 
A Git conflict occurred during a ${action === 'pull_repo' ? 'PULL' : 'PUSH'}.

Conflicted Files: ${JSON.stringify(toolResult || errorMessage)}

Your goal:
1. Explain that changes from GitHub and local changes crashed into each other.
2. List the conflicted files.
3. Suggest two options: 
   - Option A: They can fix the markers (<<<<<<< HEAD) manually.
   - Option B: They can simply ask YOU to "Resolve the conflicts using AI".
`;
  }

  // 🔴 Generic Error Mode
  else if (mode === "error") {
    prompt = `
You are a helpful assistant.

The user tried to perform this action:
${action}

But an error occurred:
${errorMessage}

Rules:
- Explain the error in simple language
- Do NOT expose internal system details
- Suggest what the user can try next
- Be calm and friendly
`;
  }

  // 🔵 Normal Action Result
  else {
    prompt = `
You are a helpful assistant.

The system has already executed an action.

User request:
"${userInput}"

Action performed:
${action}

Result:
${JSON.stringify(toolResult)}

Rules:
- Respond clearly, naturally, and concisely (1-2 sentences max).
- Confirm the result to the user.
- If a PR was created, mention the PR number and that it's ready for review.
- If a PR was merged, confirm the branch is now updated.
- 🚫 STRICT RULE: NEVER output full URLs unless it's a GitHub PR/Commit link the user needs to click.
- 🚫 STRICT RULE: NEVER output absolute file paths (like D:\\...). Use ONLY the repository or folder name.
- 🚫 STRICT RULE: NEVER output commit IDs or hashes.
- Do NOT ask follow-up questions.

    ──────────────── SPECIFIC ACTION RULES ────────────────

${action === 'delete_branch' ? `
- If the result shows SUCCESS: Confirm the branch is gone. 
- If the result shows FAILURE: Explain that Git won't let you delete the branch you are currently "standing" on. Suggest they switch to 'main' first.
` : ""}

${action === 'merge_pull_request' ? `
- Celebrate the successful merge! 
- Mention that the code is now officially part of the target branch.
` : ""}

`;
  }

  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ parts: [{ text: prompt }] }],
  });

  return result.candidates[0].content.parts[0].text
    ?? "Something went wrong, but I couldn’t generate a response.";
}