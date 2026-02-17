import Repo from "../models/Repo.js";
import Workspace from "../models/Workspace.js";
import { createRepo, renameRepo, deleteRepo,listRepos,getRepoDetails,repoExists,updateRepo,createBranch,ensureRepoInitialized,listBranches} from "../services/github.service.js";
import express from 'express'


const router = express.Router();


router.post("/create-repo", async (req, res, next) => {
  try {
    const { name, description, private: isPrivate } = req.body;
    const githubToken = req.headers["x-github-token"];

    if (!githubToken) {
      return res.status(401).json({ error: "Missing GitHub token" });
    }

    // 1️⃣ Ensure workspace exists
    let workspace = await Workspace.findOne({ userId: req.userId });

    if (!workspace) {
      workspace = await Workspace.create({
        userId: req.userId,
        rootPath: `/workspace/${req.userId}`
      });
    }

    // 2️⃣ Create GitHub repo
    const repo = await createRepo(githubToken, {
      name,
      description,
      private: Boolean(isPrivate)
    });

    // 3️⃣ Save Repo in DB (THIS IS WHY MODEL EXISTS)
    const repoDoc = await Repo.create({
      workspaceId: workspace._id,
      url: repo.html_url,
      branch: repo.default_branch,
      localPath: `${workspace.rootPath}/${repo.name}`,
      cloned: false,
      lastCommit: null
    });

    // 4️⃣ Respond to orchestrator
    res.json({
      success: true,
      name: repo.name,
      html_url: repo.html_url,
      branch: repo.default_branch
    });

  } catch (err) {
    next(err);
  }
});

router.post("/rename-repo", async (req, res, next) => {
  try {
    const { oldName, newName } = req.body;
    const token = req.headers["x-github-token"];

    const workspace = await Workspace.findOne({ userId: req.userId });

    const userRes = await fetch("https://api.github.com/user", {
      headers: { Authorization: `token ${token}` }
    });

    const userData = await userRes.json();
    const owner = userData.login; // This gets the real username (e.g., "Rairebsr")

    // 2️⃣ Use that dynamic owner instead of a hardcoded string
    const repo = await renameRepo(token, owner, oldName, newName);

    // 2️⃣ Best-effort DB sync (ONLY if workspace exists)
    if (workspace) {
      const updatedRepo = await Repo.findOneAndUpdate(
        {
          workspaceId: workspace._id,
          $or: [
            { localPath: `${workspace.rootPath}/${oldName}` },
            { url: repo.html_url }
          ]
        },
        {
          localPath: `${workspace.rootPath}/${repo.name}`,
          updatedAt: new Date()
        },
        { new: true }
      );

      if (!updatedRepo) {
        console.warn(
          `Repo renamed on GitHub but not found in DB: ${oldName}`
        );
      }
    } else {
      console.warn(
        `Workspace not found for user ${req.userId}. Skipping DB sync.`
      );
    }

    // 3️⃣ ALWAYS return success if GitHub succeeded
    return res.json({
      success: true,
      name: repo.name,
      html_url: repo.html_url
    });

  } catch (err) {
    next(err);
  }
});


// Helper to get username from token
async function getGitHubUsername(token) {
  const response = await fetch("https://api.github.com/user", {
    headers: { Authorization: `token ${token}` }
  });
  if (!response.ok) throw new Error("Could not verify GitHub user");
  const data = await response.json();
  return data.login;
}

