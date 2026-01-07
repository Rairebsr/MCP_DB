import express from "express";
import { listRepos, createRepo } from "../services/githubService.js";
import { githubCapabilities } from "../capabilities/githubCapabilities.js";
import { renameRepo } from "../services/githubService.js";
import { listFiles, readFile } from "../services/fileService.js";
import { fileCapabilities } from "../capabilities/fileCapabilities.js";
import { writeFile } from "../services/fileService.js";
import { uploadFile } from "../services/fileService.js";

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

    if (resolvedAction === "list_repos") {
      result = await listRepos(token);
      return res.json({ success: true, repositories: result });
    }

    if (resolvedAction === "create_repo") {
      if (!name) {
        return res.status(400).json({
          success: false,
          error: "Repository name is required"
        });
      }

      const repoName = normalizeRepoName(name);

      result = await createRepo(token, {
        name: repoName,
        description,
        private: Boolean(isPrivate),
        auto_init: Boolean(initialize_with_readme),
        gitignore_template,
        license_template,
        has_issues: has_issues ?? true,
        has_projects: has_projects ?? true,
        has_wiki: has_wiki ?? true
      });

      return res.json({
        success: true,
        repo: {
          name: result.name,
          url: result.html_url,
          private: result.private,
          description: result.description
        }
      });
    }

    if (resolvedAction === "rename_repo") {
  const oldName =
  req.body.old_name ??
  req.body.current_name ??
  req.body.repo_name ??
  req.body.parameters?.old_name ??
  req.body.parameters?.current_name ??
  req.body.parameters?.repo_name;

const newName =
  req.body.new_name ??
  req.body.parameters?.new_name;


  if (!oldName || !newName) {
    return res.status(400).json({
      success: false,
      error: "Both old_name and new_name are required"
    });
  }
  
  const normalizedOld = normalizeRepoName(oldName);
  const normalizedNew = normalizeRepoName(newName);

  const owner = req.user?.login || "Rairebsr"; // or fetch from token

  const result = await renameRepo(
    token,
    owner,
    normalizedOld,
    normalizedNew
  );

  return res.json({
    success: true,
    repo: {
      old: normalizedOld,
      new: result.name,
      url: result.html_url
    }
  });
}
    if (resolvedAction === "list_files") {
    const path =
      req.body.path ??
      parameters.path ??
      ".";

    const files = await listFiles(path);

    return res.json({
      success: true,
      files
    });
}
    if (resolvedAction === "read_file") {
    const path =
      req.body.path ??
      parameters.path;

    const content = await readFile(path);

    return res.json({
      success: true,
      content
    });
}
    if (resolvedAction === "write_file") {
  const filePath =
    req.body.path ??
    parameters.path;

  const content =
    req.body.content ??
    parameters.content;

  const result = await writeFile(filePath, content);

  return res.json({
    success: true,
    result
  });
}
    if (resolvedAction === "upload_file") {
  const filename =
    req.body.filename ?? parameters.filename;
  const content_base64 =
    req.body.content_base64 ?? parameters.content_base64;

  const result = await uploadFile(filename, content_base64);

  return res.json({ success: true, result });
}

    return res.status(400).json({
      success: false,
      error: "Action not implemented"
    });

  } catch (err) {
    console.error("GitHub error:", err.message);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
