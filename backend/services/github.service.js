import fetch from "node-fetch";
import { Octokit } from "@octokit/rest";
import { listFilesAndSync as listFilesService } from "./fs.service.js";


const GITHUB_API_BASE = "https://api.github.com";

/**
 * Common headers for GitHub API
 */
function githubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Accept": "application/vnd.github.v3+json",
    "Content-Type": "application/json"
  };
}

/**
 * 1️⃣ Create a new GitHub repository
 */
export async function createRepo(token, options) {
  const response = await fetch(`${GITHUB_API_BASE}/user/repos`, {
    method: "POST",
    headers: githubHeaders(token),
    body: JSON.stringify(options)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create repository");
  }

  return response.json();
}

/**
 * 2️⃣ Rename an existing repository
 */
export async function renameRepo(token, owner, oldName, newName) {
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${oldName}`,
    {
      method: "PATCH",
      headers: githubHeaders(token),
      body: JSON.stringify({ name: newName })
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to rename repository");
  }

  return response.json();
}

/**
 * Update repository settings (visibility, README)
 */
export async function updateRepo(token, owner, name, options) {
  // 1️⃣ Update visibility (PATCH repo)
  if (typeof options.private === "boolean") {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${name}`,
      {
        method: "PATCH",
        headers: githubHeaders(token),
        body: JSON.stringify({ private: options.private })
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to update repository visibility");
    }
  }

  // 2️⃣ Add README if requested
  if (options.add_readme) {
    const readmeResponse = await fetch(
      `${GITHUB_API_BASE}/repos/${owner}/${name}/contents/README.md`,
      {
        method: "PUT",
        headers: githubHeaders(token),
        body: JSON.stringify({
          message: "Add README",
          content: Buffer.from(`# ${name}\n`).toString("base64")
        })
      }
    );

    // Ignore error if README already exists
    if (!readmeResponse.ok && readmeResponse.status !== 422) {
      const error = await readmeResponse.json();
      throw new Error(error.message || "Failed to add README");
    }
  }

  // 3️⃣ Return updated repo
  const finalRepo = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${name}`,
    {
      headers: githubHeaders(token)
    }
  );

  return finalRepo.json();
}


/**
 * 3️⃣ Delete a repository
 */
export async function deleteRepo(token, owner, repoName) {
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repoName}`,
    {
      method: "DELETE",
      headers: githubHeaders(token)
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to delete repository");
  }

  // GitHub returns 204 No Content
  return { success: true };
}

/**
 * 4️⃣ List user repositories (GitHub source of truth)
 * (You may later prefer DB-backed listing)
 */
export async function listRepos(token) {
  const response = await fetch(`${GITHUB_API_BASE}/user/repos`, {
    headers: githubHeaders(token)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to list repositories");
  }

  return response.json();
}

/**
 * 5️⃣ Get details of a single repository
 */
export async function getRepoDetails(token, owner, repoName) {
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repoName}`,
    {
      headers: githubHeaders(token)
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to get repository details");
  }

  return response.json();
}

/**
 * 6️⃣ Check if repository exists
 */
export async function repoExists(token, owner, repoName) {
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${owner}/${repoName}`,
    {
      headers: githubHeaders(token)
    }
  );

  return response.status === 200;
}

// backend/services/git.service.js

export async function pullRepo(localPath, token) {
  const { default: simpleGit } = await import("simple-git");
  const git = simpleGit(localPath);
  const cleanToken = token.trim().replace(/\n|\r/g, "");

  try {
    // 1. Get the branch you are currently standing on
    const status = await git.status();
    const currentBranch = status.current; 

    // 2. Force a clean remote URL (This fixes the "Double Token" from yesterday)
    let remoteUrl = await git.remote(['get-url', 'origin']);
    const cleanBaseUrl = remoteUrl.trim().replace(/https:\/\/.*@github\.com/, "https://github.com");
    const authenticatedRemote = cleanBaseUrl.replace('https://', `https://${cleanToken}@`);
    
    await git.remote(['set-url', 'origin', authenticatedRemote]);

    // 3. Save local work so the pull doesn't fail due to "Uncommitted changes"
    if (status.files.length > 0) {
      await git.add(".");
      await git.commit("Auto-save before pull");
    }

    // 4. THE EXPLICIT PULL (Telling Git exactly what to do)
    console.log(`📡 Pulling origin/${currentBranch} into ${localPath}`);
    const pullResult = await git.pull('origin', currentBranch);
    
    // 5. Check for conflicts
    const statusAfter = await git.status();
    if (statusAfter.conflicted.length > 0) {
      return {
        success: false,
        error: "MERGE_CONFLICT",
        conflictedFiles: statusAfter.conflicted
      };
    }

    return {
      success: true,
      files: pullResult.files || [],
      summary: pullResult.summary || {}
    };

  } catch (err) {
    console.error("Git Pull Error:", err.message);
    return { success: false, error: err.message };
  }
}