// 1️⃣ Refactored Delete Repo
router.post("/delete-repo", async (req, res, next) => {
  try {
    const { name } = req.body;
    const token = req.headers["x-github-token"];

    if (!token) return res.status(401).json({ error: "Missing GitHub token" });

    // Get dynamic owner
    const owner = await getGitHubUsername(token);

    const workspace = await Workspace.findOne({ userId: req.userId });

    // Use the dynamic owner instead of "Rairebsr"
    await deleteRepo(token, owner, name);

    // ❌ REMOVE FROM DB
    if (workspace) {
      await Repo.deleteOne({
        workspaceId: workspace._id,
        localPath: `${workspace.rootPath}/${name}`
      });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// 2️⃣ Refactored Repo Exists
// Note: This one checks your LOCAL DB. If you want to check GITHUB, 
// you should use the owner as well.
router.post("/repo-exists", async (req, res, next) => {
  try {
    const { name } = req.body;
    const token = req.headers["x-github-token"];
    
    // 1. Get the dynamic owner (e.g., "new21ray")
    const owner = await getGitHubUsername(token);

    // 2. Check GitHub API (Source of Truth)
    const existsOnGithub = await repoExists(token, owner, name);

    // 3. Check DB using the persistent owner ID
    const workspace = await Workspace.findOne({ userId: owner });
    const existsInDb = workspace ? await Repo.exists({ 
      workspaceId: workspace._id, 
      url: new RegExp(name, 'i') 
    }) : false;

    res.json({ 
      exists: existsOnGithub, 
      isTracked: !!existsInDb 
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/actions/list-github-repos
router.get("/list-github-repos", async (req, res, next) => {
  try {
    const token = req.headers["x-github-token"];
    if (!token) {
      return res.status(401).json({ error: "Missing GitHub token" });
    }

    const repos = await listRepos(token);

    res.json(
      repos.map(r => ({
        name: r.name,
        full_name: r.full_name,
        private: r.private,
        description: r.description,
        url: r.html_url,
        default_branch: r.default_branch
      }))
    );
  } catch (err) {
    next(err);
  }
});



// 1️⃣ Dynamic Update Repo
router.post("/update-repo", async (req, res, next) => {
  try {
    const { name, private: isPrivate, add_readme } = req.body;
    const token = req.headers["x-github-token"];

    if (!token) return res.status(401).json({ error: "Missing GitHub token" });

    // Fetch the real owner name from GitHub
    const owner = await getGitHubUsername(token);

    const repo = await updateRepo(
      token,
      owner, // Dynamic owner
      name,
      {
        private: isPrivate,
        add_readme
      }
    );

    res.json({
      name: repo.name,
      html_url: repo.html_url,
      private: repo.private,
      description: repo.description
    });

  } catch (err) {
    next(err);
  }
});

// 2️⃣ Dynamic Get Repo Details
router.post("/get-repo-details", async (req, res, next) => {
  try {
    const { name } = req.body;
    const token = req.headers["x-github-token"];

    if (!token) return res.status(401).json({ error: "Missing GitHub token" });

    const workspace = await Workspace.findOne({ userId: req.userId });
    if (!workspace) throw new Error("Workspace not found for this user");

    // Fetch the real owner name from GitHub
    const owner = await getGitHubUsername(token);

    // DB lookup for local status
    const repoDoc = await Repo.findOne({
      workspaceId: workspace._id,
      localPath: `${workspace.rootPath}/${name}`
    });

    // Verify from GitHub using the dynamic owner
    const repo = await getRepoDetails(token, owner, name);

    res.json({
      name: repo.name,
      url: repo.html_url,
      description: repo.description,
      private: repo.private,
      branch: repo.default_branch,
      tracked: !!repoDoc
    });

  } catch (err) {
    next(err);
  }
});

//branch routes

// 🚀 Create Branch Route
router.post("/create-branch", async (req, res, next) => {
  try {
    const { repo: repoName, name: branchName, source = "main" } = req.body;
    const token = req.headers["x-github-token"];

    if (!token) return res.status(401).json({ error: "Missing GitHub token" });

    // 1️⃣ Get dynamic owner
    const owner = await getGitHubUsername(token);

    // 🛡️ THE SAFETY CHECK: Ensure there is at least one commit
    const isReady = await ensureRepoInitialized(token, owner, repoName);
    
    if (!isReady) {
        throw new Error("Could not initialize repository. Please add a file manually first.");
    }

    // 2️⃣ Call GitHub Service to create the branch
    
    const githubBranch = await createBranch(token, owner, repoName, branchName, source);

    // 3️⃣ Update MongoDB to track the new branch and current state
    const workspace = await Workspace.findOne({ userId: req.userId });
    
    if (workspace) {
      const updatedRepo = await Repo.findOneAndUpdate(
        { 
          workspaceId: workspace._id, 
          url: new RegExp(repoName, 'i') 
        },
        { 
          $addToSet: { branches: branchName }, // Add to list of known branches
          currentBranch: branchName           // Switch active branch context
        },
        { new: true }
      );

      if (!updatedRepo) {
        console.warn(`Branch created on GitHub but Repo doc not found for: ${repoName}`);
      }
    }

    // 4️⃣ Respond to orchestrator
    res.json({
      success: true,
      repo: repoName,
      branch: branchName,
      source: source,
      ref: githubBranch.ref
    });

  } catch (err) {
    next(err);
  }
});

router.get("/list-branches/:repo", async (req, res, next) => {
    try {
        const { repo } = req.params;
        const token = req.headers["x-github-token"];
        const owner = await getGitHubUsername(token);

        const branches = await listBranches(token, owner, repo);
        
        // Return just the names for the AI to read easily
        res.json({ success: true, branches: branches.map(b => b.name) });
    } catch (err) {
        next(err);
    }
});

router.post("/switch-branch", async (req, res, next) => {
    try {
        const { repo: repoName, name: branchName } = req.body;
        const token = req.headers["x-github-token"];
        
        // 1. Try DB first (Fast)
        let repoDoc = await Repo.findOne({ name: new RegExp(`^${repoName}$`, 'i') });

        // 2. If missing, don't throw an error! Check GitHub (Self-Healing)
        if (!repoDoc) {
            console.log(`🔍 Repo ${repoName} not in DB. Discovering...`);
            const owner = await getGitHubUsername(token); // Your helper
            
            const gitRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}`, {
                headers: { Authorization: `token ${token}` }
            });

            if (gitRes.ok) {
                const gData = await gitRes.json();
                // 3. Automatically "Learn" the new repo
                repoDoc = await Repo.create({
                    workspaceId: req.workspaceId, // From your session/auth
                    name: gData.name,
                    url: gData.html_url,
                    currentBranch: gData.default_branch,
                    cloned: false // Mark for later cloning
                });
            }
        }

        if (!repoDoc) throw new Error("Repository not found anywhere.");

        // 4. Update state
        repoDoc.currentBranch = branchName;
        await repoDoc.save();

        res.json({ success: true, message: `Switched to ${branchName}` });
    } catch (err) {
        next(err);
    }
});


export default router;