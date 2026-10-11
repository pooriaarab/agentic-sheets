# agentic-sheets rules

These rules bind every run of agentic-sheets. They also bind
agents that drive this pack over MCP.

1. Preview before you act. Run each mirror with dry run first.
2. Respect guards. A denied call stays denied.
3. Report failures as failures. Adapters throw, and callers surface
   the error. No silent success follows a failed call.
4. Count the cost. Read the cost report before you close a task.
5. Keep quiet hours. The pack refuses mirrors inside the window.

Pack: Mirror a local store to and from Google Sheets. Keywords: google-sheets, sync, agentic-suite, claude-code, codex, cli, mcp.
