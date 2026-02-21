import simpleGit from "simple-git";
import path from "path";
import fs from "fs/promises";

// Helper to get git instance for the workspace
const getGit = (workspacePath) => simpleGit(workspacePath);
const WORKSPACE_ROOT = path.resolve(process.cwd(), "..", "mcp_workspace");

/**
 * Clones a repo into the mcp_workspace
 * @param {string} repoUrl - Public or private HTTPS URL
 * @param {string} folderName - (Optional) Destination folder name
 * @param {string} token - (Optional) GitHub token for private repos
 */
export async function cloneRepo(repoUrl, folderName, token) {
  // 1. Determine target path
  const targetName = folderName || repoUrl.split("/").pop().replace(".git", "");
  const localPath = path.resolve(WORKSPACE_ROOT, targetName);

  // 2. Handle Private Repos (Inject Token)
  let safeUrl = repoUrl;
  if (token && repoUrl.startsWith("https://github.com")) {
    // Inject token: https://TOKEN@github.com/user/repo.git
    safeUrl = repoUrl.replace("https://", `https://${token}@`);
  }

  // 3. Ensure workspace exists
  await fs.mkdir(WORKSPACE_ROOT, { recursive: true });

  // 4. Clone
  const git = simpleGit(WORKSPACE_ROOT);
  try {
    await git.clone(safeUrl, localPath);
    return { success: true, localPath, name: targetName };
  } catch (err) {
    // Robustness: If repo already exists, return success so the flow continues
    if (err.message.includes("already exists")) {
       return { success: true, localPath, name: targetName, note: "Repo already existed" };
    }
    throw new Error(`Clone failed: ${err.message}`);
  }
}

/**
 * 1. Initialize Git Identity (Required for CI/Bots)
 */
export async function ensureGitIdentity(workspacePath) {
  const git = getGit(workspacePath);
  const config = await git.listConfig();
  
  // Only set if missing to avoid overwriting user prefs
  if (!config.all["user.name"]) {
    await git.addConfig("user.name", "AI Assistant");
  }
  if (!config.all["user.email"]) {
    await git.addConfig("user.email", "ai-assistant@local.dev");
  }
}


/**
 * 2. The Smart Push (Dynamic Branch Detection & Rebase Recovery)
 */
export async function smartPush(workspacePath, message) {
  const git = getGit(workspacePath);

  try {
    const status = await git.status();
    const currentBranch = status.current || "main"; // Fallback to main if detached

    // 🧠 NEW: Detect if we are trapped in a suspended rebase!
    const rebaseMergePath = path.join(workspacePath, ".git", "rebase-merge");
    const rebaseApplyPath = path.join(workspacePath, ".git", "rebase-apply");
    let isRebasing = false;
    
    try { await fs.access(rebaseMergePath); isRebasing = true; } catch(e) {}
    try { await fs.access(rebaseApplyPath); isRebasing = true; } catch(e) {}

    if (isRebasing) {
      console.log("Detecting ongoing rebase. Resuming...");
      await git.add(".");
      // Continue rebase (bypass terminal editor popups)
      await git.env({ GIT_EDITOR: "true" }).rebase(["--continue"]);
      await git.push(["-u", "origin", currentBranch]);
      
      const log = await git.log({ maxCount: 1 });
      return { success: true, commitHash: log.latest.hash, branch: currentBranch };
    }

    // --- NORMAL PUSH FLOW ---
    
    // 2. Add & Commit (only if dirty)
    if (status.files.length > 0) {
      await git.add(".");
      await git.commit(message || "Auto-commit by AI");
    } else {
      console.log("No local changes to commit, proceeding to sync...");
    }

    // 3. Pull with Rebase (Safe Pull)
    try {
        await git.pull("origin", currentBranch, { "--rebase": "true" });
    } catch (pullErr) {
        // If it fails because the branch doesn't exist on GitHub yet, just ignore and proceed to push
        if (!pullErr.message.includes("couldn't find remote ref")) {
            throw pullErr;
        }
    }

    // 4. Push (Set upstream automatically)
    await git.push(["-u", "origin", currentBranch]);

    // 5. Get Latest Hash for DB
    const log = await git.log({ maxCount: 1 });
    const commitHash = log.latest.hash;

    return { success: true, commitHash, branch: currentBranch };

  } catch (error) {
    // 6. Conflict Detection
    if (error.message && error.message.includes("CONFLICT")) {
      const status = await git.status();
      return { 
        success: false, 
        error: "MERGE_CONFLICT", 
        conflictedFiles: status.conflicted 
      };
    }
    
    throw error;
  }
}
/**
 * 3. Switch or Create Branch
 */
export async function switchBranch(workspacePath, branchName) {
  const git = getGit(workspacePath);
  try {
    const branchSummary = await git.branch();
    const hasLocal = branchSummary.all.includes(branchName);

    // If it exists, check it out. If not, create and check it out (git checkout -b)
    if (hasLocal) {
      await git.checkout(branchName);
    } else {
      await git.checkoutLocalBranch(branchName); 
    }
    
    return { success: true, branch: branchName };
  } catch (err) {
    throw new Error(`Failed to switch branch: ${err.message}`);
  }
}