import express from "express";
import { githubCapabilities } from "../capabilities/githubCapabilities.js";
import { fileCapabilities } from "../capabilities/fileCapabilities.js";
import { generateResponse } from "../services/geminiService.js";


const router = express.Router();

function normalizeRepoName(name = "") {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "");
}


router.post("/", async (req, res) => {
    console.log("---- /ask HIT ----");
  console.log("BODY:", JSON.stringify(req.body, null, 2));
  console.log("COOKIES:", req.cookies);
  const {
  action,
  tool,
  parameters = {}
} = req.body;

// 🔁 Resolve action name
const resolvedAction = action || tool;

// 🔁 Resolve parameters (flat OR nested)
const name =
  req.body.name ??
  parameters.name;

const description =
  req.body.description ??
  parameters.description;

const isPrivate =
  req.body.private ??
  parameters.private;

const initialize_with_readme =
  req.body.initialize_with_readme ??
  parameters.initialize_with_readme;

const gitignore_template =
  req.body.gitignore_template ??
  parameters.gitignore_template;

const license_template =
  req.body.license_template ??
  parameters.license_template;

const has_issues =
  req.body.has_issues ??
  parameters.has_issues;

const has_projects =
  req.body.has_projects ??
  parameters.has_projects;

const has_wiki =
  req.body.has_wiki ??
  parameters.has_wiki;



  const token = req.cookies.github_token;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Missing GitHub token"
    });
  }

  // 🔒 Capability enforcement
  if (!githubCapabilities[resolvedAction] && !fileCapabilities[resolvedAction]) {
    return res.status(400).json({
      success: false,
      error: `Unsupported action: ${resolvedAction}`
    });
  }

  try {
    let result;

    if (resolvedAction === "list_github_repos") {
  const response = await fetch(
    "http://localhost:5000/api/actions/list-github-repos",
    {
      headers: {
        "X-User-Id": req.userId,
        "X-Github-Token": token
      }
    }
  );

  if (!response.ok) {
  const errorBody = await response.json();
  throw new Error(
    errorBody.error ||
    errorBody.message ||
    "Failed to list GitHub repositories"
  );
}

  const repos = await response.json();

  const aiText = await generateResponse({
    action: "list_github_repos",
    toolResult: {
      source: "github",
      count: repos.length,
      repos
    }
  });

  return res.json({
  success: true,
  aiResponse: aiText,
  data: {
    type: "github_repos",
    repos
  }
});

}



    if (resolvedAction === "create_repo") {

  // 🔴 Missing name → ask question
  if (!name) {
    const aiText = await generateResponse({
      mode: "clarification",
      userInput: "create repo",
      action: "create_repo",
      missing: ["name"]
    });

    return res.json({
      success: false,
      needsInput: true,
      aiResponse: aiText,
      pendingAction: "create_repo"
    });
  }

  // 🟢 Create repo
  const repoName = normalizeRepoName(name);

  const response = await fetch(
  "http://localhost:5000/api/actions/create-repo"
,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": req.userId,
      "X-Session-Id": req.sessionId,
      "X-Github-Token": token
    },
    body: JSON.stringify({
      name: repoName,
      description,
      private: Boolean(isPrivate),
      initialize_with_readme,
      gitignore_template,
      license_template
    })
  }
);

if (!response.ok) {
  const errorBody = await response.json();
  throw new Error(
    errorBody.error ||
    errorBody.message ||
    "Create repository failed"
  );
}

const result = await response.json();

  // 🧠 ✅ CALL GEMINI AFTER TOOL EXECUTION
  const aiText = await generateResponse({
    mode: "action",
    userInput: `create repo ${repoName}`,
    action: "create_repo",
    toolResult: {
      name: result.name,
      url: result.html_url,
      private: result.private,
      description: result.description
    }
  });

  // ✅ Send conversational reply (not raw JSON)
  return res.json({
    success: true,
    aiResponse: aiText
  });
}