export const getOctokit = (token) => {
    return new Octokit({ auth: token });
};

export const githubPRService = {
    // We use this to get the authenticated user's username (owner)
    getAuthenticatedUser: async (octokit) => {
        const { data } = await octokit.rest.users.getAuthenticated();
        return data.login;
    }
};

export const gitExtraService = {
  // LIST BRANCHES
  listBranches: async (localPath) => {
    const { default: simpleGit } = await import("simple-git");
    const git = simpleGit(localPath);
    const branches = await git.branch();
    return {
      current: branches.current,
      all: branches.all, // Array of branch names
      details: branches.branches // Object with details per branch
    };
  },

  // DELETE BRANCH
  // In gitExtraService.js

// ... existing code
deleteBranch: async (localPath, branchName) => {
  const { default: simpleGit } = await import("simple-git");
  const git = simpleGit(localPath);
  
  // 🟢 CHANGE: Add 'true' as the second argument to force delete (-D)
  // This bypasses the "not fully merged" check.
  return await git.deleteLocalBranch(branchName, true);
},

// 🟢 ADD: A method to handle the remote deletion via CLI if not using Octokit
pushDelete: async (localPath, branchName) => {
  const { default: simpleGit } = await import("simple-git");
  const git = simpleGit(localPath);
  return await git.push('origin', branchName, { '--delete': null });
},
  // LIST COMMITS
  listCommits: async (localPath, branch = null, limit = 10) => {
    const { default: simpleGit } = await import("simple-git");
    const git = simpleGit(localPath);
    
    // 🔍 1. If no branch is provided, ask Git what the HEAD is
    let targetBranch = branch;
    if (!targetBranch || targetBranch === 'undefined') {
        const branchInfo = await git.branch();
        targetBranch = branchInfo.current; // This gets the actual active branch (e.g., 'main' or 'work')
        console.log(`📡 No branch specified. Auto-detected current branch: ${targetBranch}`);
    }

    try {
        // 📜 2. Get the log for that specific branch
        const log = await git.log([targetBranch, `--max-count=${limit}`]);
        return log.all; 
    } catch (err) {
        console.error("Git Log Error:", err.message);
        return [];
    }
},

// Inside gitExtraService...
createBranch: async (localPath, branchName, checkout = true) => {
    const { default: simpleGit } = await import("simple-git");
    const git = simpleGit(localPath);

    try {
        // Check if branch exists
        const branchSummary = await git.branch();
        if (branchSummary.all.includes(branchName)) {
            throw new Error(`Branch '${branchName}' already exists.`);
        }

        // Create the branch. If checkout is true, it uses '-b' to switch immediately
        if (checkout) {
            await git.checkoutLocalBranch(branchName);
        } else {
            await git.branch([branchName]);
        }

        return { success: true, branch: branchName, checkedOut: checkout };
    } catch (err) {
        console.error("Git Create Branch Error:", err.message);
        throw err;
    }
}


};

// backend/services/git.service.js

export const createAndSwitchBranch = async (repoPath, branchName, workspaceId) => {
    if (!repoPath || !branchName) throw new Error("Path or Branch Name missing");

    const { default: simpleGit } = await import("simple-git");
    const git = simpleGit(repoPath); 

    try {
        const branchSummary = await git.branch();
        
        if (branchSummary.all.includes(branchName)) {
            await git.checkout(branchName);
        } else {
            await git.checkoutLocalBranch(branchName);
            
            // 🟢 THE SYNC FIX: Push the new branch to GitHub immediately
            // '-u' tracks the remote branch so future pulls work
            console.log(`📡 Syncing new branch ${branchName} to GitHub...`);
            await git.push(['-u', 'origin', branchName]);
        }

        const status = await git.status();
        const files = await listFilesService(workspaceId, repoPath);

        return { success: true, currentBranch: status.current, files };
    } catch (err) {
        throw new Error(`Git Branch Error: ${err.message}`);
    }
};