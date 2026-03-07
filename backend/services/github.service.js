import fetch from "node-fetch";

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
