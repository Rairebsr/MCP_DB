import fetch from "node-fetch";

/**
 * Service to fetch user repositories from GitHub
 */
export async function listRepos(token) {
    const response = await fetch("https://api.github.com/user/repos", {
        headers: {
            Authorization: `Bearer ${token}`,
            "Accept": "application/vnd.github.v3+json"
        }
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to list repositories");
    }

    return await response.json();
}

/**
 * Service to create a new GitHub repository
 */
export async function createRepo(token, options) {
  const response = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept": "application/vnd.github.v3+json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(options)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create repository");
  }

  return response.json();
}
/* service to rename an exsisting repo */
export async function renameRepo(token, owner, oldName, newName) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${oldName}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json"
      },
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
 * Service to create a new branch from a source (defaults to main)
 */
export async function createBranch(token, owner, repo, branchName, source = "main") {
    // 1. Get the SHA of the source branch
    const refResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${source}`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
                "Accept": "application/vnd.github.v3+json"
            }
        }
    );

    if (!refResponse.ok) {
        throw new Error(`Source branch '${source}' not found.`);
    }

    const refData = await refResponse.json();
    const sha = refData.object.sha;

    // 2. Create the new reference
    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/refs`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Accept": "application/vnd.github.v3+json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                ref: `refs/heads/${branchName}`,
                sha: sha
            })
        }
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create branch");
    }

    return await response.json();
}

/**
 * Service to list all branches in a repository
 */
export async function listBranches(token, owner, repo) {
    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/branches`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
                "Accept": "application/vnd.github.v3+json"
            }
        }
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to list branches");
    }

    return await response.json();
}

/**
 * Service to delete a branch
 */
export async function deleteBranch(token, owner, repo, branchName) {
    const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branchName}`,
        {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${token}`,
                "Accept": "application/vnd.github.v3+json"
            }
        }
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to delete branch");
    }

    return { success: true };
}
