export const fileCapabilities = {
  list_files: {
    description: "List files in the MCP workspace",
    parameters: ["path"]
  },
   read_file: {
    description: "Read a text file from the MCP workspace",
    parameters: ["path"]
  },
   write_file: {
    description: "Write text content to a file in the MCP workspace (overwrite only)",
    parameters: ["path", "content"]
  },
  upload_file: {
    description: "Upload a file to the workspace uploads directory",
    parameters: ["filename", "content_base64"]
  },
};
