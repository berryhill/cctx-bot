# Tool Usage Guidelines

## Critical Tool Usage Rules

### Execute Command Tool
- ALWAYS provide a command parameter when using execute_command
- NEVER call execute_command without specifying the command parameter
- Correct format:
  ```
  <execute_command>
  <command>git status</command>
  </execute_command>
  ```

### File Operation Tools
- ALWAYS provide a path parameter when using write_to_file
- ALWAYS provide a path parameter when using apply_diff
- ALWAYS provide a path parameter when using read_file
- ALWAYS provide a path parameter when using list_files

### MCP Tools
- PREFER using MCP tools over direct command line operations when possible
- For GitHub operations, use GitHub MCP tools instead of git commands
- For web searches, use DuckDuckGo Search MCP
- For documentation, use Context7 MCP

## MCP Usage Examples

### GitHub MCP
```
<use_mcp_tool>
<server_name>github</server_name>
<tool_name>get_issue</tool_name>
<arguments>
{
  "owner": "repository-owner",
  "repo": "repository-name",
  "issue_number": 123
}
</arguments>
</use_mcp_tool>
```

### DuckDuckGo Search MCP
```
<use_mcp_tool>
<server_name>ddg-search</server_name>
<tool_name>search</tool_name>
<arguments>
{
  "query": "search query",
  "max_results": 5
}
</arguments>
</use_mcp_tool>
```

### Context7 MCP
```
<use_mcp_tool>
<server_name>context7</server_name>
<tool_name>get-library-docs</tool_name>
<arguments>
{
  "context7CompatibleLibraryID": "/library-id",
  "topic": "topic-name"
}
</arguments>
</use_mcp_tool>
```

## Git Operations Examples

### Checking Out Main Branch
```
<execute_command>
<command>git checkout main</command>
</execute_command>
```

### Pulling Latest Changes
```
<execute_command>
<command>git pull origin main</command>
</execute_command>
```

### Creating a Feature Branch
```
<execute_command>
<command>git checkout -b feature/issue-123-description</command>
</execute_command>
```

### Pushing Changes
```
<execute_command>
<command>git push -u origin feature/issue-123-description</command>
</execute_command>