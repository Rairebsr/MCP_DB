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
<<<<<<< HEAD
    create_branch: "create a new branch in a repository",
    switch_branch: "switch to a different branch in a repository",  
    read_file: "read a file from the workspace",
    write_file: "write content to a file or create a new file",
    upload_file: "upload a file to the workspace",
    delete_file: "delete a file from the workspace",
    list_files: "list files in the workspace",
    get_file_content: "get the content of a specific file",
    get_repo_info: "get information about a repository (like branches, commits, etc.)",
=======
    read_file: "read a file from the workspace",
    write_file: "write content to a file or create a new file",
    upload_file: "upload a file to the workspace"
>>>>>>> 645c2407935ab29c8db1fba7084f1d301267d81f
  };

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
  else if (mode === "file") {
    prompt = `
You are a helpful assistant.

A file operation has completed successfully.

Action:
${action}

Result:
${JSON.stringify(toolResult)}

Rules:
- Explain what happened in simple language
- If the result contains text content, show it clearly
- If the result is a list, present it neatly
- Do NOT ask follow-up questions
- Do NOT return JSON
`;
  }

  // 🟠 Merge Conflict Mode (Specific Error)
  // ❗ CRITICAL: This must be BEFORE the generic error block
  else if (mode === "error" && errorMessage && errorMessage.includes("MERGE_CONFLICT")) {
    prompt = `
You are a coding assistant. 
The user tried to push code, but a GIT MERGE CONFLICT occurred.

Conflicted Files: ${JSON.stringify(toolResult || errorMessage)}

Your goal:
1. Apologize briefly.
2. List the files that are in conflict.
3. Tell the user they can open the file, look for "<<<<<<< HEAD", fix it, and then ask you to "continue push".
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
<<<<<<< HEAD
- Respond clearly, naturally, and concisely (1-2 sentences max).
- Confirm the result to the user.
- 🚫 STRICT RULE: NEVER output absolute file paths (like D:\\...). Use ONLY the repository or folder name.
- 🚫 STRICT RULE: NEVER output commit IDs or hashes.
- Do NOT ask follow-up questions.
=======
- Respond clearly and naturally
- Confirm the result
- Do NOT ask follow-up questions
>>>>>>> 645c2407935ab29c8db1fba7084f1d301267d81f
`;
  }

  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ parts: [{ text: prompt }] }],
  });

  return result.candidates[0].content.parts[0].text
    ?? "Something went wrong, but I couldn’t generate a response.";
}