if (resolvedAction === "update_repo") {
  const { name, private: isPrivate, add_readme } = req.body.parameters || {};

  // If repo name is missing, ask clarification
  if (!name) {
    const aiText = await generateResponse({
      mode: "clarification",
      action: "update_repo",
      missing: ["repository name"]
    });

    return res.json({
      success: false,
      needsInput: true,
      pendingAction: "update_repo",
      aiResponse: aiText
    });
  }

  const response = await fetch(
    "http://localhost:5000/api/actions/update-repo",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": req.userId,
        "X-Github-Token": token
      },
      body: JSON.stringify({
        name,
        private: isPrivate,
        add_readme
      })
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || error.message || "Update repo failed");
  }

  const result = await response.json();

  return res.json({
    success: true,
    aiResponse: await generateResponse({
      mode: "action",
      action: "update_repo",
      toolResult: {
      name: result.name,
      url: result.html_url,
      changed: {
        private: typeof isPrivate === "boolean" ? isPrivate : undefined,
        add_readme: add_readme === true ? true : undefined
      }
}

    })
  });
}


    if (resolvedAction === "rename_repo") {

  // 1️⃣ Extract explicit parameters FIRST (highest priority)
  let oldName =
    req.body.old_name ??
    req.body.current_name ??
    req.body.repo_name ??
    req.body.parameters?.old_name ??
    req.body.parameters?.current_name ??
    req.body.parameters?.repo_name ??
    null;

  let newName =
    req.body.new_name ??
    req.body.parameters?.new_name ??
    null;

  // 2️⃣ Read continuation ONLY IF something is missing
  const continuation =
    (!oldName || !newName)
      ? req.body.parameters?._continuation ??
        req.body.parameters?.user_input
      : null;

  // 3️⃣ Smart parsing (SAFE, NON-GREEDY)
  if (continuation) {

    // Case 1: "change X to Y" / "rename X to Y"
    const renameMatch =
      continuation.match(/(?:change|rename)\s+(\S+)\s+to\s+(\S+)/i);

    if (renameMatch) {
      oldName ??= renameMatch[1];
      newName ??= renameMatch[2];
    }

    // Case 2: user just typed the new name (e.g. "mcp22")
    else if (oldName && !newName) {
      const candidate = continuation.trim();

      // repo names must be single token
      if (/^[\w.-]+$/.test(candidate)) {
        newName = candidate;
      }
    }
  }

  // 4️⃣ Ask clarification ONLY if truly missing
  if (!oldName || !newName) {
    const aiText = await generateResponse({
      mode: "clarification",
      action: "rename_repo",
      missing: [
        !oldName && "current repository name",
        !newName && "new repository name"
      ].filter(Boolean)
    });

    return res.json({
      success: false,
      needsInput: true,
      pendingAction: "rename_repo",
      aiResponse: aiText
    });
  }

  // 5️⃣ Normalize names (MANDATORY)
  const normalizedOld = normalizeRepoName(oldName);
  const normalizedNew = normalizeRepoName(newName);

  if (normalizedOld === normalizedNew) {
    throw new Error(
      "New repository name must be different from the current name."
    );
  }

  // 6️⃣ Call backend action
  const response = await fetch(
    "http://localhost:5000/api/actions/rename-repo",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": req.userId,
        "X-Github-Token": token
      },
      body: JSON.stringify({
        oldName: normalizedOld,
        newName: normalizedNew
      })
    }
  );

  if (!response.ok) {
    const errorBody = await response.json();
    throw new Error(
      errorBody.error ||
      errorBody.message ||
      "Rename repository failed"
    );
  }

  const result = await response.json();

  // 7️⃣ Success response (NO LOOP)
  return res.json({
    success: true,
    aiResponse: await generateResponse({
      mode: "action",
      action: "rename_repo",
      toolResult: {
        old: normalizedOld,
        new: result.name,
        url: result.html_url
      }
    })
  });
}

