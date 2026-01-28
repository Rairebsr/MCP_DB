import { GoogleGenAI } from "@google/genai";

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

  const ACTION_DESCRIPTIONS = {
  create_repo: "create a new GitHub repository",
  rename_repo: "rename an existing GitHub repository",
  delete_repo: "delete a GitHub repository",
  read_file: "read a file from the workspace",
  write_file: "write content to a file",
  upload_file: "upload a file to the workspace",
  list_github_repos: "list GitHub repositories"
};


  // 🔴 Clarification (works for Git + Files)
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

"What file would you like me to read?
You can also specify a folder if needed."
`;

  }

  // 🟢 File result mode (THIS fixes file issues)
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

  // 🔵 Normal action result (Git, etc.)
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
- Respond clearly and naturally
- Confirm the result
- Do NOT ask follow-up questions
`;
  }
  

  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ parts: [{ text: prompt }] }],
  });

  return result.candidates[0].content.parts[0].text
  ?? "Something went wrong, but I couldn’t generate a response.";
}
