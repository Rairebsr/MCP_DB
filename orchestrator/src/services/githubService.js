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