if (resolvedAction === "delete_repo") {
  const repoName = parameters.name;

  if (!repoName) {
    return res.json({
      success: false,
      needsInput: true,
      aiResponse: "Please provide the repository name to delete.",
      pendingAction: "delete_repo"
    });
  }

  const response = await fetch(
    "http://localhost:5000/api/actions/delete-repo",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": req.userId,
        "X-Github-Token": token
      },
      body: JSON.stringify({ name: repoName })
    }
  );

  const result = await response.json();

  const aiText = await generateResponse({
    mode: "action",
    action: "delete_repo",
    toolResult: result
  });

  return res.json({ success: true, aiResponse: aiText });
}

const backendHeaders = {
  "Content-Type": "application/json",
  "X-User-Id": req.userId,      // This solves your "Missing Identity" error
  "X-Github-Token": token       // Useful if backend needs to check repo permissions
};

    if (resolvedAction === "list_files") {
  const path = req.body.path ?? parameters.path ?? ".";

  const response = await fetch("http://localhost:5000/api/files/list", {
    method: "POST",
    headers: backendHeaders,
    body: JSON.stringify({ path, workspaceId: req.workspaceId })
  });

  const files = await response.json();

  const aiText = await generateResponse({
    mode: "file",
    action: "list_files",
    toolResult: files
  });

  return res.json({ success: true, aiResponse: aiText });
}

    // 2️⃣ READ FILE
if (resolvedAction === "read_file") {
    const filePath = req.body.path ?? parameters.path;

    if (!filePath) {
      const aiText = await generateResponse({ mode: "clarification", action: "read_file", missing: ["file path"] });
      return res.json({ success: false, needsInput: true, aiResponse: aiText, pendingAction: "read_file" });
    }

    const response = await fetch("http://localhost:5000/api/files/read", {
      method: "POST",
      headers: backendHeaders,
      body: JSON.stringify({ path: filePath })
    });

    // 1. Get the raw data as 'result'
    const result = await response.json();

    // 2. Check if the backend returned an error (like 404 Not Found)
    if (!response.ok) {
      const errorText = await generateResponse({ 
        mode: "error", 
        action: "read_file", 
        errorMessage: result.error || "File not found" 
      });
      return res.json({ success: false, aiResponse: errorText });
    }

    // 3. Generate AI explanation of the content
    const aiText = await generateResponse({
      mode: "file",
      action: "read_file",
      toolResult: result.content
    });

    // 4. Return everything to the frontend
    return res.json({ 
      success: true, 
      aiResponse: aiText,
      editorData: {
        path: filePath,
        content: result.content, // Now 'result' is defined!
        hash: result.doc?.hash   // Safe navigation in case doc is missing
      }
    });
}

    // 3️⃣ WRITE FILE (With Conflict Handling)
if (resolvedAction === "write_file") {
  const filePath = req.body.path ?? parameters.path;
  const content = req.body.content ?? parameters.content;
  const incomingHash = req.body.hash ?? parameters.hash; // Optional: provided by UI

  if (!filePath || !content) {
    const aiText = await generateResponse({
      mode: "clarification",
      action: "write_file",
      missing: [!filePath && "file path", !content && "file content"].filter(Boolean)
    });
    return res.json({ success: false, needsInput: true, aiResponse: aiText, pendingAction: "write_file" });
  }

  const response = await fetch("http://localhost:5000/api/files/write", {
    method: "POST",
    headers: backendHeaders,
    body: JSON.stringify({ 
      path: filePath, 
      content, 
      incomingHash, 
      workspaceId: req.workspaceId 
    })
  });

  // Handle 409 Conflict from Backend
  if (response.status === 409) {
    const conflictData = await response.json();
    return res.json({
      success: false,
      error: "CONFLICT",
      aiResponse: "I couldn't save the file because it was modified elsewhere. Would you like me to force the update or show you the changes?"
    });
  }

  const result = await response.json(); // This is the updated File document

  const aiText = await generateResponse({
    mode: "file",
    action: "write_file",
    toolResult: result.doc
  });

  return res.json({ success: true, aiResponse: aiText });
}


    // 4️⃣ UPLOAD FILE
