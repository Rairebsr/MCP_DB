import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import { listFilesTool } from "./tools/list_files.js";

const server = new Server(
  {
    name: "file-mcp-server",
    version: "0.1.0",
  },
  {
    tools: {
      list_files: listFilesTool,
    },
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
