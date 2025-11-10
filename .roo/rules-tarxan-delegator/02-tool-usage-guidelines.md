# Tool Usage Guidelines for Delegator Agent

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

## GitHub MCP Examples

### Creating a GitHub Issue
```
<use_mcp_tool>
<server_name>github</server_name>
<tool_name>create_issue</tool_name>
<arguments>
{
  "owner": "repository-owner",
  "repo": "repository-name",
  "title": "Implement feature X",
  "body": "Detailed description of the feature to implement",
  "labels": ["enhancement"]
}
</arguments>
</use_mcp_tool>
```

### Getting Issue Details
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

### Adding a Comment to an Issue
```
<use_mcp_tool>
<server_name>github</server_name>
<tool_name>add_issue_comment</tool_name>
<arguments>
{
  "owner": "repository-owner",
  "repo": "repository-name",
  "issue_number": 123,
  "body": "This issue has been broken down into the following tasks..."
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