if (resolvedAction === "upload_file") {
  const filename = req.body.filename ?? parameters.filename;
  const content_base64 = req.body.content_base64 ?? parameters.content_base64;

  if (!filename || !content_base64) {
    const aiText = await generateResponse({ mode: "clarification", action: "upload_file", missing: ["filename and content"] });
    return res.json({ success: false, needsInput: true, aiResponse: aiText, pendingAction: "upload_file" });
  }

  const response = await fetch("http://localhost:5000/api/files/upload", {
    method: "POST",
    headers: backendHeaders,
    body: JSON.stringify({ filename, content_base64, workspaceId: req.workspaceId })
  });

  const result = await response.json();

  const aiText = await generateResponse({
    mode: "file",
    action: "upload_file",
    toolResult: result
  });

  return res.json({ success: true, aiResponse: aiText });
}

 //BRANCH ACTION

if (resolvedAction === "create_branch") {
    const repo = req.body.repo ?? parameters.repo;
    const branchName = req.body.name ?? parameters.name;
    const source = req.body.source ?? parameters.source ?? "main";

    // 🔴 Clarification
    if (!repo || !branchName) {
      const aiText = await generateResponse({
        mode: "clarification",
        action: "create_branch",
        missing: [!repo && "repository name", !branchName && "new branch name"].filter(Boolean)
      });
      return res.json({ success: false, needsInput: true, aiResponse: aiText, pendingAction: "create_branch" });
    }

  // 🟢 Execute
    const response = await fetch("http://localhost:5000/api/actions/create-branch", {
      method: "POST",
      headers: backendHeaders,
      body: JSON.stringify({ repo, name: branchName, source })
    });

    const result = await response.json();
    
    if (!response.ok) throw new Error(result.error || "Branch creation failed");

    const aiText = await generateResponse({
      mode: "action",
      action: "create_branch",
      toolResult: result
    });

    return res.json({ success: true, aiResponse: aiText });
  }

  // 🌿 LIST BRANCHES
    if (resolvedAction === "list_branch") {
      const repo = req.body.repo ?? parameters.repo;

      if (!repo) {
        const aiText = await generateResponse({ mode: "clarification", action: "list_branch", missing: ["repo name"] });
        return res.json({ success: false, needsInput: true, aiResponse: aiText, pendingAction: "list_branch" });
      }

      const response = await fetch(`http://localhost:5000/api/actions/list-branches/${repo}`, {
        method: "GET",
        headers: backendHeaders
      });

      const result = await response.json();
      const aiText = await generateResponse({
        mode: "action",
        action: "list_branch",
        toolResult: result.branches 
      });

      return res.json({ success: true, aiResponse: aiText });
    }

// 🔄 SWITCH BRANCH
    if (resolvedAction === "switch_branch") {
      const repo = req.body.repo ?? parameters.repo;
      const branchName = req.body.name ?? parameters.name;

      if (!repo || !branchName) {
        const aiText = await generateResponse({ mode: "clarification", action: "switch_branch", missing: [!repo && "repo", !branchName && "branch name"].filter(Boolean) });
        return res.json({ success: false, needsInput: true, aiResponse: aiText, pendingAction: "switch_branch" });
      }

      const response = await fetch("http://localhost:5000/api/actions/switch-branch", {
        method: "POST",
        headers: backendHeaders,
        body: JSON.stringify({ repo, name: branchName })
      });

      const result = await response.json();
      const aiText = await generateResponse({
        mode: "action",
        action: "switch_branch",
        toolResult: result
      });

      return res.json({ success: true, aiResponse: aiText });
    }
 
    return res.status(400).json({
      success: false,
      error: "Action not implemented"
    });

  } catch (err) {
  console.error("File/Git error:", err.message);

  const aiText = await generateResponse({
    mode: "error",
    action: resolvedAction,
    errorMessage: err.message
  });

  return res.status(500).json({
    success: false,
    aiResponse: aiText
  });
}

}
);

export default router;
