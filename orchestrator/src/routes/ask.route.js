import express from "express";
import path from "path";
import fs from "fs/promises";

// Internal Orchestrator Imports
import { githubCapabilities } from "../capabilities/githubCapabilities.js";
import { fileCapabilities } from "../capabilities/fileCapabilities.js";
import { generateResponse } from "../services/geminiService.js";

// External Backend Imports (Going up 3 levels: routes -> src -> orchestrator -> ROOT -> backend)
import { listRepos } from "../../../backend/services/github.service.js";
import { cloneRepo, ensureGitIdentity, smartPush } from "../../../backend/services/git.service.js";
import Repo from "../../../backend/models/Repo.js";
import PendingAction from "../../../backend/models/PendingAction.js"; 
import Workspace from "../../../backend/models/Workspace.js";

const router = express.Router();

function normalizeRepoName(name = "") {
  return name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");
}

router.post("/", async (req, res) => {
  console.log("---- /ask HIT ----");
  console.log("BODY:", JSON.stringify(req.body, null, 2));

  const { action, tool, parameters = {} } = req.body;
  const resolvedAction = action || tool;

  // Common Parameters extraction
  const name = req.body.name ?? parameters.name;
  const description = req.body.description ?? parameters.description;
  const isPrivate = req.body.private ?? parameters.private;
  const initialize_with_readme = req.body.initialize_with_readme ?? parameters.initialize_with_readme;

  const token = req.cookies.github_token;

  if (!token) {
    return res.status(401).json({ success: false, error: "Missing GitHub token" });
  }

  // Capability enforcement
  if (!githubCapabilities[resolvedAction] && !fileCapabilities[resolvedAction]) {
    return res.status(400).json({ success: false, error: `Unsupported action: ${resolvedAction}` });
  }

  // Common Headers for backend calls
  const backendHeaders = {
    "Content-Type": "application/json",
    "X-User-Id": req.userId,
    "X-Github-Token": token
  };

  try {
    // ------------------------------------------------------------------
    // 1️⃣ LIST GITHUB REPOS
    // ------------------------------------------------------------------
    if (resolvedAction === "list_github_repos") {
      const response = await fetch("http://localhost:5000/api/actions/list-github-repos", {
        headers: { "X-User-Id": req.userId, "X-Github-Token": token }
      });

      if (!response.ok) throw new Error("Failed to list GitHub repositories");
      const repos = await response.json();

      const aiText = await generateResponse({
        action: "list_github_repos",
        toolResult: { source: "github", count: repos.length, repos }
      });

      return res.json({ success: true, aiResponse: aiText, data: { type: "github_repos", repos } });
    }

    // ------------------------------------------------------------------
    // 2️⃣ CREATE REPO
    // ------------------------------------------------------------------
    if (resolvedAction === "create_repo") {
      if (!name) {
        const aiText = await generateResponse({ mode: "clarification", userInput: "create repo", action: "create_repo", missing: ["name"] });
        return res.json({ success: false, needsInput: true, aiResponse: aiText, pendingAction: "create_repo" });
      }

      const repoName = normalizeRepoName(name);
      const response = await fetch("http://localhost:5000/api/actions/create-repo", {
        method: "POST",
        headers: { ...backendHeaders, "X-Session-Id": req.sessionId },
        body: JSON.stringify({ name: repoName, description, private: Boolean(isPrivate), initialize_with_readme })
      });

      if (!response.ok) throw new Error("Create repository failed");
      const result = await response.json();

      const aiText = await generateResponse({
        mode: "action",
        userInput: `create repo ${repoName}`,
        action: "create_repo",
        toolResult: { name: result.name, url: result.html_url, private: result.private }
      });

      return res.json({ success: true, aiResponse: aiText });
    }

    // ------------------------------------------------------------------
    // 3️⃣ UPDATE REPO
    // ------------------------------------------------------------------
    if (resolvedAction === "update_repo") {
      const { name, private: isPrivate, add_readme } = req.body.parameters || {};

      if (!name) {
        const aiText = await generateResponse({ mode: "clarification", action: "update_repo", missing: ["repository name"] });
        return res.json({ success: false, needsInput: true, pendingAction: "update_repo", aiResponse: aiText });
      }

      const response = await fetch("http://localhost:5000/api/actions/update-repo", {
        method: "POST",
        headers: backendHeaders,
        body: JSON.stringify({ name, private: isPrivate, add_readme })
      });

      if (!response.ok) throw new Error("Update repo failed");
      const result = await response.json();

      return res.json({
        success: true,
        aiResponse: await generateResponse({
          mode: "action",
          action: "update_repo",
          toolResult: { name: result.name, url: result.html_url, changed: { private: isPrivate, add_readme } }
        })
      });
    }

    // ------------------------------------------------------------------
    // 4️⃣ CLONE REPO (Smart Lookup)
    // ------------------------------------------------------------------
    if (resolvedAction === "clone_repo") {
      let repoUrl = req.body.repo_url ?? parameters.repo_url ?? parameters.url;
      let targetName = req.body.local_path ?? parameters.local_path ?? parameters.name ?? parameters.repository;

      // Smart Lookup: Name provided but no URL? Find it.
      if (!repoUrl && targetName) {
        try {
          console.log(`🔍 Looking up URL for repo: ${targetName}...`);
          const repos = await listRepos(token);
          const normalize = (s) => s.toLowerCase().replace(/[\s-]/g, "");
          const searchName = normalize(targetName);
          const foundRepo = repos.find(r => normalize(r.name) === searchName);

          if (foundRepo) {
            repoUrl = foundRepo.clone_url;
            console.log(`✅ Found repo URL: ${repoUrl}`);
          }
        } catch (err) {
          console.warn("Failed to auto-lookup repo URL:", err.message);
        }
      }

      if (!repoUrl) {
        const aiText = await generateResponse({ mode: "clarification", action: "clone_repo", missing: ["repository URL"] });
        return res.json({ success: false, needsInput: true, pendingAction: "clone_repo", aiResponse: aiText });
      }

      const result = await cloneRepo(repoUrl, targetName, token);

      const aiText = await generateResponse({
        mode: "action",
        action: "clone_repo",
        userInput: `cloned ${repoUrl}`,
        toolResult: { status: "Cloned successfully", path: result.localPath }
      });

      return res.json({ success: true, aiResponse: aiText });
    }

    // ------------------------------------------------------------------
    // 5️⃣ GIT PUSH (DB OPTIMIZED)
    // ------------------------------------------------------------------
    // ------------------------------------------------------------------
    // 5️⃣ GIT PUSH (DB OPTIMIZED + TYPO IMMUNE)
    // ------------------------------------------------------------------
    if (resolvedAction === "push_repo") {
      const message = req.body.message ?? parameters.message ?? "Update from AI";
      let repoName = req.body.name ?? parameters.name ?? parameters.repository;

      const ROOT_WORKSPACE = path.resolve(process.cwd(), "..", "mcp_workspace");
      let workspacePath = null;
      let repoDoc = null;

      // 🧠 Helper to strip dashes, underscores, and spaces for fuzzy matching
      const normalizeForSearch = (str) => str ? str.toLowerCase().replace(/[-_\s]/g, "") : "";
      const searchName = normalizeForSearch(repoName);

      // ⚡ OPTIMIZATION 1: Try finding path via DB (Instant & Fuzzy Match)
      const workspace = await Workspace.findOne({ userId: req.userId });
      if (workspace) {
         if (searchName) {
            // Find all repos for this user and fuzzy match the path
            const allRepos = await Repo.find({ workspaceId: workspace._id });
            repoDoc = allRepos.find(r => normalizeForSearch(r.localPath).includes(searchName));
         } else if (workspace.activeRepoId) {
            repoDoc = await Repo.findById(workspace.activeRepoId);
         }
      }

      // If found in DB, use that path. If not, fallback to FS scan.
      if (repoDoc) {
        // 🔥 THE FIX: Ignore the DB's virtual path and force the absolute local path
        const actualFolderName = repoName || repoDoc.url.split('/').pop().replace('.git', '');
        workspacePath = path.resolve(ROOT_WORKSPACE, actualFolderName);
      } else {
        // Fallback: Scan file system (Slower)
        try {
            const items = await fs.readdir(ROOT_WORKSPACE, { withFileTypes: true });
            const gitRepos = [];
            for (const item of items) {
                if (item.isDirectory()) {
                    try { await fs.access(path.join(ROOT_WORKSPACE, item.name, ".git")); gitRepos.push(item.name); } catch (e) {}
                }
            }
            
            // ✅ THE FIX: Fuzzy File System Matching
            if (searchName) {
                const matchedRepo = gitRepos.find(r => normalizeForSearch(r) === searchName);
                if (matchedRepo) {
                    workspacePath = path.resolve(ROOT_WORKSPACE, matchedRepo);
                }
            } 
            
            // If still no match, handle the ambiguity
            if (!workspacePath) {
              if (!repoName && gitRepos.length === 1) {
                  repoName = gitRepos[0];
                  workspacePath = path.resolve(ROOT_WORKSPACE, repoName);
              } else if (!repoName && gitRepos.length > 1) {
                   const aiText = await generateResponse({ 
                       mode: "clarification", 
                       action: "push_repo", 
                       missing: [`which repository to push. I found multiple: ${gitRepos.join(", ")}`] 
                   });
                   return res.json({ success: false, needsInput: true, pendingAction: "push_repo", aiResponse: aiText });
              }
            }
        } catch (err) {}
      }

      // 🚨 THE SAFETY NET: If repo is STILL not found after fuzzy matching
      if (!workspacePath) {
        const aiText = await generateResponse({ 
            mode: "error", 
            action: "push_repo", 
            errorMessage: `I couldn't find a repository named '${repoName}'. Please check the spelling or clone it first.` 
        });
        return res.status(400).json({ success: false, error: "Repository not found", aiResponse: aiText });
      }

      await ensureGitIdentity(workspacePath);
      const result = await smartPush(workspacePath, message);

      if (!result.success && result.error === "MERGE_CONFLICT") {
        // 💾 SAVE CONFLICT STATE (Persistence)
        if (workspace) {
            await PendingAction.create({
                workspaceId: workspace._id,
                type: "merge_conflict",
                stage: "resolution_needed",
                data: { files: result.conflictedFiles, repoPath: workspacePath }
            });
        }
        return res.json({
          success: false,
          error: "MERGE_CONFLICT",
          conflictedFiles: result.conflictedFiles,
          aiResponse: `I encountered a merge conflict in: ${result.conflictedFiles.join(", ")}. Please resolve them in the editor, then ask me to push again.`
        });
      }

      // ⚡ OPTIMIZATION 2: Update DB with new Commit Hash and dynamic branch
      if (repoDoc && result.commitHash) {
        await Repo.findByIdAndUpdate(repoDoc._id, {
            lastCommit: result.commitHash,
            branch: result.branch || "main"
        });
      }

      const aiText = await generateResponse({
        mode: "action",
        action: "push_repo",
        userInput: `pushed changes with message: "${message}"`,
        toolResult: { status: "Synced with GitHub", branch: result.branch || "main", commit: result.commitHash }
      });

      // Cleanup resolved conflicts
      if (workspace) await PendingAction.deleteMany({ workspaceId: workspace._id, type: "merge_conflict" });

      return res.json({ success: true, aiResponse: aiText });
    }

    // ------------------------------------------------------------------
    // 6️⃣ RENAME REPO
    // ------------------------------------------------------------------
    if (resolvedAction === "rename_repo") {
      let oldName = req.body.old_name ?? parameters.old_name ?? req.body.parameters?.current_name;
      let newName = req.body.new_name ?? parameters.new_name;

      // Handle continuation/smart parsing
      const continuation = (!oldName || !newName) ? (req.body.parameters?._continuation ?? req.body.parameters?.user_input) : null;
      if (continuation) {
        const renameMatch = continuation.match(/(?:change|rename)\s+(\S+)\s+to\s+(\S+)/i);
        if (renameMatch) {
            oldName ??= renameMatch[1];
            newName ??= renameMatch[2];
        } else if (oldName && !newName) {
            const candidate = continuation.trim();
            if (/^[\w.-]+$/.test(candidate)) newName = candidate;
        }
      }

      if (!oldName || !newName) {
        const aiText = await generateResponse({ mode: "clarification", action: "rename_repo", missing: ["current and new name"] });
        return res.json({ success: false, needsInput: true, pendingAction: "rename_repo", aiResponse: aiText });
      }

      const normalizedOld = normalizeRepoName(oldName);
      const normalizedNew = normalizeRepoName(newName);

      const response = await fetch("http://localhost:5000/api/actions/rename-repo", {
        method: "POST",
        headers: backendHeaders,
        body: JSON.stringify({ oldName: normalizedOld, newName: normalizedNew })
      });

      if (!response.ok) throw new Error("Rename failed");
      const result = await response.json();

      return res.json({
        success: true,
        aiResponse: await generateResponse({
          mode: "action",
          action: "rename_repo",
          toolResult: { old: normalizedOld, new: result.name, url: result.html_url }
        })
      });
    }

    // ------------------------------------------------------------------
    // 7️⃣ DELETE REPO (Human-In-The-Loop + Local Cleanup)
    // ------------------------------------------------------------------
    if (resolvedAction === "delete_repo") {
      const workspace = await Workspace.findOne({ userId: req.userId });

      // 1. Check if we are currently waiting for confirmation
      const pendingTask = workspace ? await PendingAction.findOne({ workspaceId: workspace._id, type: "delete_repo" }) : null;

      if (pendingTask) {
        // We are in the confirmation stage! 
        const continuationText = req.body.parameters?._continuation ?? req.body.parameters?.user_input ?? "";
        
        if (continuationText.toLowerCase().match(/\b(yes|y|do it|confirm)\b/i)) {
          // ✅ User confirmed! Proceed with deletion.
          const targetRepo = pendingTask.data.repoName;
          await PendingAction.deleteOne({ _id: pendingTask._id }); // Clear the pending state

          // A. Delete from GitHub (wrapped in try/catch so it doesn't crash if already deleted)
          try {
            const response = await fetch("http://localhost:5000/api/actions/delete-repo", {
              method: "POST",
              headers: backendHeaders,
              body: JSON.stringify({ name: targetRepo })
            });
            const result = await response.json();
            if (!response.ok && result.error !== "Not Found") throw new Error(result.error);
          } catch (err) {
            console.warn("GitHub deletion skipped or failed:", err.message);
          }

          // 🟢 B. NEW: Wipe the local folder permanently!
          try {
             const ROOT_WORKSPACE = path.resolve(process.cwd(), "..", "mcp_workspace");
             const folderPath = path.resolve(ROOT_WORKSPACE, targetRepo);
             
             // Recursively force delete the directory
             await fs.rm(folderPath, { recursive: true, force: true });
             
             // Remove the stale record from MongoDB
             if (workspace) {
                 await Repo.deleteOne({ workspaceId: workspace._id, localPath: new RegExp(targetRepo, 'i') });
             }
          } catch (cleanupErr) {
             console.error("Local cleanup error:", cleanupErr);
          }

          const aiText = await generateResponse({ 
             mode: "action", 
             action: "delete_repo", 
             toolResult: { status: "Successfully deleted from GitHub and local workspace", repo: targetRepo } 
          });
          return res.json({ success: true, aiResponse: aiText });
          
        } else {
          // ❌ User cancelled or said something else
          await PendingAction.deleteOne({ _id: pendingTask._id });
          return res.json({ success: true, aiResponse: "Deletion cancelled. Your repository is safe. 🛡️" });
        }
      }

      // 2. Initial Request (No pending task found)
      const repoName = parameters.name;
      if (!repoName) return res.json({ success: false, needsInput: true, aiResponse: "Which repository would you like to delete?", pendingAction: "delete_repo" });

      // Save the intent to the DB to await confirmation
      if (workspace) {
        await PendingAction.create({
          workspaceId: workspace._id,
          type: "delete_repo",
          stage: "awaiting_confirmation",
          data: { repoName }
        });
      }

      // Ask for confirmation (Updated wording)
      return res.json({ 
        success: false, 
        needsInput: true, 
        pendingAction: "delete_repo", 
        aiResponse: `⚠️ **HUMAN-IN-THE-LOOP AUTHORIZATION REQUIRED:**\n\nAre you absolutely sure you want to permanently delete the repository **\`${repoName}\`** from GitHub AND your local hard drive? This action cannot be undone.\n\nReply **"yes"** to confirm or **"no"** to cancel.` 
      });
    }

    // ------------------------------------------------------------------
    // 8️⃣ FILE OPERATIONS
    // ------------------------------------------------------------------
    
    // List Files
    if (resolvedAction === "list_files") {
      const path = req.body.path ?? parameters.path ?? ".";
      const response = await fetch("http://localhost:5000/api/files/list", {
        method: "POST",
        headers: backendHeaders,
        body: JSON.stringify({ path, workspaceId: req.workspaceId })
      });
      const files = await response.json();
      const aiText = await generateResponse({ mode: "file", action: "list_files", toolResult: files });
      return res.json({ success: true, aiResponse: aiText });
    }

    // Read File
    if (resolvedAction === "read_file") {
      const filePath = req.body.path ?? parameters.path;
      if (!filePath) {
        const aiText = await generateResponse({ mode: "clarification", action: "read_file", missing: ["file path"] });
        return res.json({ success: false, needsInput: true, pendingAction: "read_file", aiResponse: aiText });
      }

      const response = await fetch("http://localhost:5000/api/files/read", {
        method: "POST",
        headers: backendHeaders,
        body: JSON.stringify({ path: filePath })
      });

      const result = await response.json();
      if (!response.ok) {
        const errorText = await generateResponse({ mode: "error", action: "read_file", errorMessage: result.error || "File not found" });
        return res.json({ success: false, aiResponse: errorText });
      }

      const aiText = await generateResponse({ mode: "file", action: "read_file", toolResult: result.content });
      return res.json({ success: true, aiResponse: aiText, editorData: { path: filePath, content: result.content, hash: result.doc?.hash } });
    }

    // Write File + Create File (Aliased)
    // Write File + Create File (Aliased)
    if (resolvedAction === "write_file" || resolvedAction === "create_file") {
      const filePath = req.body.path ?? parameters.path;
      const content = req.body.content ?? parameters.content ?? ""; // 👈 ALLOW EMPTY CONTENT
      const incomingHash = req.body.hash ?? parameters.hash;

      // 👈 ONLY FAIL IF THE PATH IS MISSING
      if (!filePath) {
        const aiText = await generateResponse({ mode: "clarification", action: "write_file", missing: ["file path"] });
        return res.json({ success: false, needsInput: true, pendingAction: "write_file", aiResponse: aiText });
      }

      const response = await fetch("http://localhost:5000/api/files/write", {
        method: "POST",
        headers: backendHeaders,
        body: JSON.stringify({ path: filePath, content, incomingHash, workspaceId: req.workspaceId })
      });

      if (response.status === 409) {
        return res.json({ success: false, error: "CONFLICT", aiResponse: "Conflict detected: file modified elsewhere." });
      }

      const result = await response.json();
      // 🚨 NEW: Catch missing folders and other file system errors!
      if (!response.ok) {
        throw new Error(result.error || `Failed to write file to ${filePath}. Check if the folder exists.`);
      }
      // 🟢 NEW: Auto-switch the Active Repo so the next "push" targets the right folder!
      try {
        const workspace = await Workspace.findOne({ userId: req.userId });
        if (workspace) {
           const topLevelFolder = filePath.split('/')[0]; // Extract the root folder from path
           const activeRepo = await Repo.findOne({ workspaceId: workspace._id, localPath: new RegExp(topLevelFolder, 'i') });
           if (activeRepo) {
              await Workspace.findByIdAndUpdate(workspace._id, { activeRepoId: activeRepo._id });
           }
        }
      } catch (e) {
        console.warn("Failed to auto-switch active repo:", e.message);
      }
      const aiText = await generateResponse({ mode: "file", action: "write_file", toolResult: result.doc });
      // 🟢 NEW: Attach editorData so the frontend opens the tab automatically!
      return res.json({ 
        success: true, 
        aiResponse: aiText,
        editorData: { 
          path: filePath, 
          content: content || "", // Empty string if a new file
          hash: result.doc?.hash 
        }
      });
    }

    // Upload File
    if (resolvedAction === "upload_file") {
      const filename = req.body.filename ?? parameters.filename;
      const content_base64 = req.body.content_base64 ?? parameters.content_base64;
      if (!filename || !content_base64) {
        const aiText = await generateResponse({ mode: "clarification", action: "upload_file", missing: ["filename/content"] });
        return res.json({ success: false, needsInput: true, pendingAction: "upload_file", aiResponse: aiText });
      }

      const response = await fetch("http://localhost:5000/api/files/upload", {
        method: "POST",
        headers: backendHeaders,
        body: JSON.stringify({ filename, content_base64, workspaceId: req.workspaceId })
      });

      const result = await response.json();
      const aiText = await generateResponse({ mode: "file", action: "upload_file", toolResult: result });
      return res.json({ success: true, aiResponse: aiText });
    }

    // Default Fallback
    return res.status(400).json({ success: false, error: "Action not implemented" });

  } catch (err) {
    console.error("Action Error:", err.message);
    const aiText = await generateResponse({ mode: "error", action: resolvedAction, errorMessage: err.message });
    return res.status(500).json({ success: false, aiResponse: aiText });
  }
});

export default router;