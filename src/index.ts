#!/usr/bin/env node
// Load environment variables from .env file
import * as dotenv from "dotenv";
dotenv.config();

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerOpenApiTools } from "./service/openapi-service.js";
import { authService } from "./service/auth-service.js";

/**
 * Check if required environment variables are set for eBay API authentication
 */
function checkEnvironmentVariables(): void {
  const errors = authService.getStartupErrors();
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
}

/**
 * Main function to initialize and run the eBay API MCP Server
 * This server exposes eBay API endpoints as MCP tools for access via AI models
 */
async function main(): Promise<void> {
  console.error("Starting eBay API MCP Server...");
  // Check for required environment variables
  checkEnvironmentVariables();
  const server = initServer();

  try {
    // Register the OpenAPI tools with the server
    await registerOpenApiTools(server);
    console.error("Successfully registered OpenAPI tools");

    // Create and connect server transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("eBay API MCP Server running on stdio transport");

  } catch (error) {
    console.error("Error starting MCP server:", error instanceof Error ? error.message : String(error));
    console.error("Stack trace:", error instanceof Error ? error.stack : "No stack trace available");
    process.exit(1);
  }
}

// Run the server
main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  console.error("Stack trace:", error instanceof Error ? error.stack : "No stack trace available");
  process.exit(1);
});


// Create MCP server instance
function initServer(): McpServer {
  return new McpServer({
    name: "ebay-api-mcp-server",
    version: "1.0.0",
    capabilities: {
      resources: {},
      tools: {},
    },
  });
}
