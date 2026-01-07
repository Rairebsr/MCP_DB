export const listFilesTool = {
  description: "List files and directories in a workspace path",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Relative path inside workspace",
        default: ".",
      },
    },
  },
  async execute({ path = "." }) {
    const dirPath = resolveSafePath(path);
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    return entries.map(e => ({
      name: e.name,
      type: e.isDirectory() ? "directory" : "file",
    }));
  },
};
